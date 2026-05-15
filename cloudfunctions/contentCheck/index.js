const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const APPID = 'wx95d709a8d6145f5c'
// Secret 从环境变量读取，不写入代码
const SECRET = process.env.WX_SECRET

// HTTP GET 工具
const httpGet = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let data = ''
    res.on('data', chunk => data += chunk)
    res.on('end', () => resolve(JSON.parse(data)))
  }).on('error', reject)
})

// HTTP POST 工具
const httpPost = (url, body) => new Promise((resolve, reject) => {
  const bodyStr = JSON.stringify(body)
  const urlObj = new URL(url)
  const options = {
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
  }
  const req = https.request(options, (res) => {
    let data = ''
    res.on('data', chunk => data += chunk)
    res.on('end', () => resolve(JSON.parse(data)))
  })
  req.on('error', reject)
  req.write(bodyStr)
  req.end()
})

// 获取有效的 access_token（带缓存）
const getAccessToken = async () => {
  if (!SECRET) throw new Error('WX_SECRET 环境变量未配置')

  try {
    const configRes = await db.collection('system_config').doc('access_token').get()
    const cached = configRes.data
    if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date(Date.now() + 60000)) {
      return cached.token
    }
  } catch (e) { /* 集合或文档不存在，重新获取 */ }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`
  const res = await httpGet(url)
  if (!res.access_token) throw new Error(`获取 access_token 失败: ${res.errmsg}`)

  const expiresAt = new Date(Date.now() + (res.expires_in - 300) * 1000)
  try {
    // 确保集合存在
    await db.createCollection('system_config').catch(() => {})
    await db.collection('system_config').doc('access_token').set({
      data: { token: res.access_token, expiresAt }
    })
  } catch (e) { /* 缓存写入失败不影响主流程 */ }

  return res.access_token
}

// 文字审核
const checkText = async (content, openid) => {
  const token = await getAccessToken()
  const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`
  const body = { content, version: 2, openid, scene: 2 }
  const res = await httpPost(url, body)
  if (res.errcode !== 0) throw new Error(`msgSecCheck 接口错误: ${res.errmsg}`)
  const suggest = res.result?.suggest
  return { pass: suggest === 'pass', suggest }
}

// 图片异步审核（触发 + 返回 trace_id）
const checkImageAsync = async (mediaUrl, openid) => {
  const token = await getAccessToken()
  const url = `https://api.weixin.qq.com/wxa/media_check_async?access_token=${token}`
  const body = { media_url: mediaUrl, media_type: 2, version: 2, openid }
  const res = await httpPost(url, body)
  if (res.errcode !== 0) throw new Error(`mediaCheckAsync 接口错误: ${res.errmsg}`)
  return { traceId: res.trace_id }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = event.openid || wxContext.OPENID
  const { type, content, mediaUrl, reviewId } = event

  try {
    if (type === 'text') {
      const result = await checkText(content, openid)
      return { code: 0, ...result }
    }

    if (type === 'image') {
      const result = await checkImageAsync(mediaUrl, openid)
      // 如果传了 reviewId，更新对应图片的 traceId
      if (reviewId && event.fileID) {
        await db.collection('reviews').doc(reviewId).update({
          data: {
            'images': db.command.set(
              (event.imagesArr || []).map(img =>
                img.fileID === event.fileID
                  ? { ...img, traceId: result.traceId, imgStatus: 'pending' }
                  : img
              )
            )
          }
        })
      }
      return { code: 0, traceId: result.traceId }
    }

    return { code: -1, message: '未知审核类型' }
  } catch (err) {
    console.error('contentCheck error:', err)
    return { code: -1, message: '审核服务出错，稍后再试' }
  }
}
