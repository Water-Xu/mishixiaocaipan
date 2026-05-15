const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function generateInviteCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < len; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

async function uniqueInviteCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode()
    const res = await db.collection('companies').where({ inviteCode: code }).count()
    if (res.total === 0) return code
  }
  return generateInviteCode(8)
}

exports.main = async (event, context) => {
  const { companyName } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { code: -1, message: '获取用户信息失败' }
  if (!companyName || !companyName.trim()) return { code: 400, message: '请输入群组名称' }

  try {
    const inviteCode = await uniqueInviteCode()
    const now = db.serverDate()

    const addRes = await db.collection('companies').add({
      data: {
        name: companyName.trim(),
        inviteCode,
        adminId: openid,
        memberIds: [openid],
        createdAt: now
      }
    })

    const companyId = addRes._id

    // 更新用户的 companyId
    await db.collection('users').doc(openid).update({
      data: { companyId, inviteCode }
    })

    return {
      code: 0,
      company: {
        _id: companyId,
        name: companyName.trim(),
        inviteCode,
        memberCount: 1
      }
    }
  } catch (err) {
    console.error('createCompany error:', err)
    return { code: -1, message: '创建失败，稍后再试' }
  }
}
