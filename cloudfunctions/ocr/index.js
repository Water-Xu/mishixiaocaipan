const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const TENCENT_OCR_SECRET_ID = process.env.TENCENT_SECRET_ID
const TENCENT_OCR_SECRET_KEY = process.env.TENCENT_SECRET_KEY

// 腾讯云 API 签名（TC3-HMAC-SHA256）
const crypto = require('crypto')

const sign = (secretKey, message) => crypto.createHmac('sha256', secretKey).update(message).digest()
const hmacSHA256Hex = (secretKey, message) => crypto.createHmac('sha256', secretKey).update(message).digest('hex')

const callTencentOCR = (imageUrl) => new Promise((resolve, reject) => {
  const service = 'ocr'
  const host = 'ocr.tencentcloudapi.com'
  const action = 'GeneralBasicOCR'
  const version = '2018-11-19'
  const region = 'ap-guangzhou'

  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().split('T')[0]

  const payload = JSON.stringify({ ImageUrl: imageUrl, LanguageType: 'auto' })
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex')

  const canonicalRequest = [
    'POST', '/', '',
    `content-type:application/json\nhost:${host}\n`,
    'content-type;host',
    payloadHash
  ].join('\n')

  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n')

  const secretDate = sign(`TC3${TENCENT_OCR_SECRET_KEY}`, date)
  const secretService = sign(secretDate, service)
  const secretSigning = sign(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  const authorization = `TC3-HMAC-SHA256 Credential=${TENCENT_OCR_SECRET_ID}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`

  const body = Buffer.from(payload)
  const options = {
    hostname: host,
    method: 'POST',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json',
      'Host': host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': timestamp,
      'X-TC-Region': region,
      'Content-Length': body.length
    }
  }

  const req = https.request(options, (res) => {
    let data = ''
    res.on('data', c => data += c)
    res.on('end', () => resolve(JSON.parse(data)))
  })
  req.on('error', reject)
  req.write(body)
  req.end()
})

/**
 * 解析美团订单截图 OCR 文本
 *
 * 截图文字结构（以实际美团外卖订单为例）：
 *   ...
 *   商品费用
 *   瑞幸咖啡(前海科兴科学园1栋店) >  ☆收藏
 *   标准 美式                         ¥22
 *   默认，特大杯，热...
 *   ×1
 *   巴斯克芝士蛋糕                    ¥9.6
 *   默认
 *   ×1
 *   ...
 *   打包费                             ¥1
 *   用户配送费                    ¥6 免配送费
 *   已用1张美团红包                   -¥14
 *   合计           已优惠21元       ¥34.6
 */
