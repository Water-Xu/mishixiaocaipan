const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 计算吃货人格
const calcPersonality = (reviews) => {
  if (!reviews || reviews.length < 3) return 'laid_back'
  const avgScore = reviews.reduce((s, r) => s + r.score, 0) / reviews.length
  const allTags = reviews.flatMap(r => r.tags || [])

  if (allTags.filter(t => t === '踩雷' || t === '难吃到哭').length >= 2) return 'mine_sweeper'
  const spicyScores = reviews.filter(r => r.tags?.includes('够辣过瘾'))
  if (spicyScores.length / reviews.length > 0.5) return 'spicy_lover'
  if (avgScore >= 4.5) return 'five_star_forever'
  const avgContent = reviews.reduce((s, r) => s + (r.content?.length || 0), 0) / reviews.length
  if (avgContent > 50) return 'food_detective'
  return 'regular'
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const {
    merchantId, score, subScores, content, images = [], tags = [], mood,
    isSecondReview = false, orderItems = [], totalAmount
  } = event

  if (!merchantId || !score || !content) {
    return { code: -1, message: '参数不完整' }
  }
  if (content.length < 10) {
    return { code: -1, message: '评价至少需要 10 个字' }
  }

  const userRes = await db.collection('users').doc(openid).field({ companyId: true }).get().catch(() => null)
  if (!userRes?.data?.companyId) {
    return { code: 403, message: '请先加入团队再发布评价' }
  }

  try {
    // 1. 文字审核（同步）—— 审核服务自身出错时降级放行，不拦截用户
    try {
      const checkRes = await cloud.callFunction({
        name: 'contentCheck',
        data: { type: 'text', content, openid }
      })
      const checkResult = checkRes.result
      // 只有明确返回 pass: false 才拦截（code 非 0 表示审核服务异常，降级放行）
      if (checkResult && checkResult.code === 0 && checkResult.pass === false) {
        return { code: 403, message: '内容需要调整，请检查后重新发布' }
      }
    } catch (e) {
      console.warn('contentCheck 调用失败，降级放行:', e)
    }

    // 2. 写入 reviews 集合
    const imageRecords = images.map(fileID => ({
      fileID,
      imgStatus: 'pending',
      traceId: ''
    }))

    const addRes = await db.collection('reviews').add({
      data: {
        userId: openid,
        merchantId,
        score,
        subScores: subScores || {},
        content,
        images: imageRecords,
        tags,
        mood: mood || '',
        isSecondReview,
        orderItems: Array.isArray(orderItems) ? orderItems : [],
        totalAmount: totalAmount != null && totalAmount !== '' ? parseFloat(totalAmount) || 0 : null,
        createdAt: db.serverDate()
      }
    })
    const reviewId = addRes._id

    // 3. 更新商家均分
    const reviewsRes = await db.collection('reviews')
      .where({ merchantId })
      .field({ score: true })
      .get()
    const allScores = reviewsRes.data.map(r => r.score)
    const avgScore = parseFloat((allScores.reduce((s, v) => s + v, 0) / allScores.length).toFixed(1))
    await db.collection('merchants').doc(merchantId).update({
      data: {
        avgScore,
        reviewCount: allScores.length
      }
    })

    // 4. 异步触发每张图片审核（不等结果）
    if (images.length) {
      const tempUrls = await cloud.getTempFileURL({ fileList: images }).catch(() => ({ fileList: [] }))
      for (let i = 0; i < images.length; i++) {
        const mediaUrl = tempUrls.fileList[i]?.tempFileURL
        if (!mediaUrl) continue
        cloud.callFunction({
          name: 'contentCheck',
          data: { type: 'image', mediaUrl, openid, reviewId, fileID: images[i], imagesArr: imageRecords }
        }).then(r => {
          // 更新 traceId
          if (r.result?.traceId) {
            db.collection('reviews').doc(reviewId).get().then(res => {
              const updImgs = res.data.images.map(img =>
                img.fileID === images[i] ? { ...img, traceId: r.result.traceId } : img
              )
              db.collection('reviews').doc(reviewId).update({ data: { images: updImgs } })
            })
          }
        }).catch(() => {})
      }
    }

    // 5. 更新用户人格（异步）
    db.collection('reviews').where({ userId: openid }).orderBy('createdAt', 'desc').limit(20).get()
      .then(res => {
        const personality = calcPersonality(res.data)
        return db.collection('users').doc(openid).update({
          data: { personality, personalityUpdatedAt: db.serverDate() }
        })
      }).catch(() => {})

    return { code: 0, reviewId, message: '发布成功' }
  } catch (err) {
    console.error('createReview error:', err)
    return { code: -1, message: '发布失败，稍后再试' }
  }
}
