const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const generateReason = async (merchant, recentReviews, preference) => {
  const reviewSummary = recentReviews.slice(0, 3).map(r => `"${r.content.slice(0, 40)}"`).join('；')
  const prefDesc = preference ? `口味：${preference.spicy || '随意'}辣，偏好${preference.category?.join('/')||'啥都行'}，预算${preference.budget === 'low' ? '25元以内' : preference.budget === 'mid' ? '25-50元' : '不限'}` : ''

  const prompt = `你是一个办公室同事，帮同事推荐外卖店。用轻松口语化的语气写推荐理由，不超过 80 字，要有真实感，像朋友说话，不要用书面语。
商家：${merchant.name}，评分：${merchant.avgScore}，品类：${merchant.category}
最近评价：${reviewSummary || '暂时没啥评价'}
${prefDesc}
就直接写推荐理由，不要加前缀。`

  try {
    const res = await cloud.extend.AI.createModel('cloudbase').streamText({
      data: {
        model: 'deepseek-v3.2',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.8
      }
    })

    let fullText = ''
    for await (const event of res.eventStream) {
      if (event.data === '[DONE]') break
      try {
        const data = JSON.parse(event.data)
        const text = data?.choices?.[0]?.delta?.content
        if (text) fullText += text
      } catch (_) {}
    }
    return fullText || `推你去「${merchant.name}」，最近风评不错！`
  } catch (e) {
    console.error('AI generateReason error:', e)
    return `推你去「${merchant.name}」，同事最近评价都还行，可以冲！`
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = event.userId || wxContext.OPENID
  const { excludeIds = [], chatQuery } = event

  try {
    // 获取用户偏好
    const userRes = await db.collection('users').doc(openid).get().catch(() => null)
    const preference = userRes?.data?.preference || {}

    // 构建过滤条件
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000)
    let merchantQuery = { isBlacklisted: _.neq(true) }
    if (excludeIds.length) {
      merchantQuery._id = _.nin(excludeIds)
    }

    // 获取候选商家（集合不存在时返回空）
    let candidates = []
    try {
      const merchantsRes = await db.collection('merchants')
        .where(merchantQuery)
        .orderBy('avgScore', 'desc')
        .limit(30)
        .get()
      candidates = merchantsRes.data || []
    } catch (e) {
      return { code: 404, message: '还没有商家数据，先去导入几单吧' }
    }

    // 过滤最近两周差评 >= 2 次的商家
    let recentBadData = []
    try {
      const recentBadRes = await db.collection('reviews')
        .where({ score: _.lte(2), createdAt: _.gte(twoWeeksAgo) })
        .field({ merchantId: true })
        .get()
      recentBadData = recentBadRes.data || []
    } catch (e) { /* 集合不存在时忽略 */ }
    const badCountMap = {}
    recentBadData.forEach(r => {
      badCountMap[r.merchantId] = (badCountMap[r.merchantId] || 0) + 1
    })
    candidates = candidates.filter(m => (badCountMap[m._id] || 0) < 2)

    // 按用户偏好过滤
    if (preference.category?.length) {
      const catFiltered = candidates.filter(m => preference.category.includes(m.category))
      if (catFiltered.length >= 3) candidates = catFiltered
    }

    // 如果是对话模式，进一步用关键词过滤
    if (chatQuery) {
      const q = chatQuery.toLowerCase()
      const queryFiltered = candidates.filter(m => {
        if (q.includes('辣') && preference.spicy === 'none') return false
        if (q.includes('20') || q.includes('便宜')) return m.avgScore >= 3
        return true
      })
      if (queryFiltered.length > 0) candidates = queryFiltered
    }

    if (!candidates.length) {
      return { code: 404, message: '没找到合适的，换个条件？' }
    }

    // 随机从前 5 个里选一个（评分高的权重更大）
    const top5 = candidates.slice(0, 5)
    const selected = top5[Math.floor(Math.random() * top5.length)]

    // 获取最近 3 条评价
    const recentReviewsRes = await db.collection('reviews')
      .where({ merchantId: selected._id })
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get()
    const recentReviews = recentReviewsRes.data

    // 生成推荐理由
    const reason = await generateReason(selected, recentReviews, preference)

    // 生成标签
    const tags = []
    if (selected.avgScore >= 4) tags.push('✅ 同事好评多')
    if (preference.category?.includes(selected.category)) tags.push('✅ 符合你的口味')
    const recentBad = recentBadData.filter(r => r.merchantId === selected._id).length
    if (recentBad > 0) tags.push('⚠️ 最近有差评，留意一下')
    if (selected.reviewCount < 3) tags.push('🆕 新店，待挖掘')

    return { code: 0, merchant: selected, reason, tags }
  } catch (err) {
    console.error('aiRecommend error:', err)
    return { code: -1, message: '推荐失败，稍后再试' }
  }
}
