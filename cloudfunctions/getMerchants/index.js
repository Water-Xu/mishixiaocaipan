const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 安全查询：集合不存在时返回空数组而不是抛异常
const safeQuery = async (query) => {
  try {
    const res = await query.get()
    return res.data || []
  } catch (e) {
    return []
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 获取单个商家
  if (event.id && !event.action) {
    try {
      const res = await db.collection('merchants').doc(event.id).get()
      return { code: 0, merchant: res.data }
    } catch (e) {
      return { code: 404, message: '商家不存在' }
    }
  }

  // 黑名单投票
  if (event.action === 'voteBlacklist') {
    try {
      const merchantRes = await db.collection('merchants').doc(event.id).get()
      const merchant = merchantRes.data
      const newVotes = (merchant.blacklistVotes || 0) + 1
      const companyData = await safeQuery(
        db.collection('companies').where({ _id: merchant.companyId }).limit(1)
      )
      const totalMembers = companyData[0]?.memberIds?.length || 10
      const isBlacklisted = newVotes > totalMembers / 2
      await db.collection('merchants').doc(event.id).update({
        data: { blacklistVotes: newVotes, isBlacklisted }
      })
      return { code: 0, isBlacklisted }
    } catch (e) {
      return { code: -1, message: '投票失败' }
    }
  }

  // 搜索 / 列表
  const {
    keyword, lat, lng, pageSize = 20, page = 1,
    createIfNotExist, totalAmount, items, source
  } = event
  const skip = (page - 1) * pageSize

  try {
    let list = []

    if (keyword) {
      list = await safeQuery(
        db.collection('merchants')
          .where({ name: db.RegExp({ regexp: keyword, options: 'i' }) })
          .orderBy('avgScore', 'desc')
          .skip(skip)
          .limit(pageSize)
      )
    } else {
      list = await safeQuery(
        db.collection('merchants')
          .orderBy('avgScore', 'desc')
          .skip(skip)
          .limit(pageSize)
      )
    }

    // 搜索不到且 createIfNotExist=true，自动创建商家记录
    if (!list.length && createIfNotExist && keyword) {
      const addRes = await db.collection('merchants').add({
        data: {
          name: keyword,
          address: '',
          location: { lat: lat || 0, lng: lng || 0 },
          category: '未分类',
          coverImage: '',
          avgScore: 0,
          reviewCount: 0,
          isBlacklisted: false,
          blacklistVotes: 0,
          createdAt: db.serverDate()
        }
      })
      list = [{ _id: addRes._id, name: keyword, avgScore: 0, reviewCount: 0, category: '未分类' }]

      if (openid) {
        await db.collection('orders').add({
          data: {
            userId: openid,
            merchantId: addRes._id,
            items: Array.isArray(items) ? items : [],
            totalAmount: parseFloat(totalAmount) || 0,
            orderedAt: db.serverDate(),
            source: source || 'manual'
          }
        }).catch(() => {})
      }
    }

    return { code: 0, list }
  } catch (err) {
    console.error('getMerchants error:', err)
    return { code: 0, list: [] }
  }
}
