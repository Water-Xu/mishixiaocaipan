const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 确保集合存在（不存在则自动创建）
async function ensureCollection(name) {
  try {
    await db.createCollection(name)
    console.log(`[updateUserInfo] 集合 ${name} 已创建`)
  } catch (e) {
    // 已存在时 createCollection 会报错，忽略即可
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { preference, personality } = event

  console.log('[updateUserInfo] openid:', openid)
  console.log('[updateUserInfo] event:', JSON.stringify(event))

  if (!openid) {
    console.error('[updateUserInfo] openid is null/undefined')
    return { code: -1, message: '获取用户身份失败' }
  }

  try {
    const updateData = {}
    if (preference !== undefined && preference !== null) updateData.preference = preference
    if (personality) {
      updateData.personality = personality
      updateData.personalityUpdatedAt = db.serverDate()
    }

    if (!Object.keys(updateData).length) {
      return { code: -1, message: '没有要更新的内容' }
    }

    // 确保 users 集合存在
    await ensureCollection('users')

    // 查文档是否存在
    const existRes = await db.collection('users').where({ _id: openid }).limit(1).get()
    console.log('[updateUserInfo] 文档是否存在:', existRes.data.length > 0)

    if (existRes.data.length > 0) {
      await db.collection('users').doc(openid).update({ data: updateData })
      console.log('[updateUserInfo] update 成功')
    } else {
      await db.collection('users').add({
        data: {
          _id: openid,
          preference: {},
          personality: '',
          ...updateData,
          createdAt: db.serverDate()
        }
      })
      console.log('[updateUserInfo] add 成功')
    }

    const userRes = await db.collection('users').where({ _id: openid }).limit(1).get()
    return { code: 0, userInfo: userRes.data[0] || null }
  } catch (err) {
    console.error('[updateUserInfo] error:', err.errCode, err.errMsg || err.message)
    return { code: -1, message: '更新失败', detail: err.errMsg || err.message }
  }
}
