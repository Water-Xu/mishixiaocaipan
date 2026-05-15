const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    // 本月时间范围
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // 本月所有评价（集合不存在时返回空）
    let reviews = []
    try {
      const reviewsRes = await db.collection('reviews')
        .where({ createdAt: _.gte(monthStart).and(_.lte(monthEnd)) })
        .get()
      reviews = reviewsRes.data || []
    } catch (e) {
      reviews = []
    }

    if (!reviews.length) {
      return {
        code: 0,
        ranking: {
          badTop: [],
          goodTop: [],
          topReviewer: null,
          totalReviews: 0,
          totalMerchants: 0,
          avgSpend: '--'
        }
      }
    }

    // 统计每个商家的好评/差评数量和平均分
    const merchantStats = {}
    reviews.forEach(r => {
      if (!merchantStats[r.merchantId]) {
        merchantStats[r.merchantId] = {
          merchantId: r.merchantId,
          total: 0,
          badCount: 0,
          goodCount: 0,
          scoreSum: 0,
          badQuotes: [],
          goodQuotes: []
        }
      }
      const s = merchantStats[r.merchantId]
      s.total++
      s.scoreSum += r.score
      if (r.score <= 2) {
        s.badCount++
        s.badQuotes.push(r.content?.slice(0, 20) || '')
      } else if (r.score >= 4) {
        s.goodCount++
        s.goodQuotes.push(r.content?.slice(0, 20) || '')
      }
    })

    // 获取商家名称
    const merchantIds = Object.keys(merchantStats)
    const merchantsRes = await db.collection('merchants')
      .where({ _id: _.in(merchantIds) })
      .field({ name: true })
      .get()
    const merchantNameMap = {}
    merchantsRes.data.forEach(m => { merchantNameMap[m._id] = m.name })

    // 踩雷 TOP 3
    const badTop = Object.values(merchantStats)
      .filter(s => s.badCount > 0)
      .sort((a, b) => b.badCount - a.badCount)
      .slice(0, 3)
      .map(s => ({
        _id: s.merchantId,
        merchantName: merchantNameMap[s.merchantId] || '未知商家',
        badCount: s.badCount,
        topBadQuote: s.badQuotes[0] || ''
      }))

    // 好评 TOP 5
    const goodTop = Object.values(merchantStats)
      .filter(s => s.goodCount > 0)
      .sort((a, b) => (b.scoreSum / b.total) - (a.scoreSum / a.total))
      .slice(0, 5)
      .map(s => ({
        _id: s.merchantId,
        merchantName: merchantNameMap[s.merchantId] || '未知商家',
        avgScore: (s.scoreSum / s.total).toFixed(1),
        goodCount: s.goodCount,
        topGoodQuote: s.goodQuotes[0] || ''
      }))

    // 最敬业评论员
    const reviewerCount = {}
    reviews.forEach(r => {
      reviewerCount[r.userId] = (reviewerCount[r.userId] || 0) + 1
    })
    const topReviewerId = Object.entries(reviewerCount).sort((a, b) => b[1] - a[1])[0]?.[0]
    let topReviewer = null
    if (topReviewerId) {
      const userRes = await db.collection('users').doc(topReviewerId).get().catch(() => null)
      if (userRes?.data) {
        topReviewer = {
          nickName: userRes.data.nickName,
          avatarUrl: userRes.data.avatarUrl,
          count: reviewerCount[topReviewerId]
        }
      }
    }

    // 本月消费统计（从 orders 集合）
    const ordersRes = await db.collection('orders')
      .where({ orderedAt: _.gte(monthStart).and(_.lte(monthEnd)) })
      .field({ totalAmount: true, userId: true })
      .get()
    const totalSpend = ordersRes.data.reduce((s, o) => s + (o.totalAmount || 0), 0)
    const uniqueUsers = new Set(ordersRes.data.map(o => o.userId)).size
    const avgSpend = uniqueUsers > 0 ? (totalSpend / uniqueUsers).toFixed(0) : '--'

    return {
      code: 0,
      ranking: {
        badTop,
        goodTop,
        topReviewer,
        totalReviews: reviews.length,
        totalMerchants: merchantIds.length,
        avgSpend
      }
    }
  } catch (err) {
    console.error('getRanking error:', err)
    return { code: -1, message: '榜单统计失败' }
  }
}