const parseOrderText = (textList) => {
  let merchantName = ''
  let totalAmount = null
  const items = []
  let confidence = 'partial'

  // 费用区关键词，出现即停止采集商品
  const FEE_KEYWORDS = ['打包费', '配送费', '合计', '红包', '优惠券', '点击收起', '更多推荐', '商家已接单', '骑手']

  // ── 1. 定位"商品费用"区域的起始行 ──
  let goodsSectionIdx = textList.findIndex(t => t.includes('商品费用'))
  if (goodsSectionIdx === -1) {
    // 兜底：尝试"订单信息"之后
    goodsSectionIdx = textList.findIndex(t => t.includes('订单信息'))
  }
  const searchStart = goodsSectionIdx > -1 ? goodsSectionIdx + 1 : 0

  // ── 2. 提取商家名 ──
  // 商家名行特征：在"商品费用"之后、不含 ¥、长度 3~30、非 UI 控件文字
  const UI_NOISE = /^(收藏|申请开票|支付方式|配送地址|发票|订单信息|商品费用|点击|<|>|✩|☆)/
  for (let i = searchStart; i < Math.min(searchStart + 6, textList.length); i++) {
    const raw = textList[i].trim()
    if (!raw || raw.length < 2) continue
    if (raw.includes('¥') || UI_NOISE.test(raw)) continue
    // 去掉行末的 "> ☆收藏" 等标注
    const cleaned = raw
      .replace(/\s*[>›]\s*.*$/, '')
      .replace(/\s*☆.*$/, '')
      .replace(/\s*\d+条评.*$/, '')
      .trim()
    if (cleaned.length >= 2) {
      merchantName = cleaned
      confidence = 'high'
      break
    }
  }

  // 统一把全角 ￥ 和 ¥ 都标准化为半角 ¥，方便后续正则
  const normList = textList.map(t => t.replace(/[￥]/g, '¥'))

  // ── 3. 提取商品列表 ──
  const SKIP_PATTERNS = [
    /^(默认|×\d|x\d|\d+份|规格|口味|温度|甜度|少糖|无糖|点击|收起|更多)/i,
    /^(打包|配送|红包|优惠|合计|发票|地址|备注|备注信息|联系)/
  ]
  let pendingItemName = ''
  // 价格行匹配：¥22 / ¥22.00 / ×1¥22 / 单纯数字行（配合pendingItemName）
  const PRICE_RE = /[¥￥]([\d.]+)/

  for (let i = searchStart; i < normList.length; i++) {
    const line = normList[i].trim()
    if (!line) continue
    if (FEE_KEYWORDS.some(k => line.includes(k))) break
    if (merchantName && line.includes(merchantName.slice(0, 4))) continue
    if (SKIP_PATTERNS.some(p => p.test(line))) { pendingItemName = ''; continue }

    // Case A：同行带价格（允许1个以上空白字符，包括 ×1 数量标注）
    const sameLineMatch = line.match(/^(.+?)\s+[¥￥]([\d.]+)/) ||
                          line.match(/^(.+?)×\d+\s*[¥￥]([\d.]+)/)
    if (sameLineMatch) {
      const name = sameLineMatch[1].replace(/×\d+/, '').trim()
      const price = parseFloat(sameLineMatch[2])
      if (isValidItemName(name) && price > 0) {
        items.push({ name, price, qty: 1 })
        pendingItemName = ''
        continue
      }
    }

    // Case B：纯商品名行（后续行找价格，最多5行内）
    const hasPriceInLine = PRICE_RE.test(line)
    if (!hasPriceInLine && isValidItemName(line)) {
      let priceFound = false
      for (let j = i + 1; j < Math.min(i + 5, normList.length); j++) {
        const nextLine = normList[j].trim()
        if (FEE_KEYWORDS.some(k => nextLine.includes(k))) break
        const pm = nextLine.match(PRICE_RE)
        if (pm) {
          const price = parseFloat(pm[1])
          if (price > 0) {
            items.push({ name: line, price, qty: 1 })
            priceFound = true
          }
          break
        }
        // 遇到另一个有效商品名就停
        if (isValidItemName(nextLine) && !PRICE_RE.test(nextLine)) break
      }
      if (!priceFound) pendingItemName = line
      continue
    }

    // Case C：单独价格行，对应上一个 pendingItemName
    if (pendingItemName) {
      const pm = line.match(PRICE_RE)
      if (pm) {
        const price = parseFloat(pm[1])
        if (price > 0) items.push({ name: pendingItemName, price, qty: 1 })
        pendingItemName = ''
      }
    }
  }

  // ── 4. 提取合计（用标准化后的列表）──
  const fullNorm = normList.join('\n')
  const totalLine = normList.find(t => t.match(/合计/) && PRICE_RE.test(t))
  if (totalLine) {
    const matches = [...totalLine.matchAll(/[¥]([\d.]+)/g)]
    if (matches.length) totalAmount = parseFloat(matches[matches.length - 1][1])
  }
  if (!totalAmount) {
    const fallback = fullNorm.match(/实付款?[：:\s]*¥?\s*([\d.]+)/) ||
                     fullNorm.match(/总计[：:\s]*¥?\s*([\d.]+)/) ||
                     fullNorm.match(/应付[：:\s]*¥?\s*([\d.]+)/) ||
                     fullNorm.match(/¥\s*([\d.]+)\s*\n/) ||
                     fullNorm.match(/¥\s*([\d.]+)\s*$/)
    if (fallback) totalAmount = parseFloat(fallback[1])
  }
  // 兜底：在"实付/合计"关键词附近找纯数字行
  if (!totalAmount) {
    const TOTAL_KW = ['实付', '合计', '总计', '应付', '待付']
    for (let i = 0; i < normList.length; i++) {
      if (TOTAL_KW.some(k => normList[i].includes(k))) {
        // 向后 3 行内找纯数字（如 34.60）
        for (let j = i; j < Math.min(i + 4, normList.length); j++) {
          const m = normList[j].match(/^[\s¥]*([\d]+\.[\d]{1,2})\s*$/)
          if (m) { totalAmount = parseFloat(m[1]); break }
        }
        if (totalAmount) break
      }
    }
  }
  if (!totalAmount && items.length) {
    totalAmount = parseFloat(items.reduce((s, it) => s + it.price, 0).toFixed(1))
  }

  return { merchantName, totalAmount, items, confidence }
}

