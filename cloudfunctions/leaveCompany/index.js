const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { code: -1, message: '请先登录' }

  try {
    const userRes = await db.collection('users').doc(openid).get().catch(() => null)
    const companyId = userRes?.data?.companyId
    if (!companyId) return { code: 0, message: '当前未加入团队' }

    await db.collection('users').doc(openid).update({
      data: { companyId: '', inviteCode: '' }
    })

    await db.collection('companies').doc(companyId).update({
      data: { memberIds: _.pull(openid) }
    }).catch(() => {})

    return { code: 0, message: '已退出团队' }
  } catch (err) {
    console.error('leaveCompany error:', err)
    return { code: -1, message: '退出失败，稍后再试' }
  }
}
