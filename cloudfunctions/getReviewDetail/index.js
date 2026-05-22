const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const toMillis = (d) => {
  if (!d) return 0
  try {
    if (d instanceof Date) return d.getTime()
    if (typeof d === 'object' && d.$date) return new Date(d.$date).getTime()
    return new Date(d).getTime()
  } catch (_) {
    return 0
  }
}

async function getReviewInteractions(reviewId) {
  try {
    const res = await db.collection('review_interactions').where({ reviewId }).limit(1000).get()
    return res.data || []
  } catch (e) {
    console.warn('review_interactions query:', e.message || e)
    return []
  }
}

async function findRelatedOrder(review) {
  try {
    const res = await db.collection('orders')
      .where({ userId: review.userId, merchantId: review.merchantId })
      .orderBy('orderedAt', 'desc')
      .limit(5)
      .get()
    const orders = res.data || []
    if (!orders.length) return null
    const reviewTime = toMillis(review.createdAt)
    let best = orders[0]
    let bestDiff = Math.abs(toMillis(best.orderedAt) - reviewTime)
    for (const o of orders) {
      const diff = Math.abs(toMillis(o.orderedAt) - reviewTime)
      if (diff < bestDiff) {
        best = o
        bestDiff = diff
      }
    }
    if (bestDiff > 7 * 24 * 60 * 60 * 1000) return null
    return best
  } catch (e) {
    console.warn('orders query:', e.message || e)
    return null
  }
}

async function getTeamMemberIds(openid) {
  if (!openid) return []
  const userRes = await db.collection('users').doc(openid).field({ companyId: true }).get().catch(() => null)
  const companyId = userRes?.data?.companyId
  if (!companyId) return []
  const compRes = await db.collection('companies').doc(companyId).field({ memberIds: true }).get().catch(() => null)
  return compRes?.data?.memberIds || []
}

exports.main = async (event) => {
  const { reviewId } = event
  const wxContext = cloud.getWXContext()
  const currentOpenid = wxContext.OPENID || ''

  if (!reviewId) return { code: -1, message: '缺少评价 ID' }

  try {
    const reviewDoc = await db.collection('reviews').doc(reviewId).get().catch(() => null)
    if (!reviewDoc?.data) return { code: 404, message: '评价不存在' }
    const review = reviewDoc.data

    const memberIds = await getTeamMemberIds(currentOpenid)
    if (!memberIds.length || !memberIds.includes(review.userId)) {
      return { code: 403, message: '无权查看该评价' }
    }

    let merchant = null
    if (review.merchantId) {
      try {
        const mRes = await db.collection('merchants').doc(review.merchantId).get()
        merchant = mRes.data || null
      } catch (_) { /* skip */ }
    }

    let userMap = {}
    const userIds = [review.userId].filter(Boolean)
    if (userIds.length) {
      const usersRes = await db.collection('users')
        .where({ _id: _.in(userIds) })
        .field({ nickName: true, avatarUrl: true })
        .get()
      usersRes.data.forEach(u => { userMap[u._id] = u })
    }

    const interactions = await getReviewInteractions(reviewId)
    const likes = interactions.filter(x => x.type === 'like')
    const comments = interactions.filter(x => x.type === 'comment')
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    const challenges = interactions.filter(x => x.type === 'challenge')
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))

    const extraUids = [...new Set(interactions.map(x => x.userId).filter(uid => uid && !userMap[uid]))]
    for (let i = 0; i < extraUids.length; i += 20) {
      const chunk = extraUids.slice(i, i + 20)
      if (!chunk.length) continue
      try {
        const ur = await db.collection('users')
          .where({ _id: _.in(chunk) })
          .field({ nickName: true, avatarUrl: true })
          .get()
        ur.data.forEach(u => { userMap[u._id] = u })
      } catch (_) { /* skip */ }
    }

    const mapInteraction = (c) => ({
      _id: c._id,
      content: c.content,
      userId: c.userId,
      userNickName: userMap[c.userId]?.nickName || '食客',
      createdAt: c.createdAt
    })

    let orderItems = Array.isArray(review.orderItems) ? review.orderItems : []
    let totalAmount = review.totalAmount
    if (!orderItems.length && (totalAmount === undefined || totalAmount === null)) {
      const order = await findRelatedOrder(review)
      if (order) {
        orderItems = Array.isArray(order.items) ? order.items : []
        totalAmount = order.totalAmount
      }
    }

    const detail = {
      ...review,
      _id: reviewId,
      userNickName: userMap[review.userId]?.nickName || '匿名食客',
      userAvatarUrl: userMap[review.userId]?.avatarUrl || '',
      merchantName: merchant?.name || '',
      merchantCategory: merchant?.category || '',
      merchantAvgScore: merchant?.avgScore,
      orderItems,
      totalAmount: totalAmount ?? null,
      likeCount: likes.length,
      likedByMe: currentOpenid ? likes.some(x => x.userId === currentOpenid) : false,
      commentCount: comments.length,
      challengeCount: challenges.length,
      interactionComments: comments.map(mapInteraction),
      interactionChallenges: challenges.map(mapInteraction)
    }

    return { code: 0, review: detail, merchant }
  } catch (err) {
    console.error('getReviewDetail error:', err)
    return { code: -1, message: '加载失败，稍后再试' }
  }
}
