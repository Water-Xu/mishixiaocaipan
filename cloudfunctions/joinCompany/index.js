const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { inviteCode } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { code: -1, message: '获取用户信息失败' }
  if (!inviteCode) return { code: 400, message: '请输入邀请码' }

  try {
    const companyRes = await db.collection('companies')
      .where({ inviteCode: inviteCode.trim().toUpperCase() })
      .limit(1)
      .get()

    if (!companyRes.data.length) {
      return { code: 401, message: '邀请码不对，找同事再要一个' }
    }
    const company = companyRes.data[0]

    // 加入成员列表
    if (!company.memberIds?.includes(openid)) {
      await db.collection('companies').doc(company._id).update({
        data: { memberIds: db.command.push(openid) }
      })
    }

    // 更新用户的 companyId
    await db.collection('users').doc(openid).update({
      data: { companyId: company._id, inviteCode: company.inviteCode }
    })

    return {
      code: 0,
      company: {
        _id: company._id,
        name: company.name,
        inviteCode: company.inviteCode,
        memberCount: (company.memberIds?.length || 0) + 1
      }
    }
  } catch (err) {
    console.error('joinCompany error:', err)
    return { code: -1, message: '加入失败，稍后再试' }
  }
}
