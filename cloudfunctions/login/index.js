const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function ensureCollection(name) {
  try { await db.createCollection(name) } catch (e) { /* 已存在，忽略 */ }
}

exports.main = async (event, context) => {
  const { nickName, avatarUrl } = event
  const wxContext = cloud.getWXContext()

  try {
    const openid = wxContext.OPENID
    if (!openid) return { code: -1, message: '获取用户信息失败' }

    await Promise.all([
      ensureCollection('users'),
      ensureCollection('companies'),
      ensureCollection('merchants'),
      ensureCollection('reviews'),
      ensureCollection('review_interactions')
    ])

    const userRes = await db.collection('users').doc(openid).get().catch(() => null)
    let isNewUser = false
    let userInfo

    if (!userRes?.data) {
      isNewUser = true
      userInfo = {
        _id: openid,
        nickName: nickName || '食客',
        avatarUrl: avatarUrl || '',
        companyId: '',
        inviteCode: '',
        preference: {},
        personality: '',
        personalityUpdatedAt: db.serverDate(),
        createdAt: db.serverDate()
      }
      await db.collection('users').add({ data: userInfo })
    } else {
      userInfo = userRes.data
      // 若传入了新昵称/头像则更新
      if (nickName || avatarUrl) {
        const updateData = {}
        if (nickName) updateData.nickName = nickName
        if (avatarUrl) updateData.avatarUrl = avatarUrl
        await db.collection('users').doc(openid).update({ data: updateData })
        userInfo = { ...userInfo, ...updateData }
      }
    }

    const hasCompany = !!(userInfo.companyId)
    return { code: 0, isNewUser, hasCompany, userInfo }
  } catch (err) {
    console.error('login error:', err)
    return { code: -1, message: '登录失败，稍后再试' }
  }
}
