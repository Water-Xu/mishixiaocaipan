const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { merchantId, userId, sortBy = 'latest', page = 1, pageSize = 10 } = event
  const skip = (page - 1) * pageSize

  try {
    const where = {}
    if (merchantId) where.merchantId = merchantId
    if (userId) where.userId = userId

    let orderField = 'createdAt'
    let orderDir = 'desc'
    if (sortBy === 'bad') { orderField = 'score'; orderDir = 'asc' }
    else if (sortBy === 'hot') { orderField = 'score'; orderDir = 'desc' }

    // 集合不存在时 CloudDB 会抛异常，用 try-catch 兜底返回空列表
    let reviews = []
    try {
      const q = Object.keys(where).length
        ? db.collection('reviews').where(where)
        : db.collection('reviews')
      const res = await q.orderBy(orderField, orderDir).skip(skip).limit(pageSize).get()
      reviews = res.data || []
    } catch (e) {
      // 集合不存在 or 无权限 → 当空处理
      console.warn('reviews collection query failed:', e.message)
      return { code: 0, list: [] }
    }

    if (!reviews.length) return { code: 0, list: [] }

    // 批量拉用户信息（_.in 不能传空数组）
    const userIds = [...new Set(reviews.map(r => r.userId))].filter(Boolean)
    let userMap = {}
    if (userIds.length) {
      const usersRes = await db.collection('users')
        .where({ _id: _.in(userIds) })
        .field({ nickName: true, avatarUrl: true })
        .get()
      usersRes.data.forEach(u => { userMap[u._id] = u })
    }

    // 批量拉商家信息
    const merchantIds = [...new Set(reviews.map(r => r.merchantId))].filter(Boolean)
    let merchantMap = {}
    if (merchantIds.length) {
      try {
        const merchantsRes = await db.collection('merchants')
          .where({ _id: _.in(merchantIds) })
          .field({ name: true })
          .get()
        merchantsRes.data.forEach(m => { merchantMap[m._id] = m })
      } catch (e) { /* 商家集合不存在时跳过 */ }
    }

    const list = reviews.map(r => ({
      ...r,
      userNickName: userMap[r.userId]?.nickName || '匿名食客',
      userAvatarUrl: userMap[r.userId]?.avatarUrl || '',
      merchantName: merchantMap[r.merchantId]?.name || ''
    }))

    return { code: 0, list }
  } catch (err) {
    console.error('getReviews error:', err)
    return { code: 0, list: [] } // 对前端永远返回可用结构
  }
}