// 判断是否是有效商品名（排除描述性/导航性文字）
const isValidItemName = (name) => {
  if (!name || name.length < 2 || name.length > 30) return false
  const NOISE = /^(默认|×|x\d|规格|口味|温度|甜度|少糖|无糖|点击|收起|更多|发票|地址|收藏|申请|支付|备注|联系|打包|配送|红包|优惠|合计|订单|商品|费用|骑手|配送距离|预计|您已|暂无)/i
  if (NOISE.test(name)) return false
  // 纯数字/纯符号排除
  if (/^[\d\s.*×x\-\/\\()（）]+$/.test(name)) return false
  return true
}

exports.main = async (event, context) => {
  const { fileID } = event
  console.log('[OCR] 函数启动, fileID:', fileID)

  if (!fileID) return { code: -1, message: 'fileID 不能为空' }

  // 检查环境变量
  console.log('[OCR] SECRET_ID 已配置:', !!TENCENT_OCR_SECRET_ID, '| SECRET_KEY 已配置:', !!TENCENT_OCR_SECRET_KEY)

  if (!TENCENT_OCR_SECRET_ID || !TENCENT_OCR_SECRET_KEY) {
    console.warn('[OCR] 未配置腾讯云密钥，跳过识别')
    return {
      code: 0,
      merchantName: '',
      totalAmount: null,
      items: [],
      confidence: 'partial',
      message: '请手动填写店名'
    }
  }

  try {
    // 获取临时 URL
    const tempRes = await cloud.getTempFileURL({ fileList: [fileID] })
    const imageUrl = tempRes.fileList[0]?.tempFileURL
    console.log('[OCR] 临时图片 URL 获取结果:', imageUrl ? '成功' : '失败', imageUrl?.slice(0, 60))
    if (!imageUrl) return { code: -1, message: '获取图片 URL 失败' }

    console.log('[OCR] 开始调用腾讯云 OCR...')
    const ocrRes = await callTencentOCR(imageUrl)
    console.log('[OCR] API 原始响应:', JSON.stringify(ocrRes?.Response).slice(0, 200))

    if (ocrRes?.Response?.Error) {
      console.error('[OCR] API 返回错误:', ocrRes.Response.Error)
      return { code: -1, message: `OCR错误: ${ocrRes.Response.Error.Message}` }
    }

    const textList = (ocrRes.Response?.TextDetections || []).map(t => t.DetectedText?.trim()).filter(Boolean)
    console.log('[OCR] 识别到文字行数:', textList.length)
    console.log('[OCR] 全部文字行:', JSON.stringify(textList))

    if (!textList.length) {
      return { code: 0, merchantName: '', totalAmount: null, items: [], confidence: 'partial' }
    }

    const parsed = parseOrderText(textList)
    console.log('[OCR] 解析结果:', JSON.stringify(parsed))
    return { code: 0, ...parsed }
  } catch (err) {
    console.error('[OCR] 异常:', err.message, err.stack)
    return { code: -1, message: 'OCR 识别失败，请手动填写' }
  }
}
