const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/** 云函数端分页拉取，避免默认 100 条上限导致统计偏小 */
async function fetchAllInMonth(collectionName, dateField, monthStart, monthEnd) {
  const batch = 500
  let skip = 0
  const all = []
  for (;;) {
    let chunk = []
    try {
      const res = await db.collection(collectionName)
        .where({ [dateField]: _.gte(monthStart).and(_.lte(monthEnd)) })
        .skip(skip)
        .limit(batch)
        .get()
      chunk = res.data || []
    } catch (e) {
      break
    }
    all.push(...chunk)
    if (chunk.length < batch) break
    skip += batch
  }
  return all
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''

  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    let memberSet = null
    let memberCount = 0
    if (openid) {
      const userRes = await db.collection('users').doc(openid).field({ companyId: true }).get().catch(() => null)
      const companyId = userRes?.data?.companyId
      if (companyId) {
        const compRes = await db.collection('companies').doc(companyId).field({ memberIds: true }).get().catch(() => null)
        const ids = compRes?.data?.memberIds || []
        memberSet = new Set(ids)
        memberCount = ids.length
      }
    }

    let reviews = await fetchAllInMonth('reviews', 'createdAt', monthStart, monthEnd)
    if (!memberSet || !memberSet.size) {
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
    reviews = reviews.filter(r => memberSet.has(r.userId))

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

    const merchantIds = Object.keys(merchantStats)
    let merchantNameMap = {}
    if (merchantIds.length) {
      for (let i = 0; i < merchantIds.length; i += 20) {
        const chunk = merchantIds.slice(i, i + 20)
        try {
          const merchantsRes = await db.collection('merchants')
            .where({ _id: _.in(chunk) })
            .field({ name: true })
            .get()
          merchantsRes.data.forEach(m => { merchantNameMap[m._id] = m.name })
        } catch (e) { /* skip */ }
      }
    }

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
          nickName: userRes.data.nickName || '神秘同事',
          avatarUrl: userRes.data.avatarUrl || '',
          count: reviewerCount[topReviewerId]
        }
      }
    }

    let orders = await fetchAllInMonth('orders', 'orderedAt', monthStart, monthEnd)
    orders = orders.filter(o => memberSet.has(o.userId))

    const totalSpend = orders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0)
    const orderUserSet = new Set(orders.map(o => o.userId).filter(Boolean))

    let avgSpend = '--'
    if (totalSpend > 0) {
      if (memberCount > 0) {
        avgSpend = (totalSpend / memberCount).toFixed(0)
      } else if (orderUserSet.size > 0) {
        avgSpend = (totalSpend / orderUserSet.size).toFixed(0)
      } else if (orders.length > 0) {
        avgSpend = (totalSpend / orders.length).toFixed(0)
      }
    }

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
