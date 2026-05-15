const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const APPID = 'wx95d709a8d6145f5c'
const SECRET = process.env.WX_SECRET

// 获取 access_token（复用 system_config 缓存）
const getAccessToken = async () => {
  try {
    const configRes = await db.collection('system_config').doc('access_token').get()
    const cached = configRes.data
    if (cached?.token && new Date(cached.expiresAt) > new Date(Date.now() + 60000)) {
      return cached.token
    }
  } catch (e) {}
  const https2 = require('https')
  return new Promise((resolve, reject) => {
    https2.get(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`,
      (res) => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', async () => {
          const r = JSON.parse(d)
          const expiresAt = new Date(Date.now() + (r.expires_in - 300) * 1000)
          await db.collection('system_config').doc('access_token').set({ data: { token: r.access_token, expiresAt } }).catch(() => {})
          resolve(r.access_token)
        })
      }
    ).on('error', reject)
  })
}

// 发送微信订阅消息
const sendSubscribeMessage = async (openid, page, data) => {
  const token = await getAccessToken()
  return new Promise((resolve) => {
    const body = JSON.stringify({ touser: openid, template_id: 'YOUR_TEMPLATE_ID', page, data })
    const options = {
      hostname: 'api.weixin.qq.com',
      path: `/cgi-bin/message/subscribe/send?access_token=${token}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }
    const req = https.request(options, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    })
    req.on('error', resolve)
    req.write(body)
    req.end()
  })
}

// 微信服务器验签（GET 请求时响应 echostr）
const verifySignature = (event) => {
  // HTTP 触发时 event 包含 queryStringParameters
  const query = event.queryStringParameters || {}
  if (query.echostr) {
    // 简单返回 echostr 即可通过验签（云函数不需要做 signature 计算）
    return query.echostr
  }
  return null
}

exports.main = async (event, context) => {
  // 微信验签（配置服务器时的 GET 请求）
  const echostr = verifySignature(event)
  if (echostr) return echostr

  // 微信服务器回调，event 包含回调体
  const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : event
  console.log('mediaCheckCallback received:', JSON.stringify(body))

  try {
    const traceId = body.trace_id
    const suggest = body.result?.suggest || body.suggest

    if (!traceId) return 'success'

    // 通过 traceId 找到对应 review 中的图片记录
    // 查询所有含该 traceId 的 review
    const reviewRes = await db.collection('reviews')
      .where({ 'images.traceId': traceId })
      .limit(1)
      .get()

    if (!reviewRes.data.length) return 'success'
    const review = reviewRes.data[0]

    const updatedImages = review.images.map(img => {
      if (img.traceId !== traceId) return img
      return { ...img, imgStatus: suggest === 'pass' ? 'approved' : 'rejected' }
    })

    await db.collection('reviews').doc(review._id).update({
      data: { images: updatedImages }
    })

    // 如果审核不通过，删除云存储文件 + 推送通知
    if (suggest !== 'pass') {
      const rejectedImg = review.images.find(img => img.traceId === traceId)
      if (rejectedImg?.fileID) {
        await cloud.deleteFile({ fileList: [rejectedImg.fileID] }).catch(() => {})
      }
      // 发送订阅消息通知用户（需要用户提前订阅模板消息）
      await sendSubscribeMessage(review.userId, 'pages/profile/index', {
        thing1: { value: '你有一张图片未通过审核' },
        thing2: { value: '图片内容需要调整，请重新上传' }
      }).catch(() => {})
    }

    return 'success'
  } catch (err) {
    console.error('mediaCheckCallback error:', err)
    return 'success' // 必须返回 success，否则微信会重复推
  }
}
