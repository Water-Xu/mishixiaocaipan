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

async function getTeamMemberIds(openid) {
  if (!openid) return []
  const userRes = await db.collection('users').doc(openid).field({ companyId: true }).get().catch(() => null)
  const companyId = userRes?.data?.companyId
  if (!companyId) return []
  const compRes = await db.collection('companies').doc(companyId).field({ memberIds: true }).get().catch(() => null)
  return compRes?.data?.memberIds || []
}

async function fetchTeamReviews(memberIds, baseWhere, orderField, orderDir, skip, limit) {
  if (!memberIds.length) return []

  const cmp = orderDir === 'asc'
    ? (a, b) => a - b
    : (a, b) => b - a
  const sortFn = (list) => list.sort((a, b) => {
    const va = orderField === 'score' ? (a.score || 0) : toMillis(a.createdAt)
    const vb = orderField === 'score' ? (b.score || 0) : toMillis(b.createdAt)
    return cmp(va, vb)
  })

  const buildWhere = (ids) => {
    const w = { userId: _.in(ids) }
    if (baseWhere.merchantId) w.merchantId = baseWhere.merchantId
    if (baseWhere.userId) w.userId = baseWhere.userId
    return w
  }

  if (memberIds.length <= 30) {
    try {
      const res = await db.collection('reviews')
        .where(buildWhere(memberIds))
        .orderBy(orderField, orderDir)
        .skip(skip)
        .limit(limit)
        .get()
      return res.data || []
    } catch (e) {
      console.warn('team reviews query failed:', e.message)
      return []
    }
  }

  let all = []
  for (let i = 0; i < memberIds.length; i += 30) {
    const chunk = memberIds.slice(i, i + 30)
    try {
      const res = await db.collection('reviews').where(buildWhere(chunk)).limit(200).get()
      all.push(...(res.data || []))
    } catch (e) {
      console.warn('team reviews batch failed:', e.message)
    }
  }
  return sortFn(all).slice(skip, skip + limit)
}

exports.main = async (event, context) => {
  const { merchantId, userId, sortBy = 'latest', page = 1, pageSize = 10 } = event
  const skip = (page - 1) * pageSize
  const wxContext = cloud.getWXContext()
  const currentOpenid = wxContext.OPENID || ''

  try {
    const memberIds = await getTeamMemberIds(currentOpenid)
    if (!memberIds.length) return { code: 0, list: [] }

    const where = {}
    if (merchantId) where.merchantId = merchantId
    if (userId) where.userId = userId

    let orderField = 'createdAt'
    let orderDir = 'desc'
    if (sortBy === 'bad') { orderField = 'score'; orderDir = 'asc' }
    else if (sortBy === 'hot') { orderField = 'score'; orderDir = 'desc' }

    let reviews = await fetchTeamReviews(memberIds, where, orderField, orderDir, skip, pageSize)

    if (!reviews.length) return { code: 0, list: [] }

    const userIds = [...new Set(reviews.map(r => r.userId))].filter(Boolean)
    let userMap = {}
    if (userIds.length) {
      const usersRes = await db.collection('users')
        .where({ _id: _.in(userIds) })
        .field({ nickName: true, avatarUrl: true })
        .get()
      usersRes.data.forEach(u => { userMap[u._id] = u })
    }

    const merchantIds = [...new Set(reviews.map(r => r.merchantId))].filter(Boolean)
    let merchantMap = {}
    if (merchantIds.length) {
      try {
        const merchantsRes = await db.collection('merchants')
          .where({ _id: _.in(merchantIds) })
          .field({ name: true })
          .get()
        merchantsRes.data.forEach(m => { merchantMap[m._id] = m })
      } catch (e) { /* skip */ }
    }

    const reviewIds = reviews.map(r => r._id).filter(Boolean)
    let interactions = []
    if (reviewIds.length) {
      for (let i = 0; i < reviewIds.length; i += 20) {
        const chunk = reviewIds.slice(i, i + 20)
        try {
          const ir = await db.collection('review_interactions')
            .where({ reviewId: _.in(chunk) })
            .limit(1000)
            .get()
          interactions.push(...(ir.data || []))
        } catch (e) {
          console.warn('review_interactions query:', e.message)
        }
      }
    }

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
      } catch (e) { /* skip */ }
    }

    const byReview = {}
    interactions.forEach(it => {
      if (!byReview[it.reviewId]) byReview[it.reviewId] = []
      byReview[it.reviewId].push(it)
    })

    const list = reviews.map(r => {
      const items = byReview[r._id] || []
      const likes = items.filter(x => x.type === 'like')
      const comments = items.filter(x => x.type === 'comment').sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      const challenges = items.filter(x => x.type === 'challenge')
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      const interactionComments = comments.slice(0, 8).map(c => ({
        _id: c._id,
        content: c.content,
        userId: c.userId,
        userNickName: userMap[c.userId]?.nickName || '食客',
        createdAt: c.createdAt
      }))
      const interactionChallenges = challenges.slice(0, 5).map(c => ({
        _id: c._id,
        content: c.content,
        userId: c.userId,
        userNickName: userMap[c.userId]?.nickName || '食客',
        createdAt: c.createdAt
      }))
      return {
        ...r,
        userNickName: userMap[r.userId]?.nickName || '匿名食客',
        userAvatarUrl: userMap[r.userId]?.avatarUrl || '',
        merchantName: merchantMap[r.merchantId]?.name || '',
        likeCount: likes.length,
        likedByMe: currentOpenid ? likes.some(x => x.userId === currentOpenid) : false,
        commentCount: comments.length,
        challengeCount: challenges.length,
        interactionComments,
        interactionChallenges
      }
    })

    return { code: 0, list }
  } catch (err) {
    console.error('getReviews error:', err)
    return { code: 0, list: [] }
  }
}
