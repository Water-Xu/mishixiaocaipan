const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 用 where 查询替代 doc().get()，避免文档不存在时抛异常
    const userQueryRes = await db.collection('users')
      .where({ _id: openid })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }))

    const userInfo = userQueryRes.data[0] || null

    // 查用户历史评价
    let reviews = []
    try {
      const reviewsRes = await db.collection('reviews')
        .where({ userId: openid })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
      reviews = reviewsRes.data || []
    } catch (e) {
      // 集合不存在时忽略
    }

    // 批量获取商家名
    const _ = db.command
    const merchantIds = [...new Set(reviews.map(r => r.merchantId))].filter(Boolean)
    let merchantNameMap = {}
    if (merchantIds.length) {
      try {
        const mRes = await db.collection('merchants')
          .where({ _id: _.in(merchantIds) })
          .field({ name: true })
          .get()
        mRes.data.forEach(m => { merchantNameMap[m._id] = m.name })
      } catch (e) { /* 商家集合不存在时跳过 */ }
    }

    const reviewList = reviews.map(r => ({
      ...r,
      merchantName: merchantNameMap[r.merchantId] || ''
    }))

    let company = null
    if (userInfo?.companyId) {
      try {
        const cRes = await db.collection('companies').doc(userInfo.companyId).get()
        const c = cRes.data
        if (c) {
          company = {
            _id: c._id,
            name: c.name || '',
            inviteCode: c.inviteCode || userInfo.inviteCode || '',
            memberCount: (c.memberIds || []).length
          }
        }
      } catch (e) { /* skip */ }
    }

    return { code: 0, userInfo, reviews: reviewList, company }
  } catch (err) {
    console.error('getUserInfo error:', err)
    return { code: 0, userInfo: null, reviews: [] }
  }
}
