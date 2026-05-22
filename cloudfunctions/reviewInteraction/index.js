const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function ensureCollection(name) {
  try { await db.createCollection(name) } catch (e) { /* 已存在 */ }
}

async function getReviewInteractions(reviewId) {
  try {
    const res = await db.collection('review_interactions').where({ reviewId }).limit(1000).get()
    return res.data || []
  } catch (e) {
    console.warn('review_interactions query:', e.message || e)
    return []
  }
}

const toMillis = (d) => {
  if (!d) return 0
  try {
    if (d instanceof Date) return d.getTime()
    if (typeof d === 'object' && d.$date) return new Date(d.$date).getTime()
    return new Date(d).getTime()
  } catch (_) {
    return 0
  }
}

async function buildSummary(reviewId, actorId) {
  const items = await getReviewInteractions(reviewId)
  const likes = items.filter(x => x.type === 'like')
  const comments = items.filter(x => x.type === 'comment').sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
  const challenges = items.filter(x => x.type === 'challenge').sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
  const slice = comments.slice(0, 8)
  const chSlice = challenges.slice(0, 5)
  const uids = [...new Set([...slice.map(c => c.userId), ...chSlice.map(c => c.userId)].filter(Boolean))]
  const userMap = {}
  for (let i = 0; i < uids.length; i += 20) {
    const chunk = uids.slice(i, i + 20)
    if (!chunk.length) continue
    try {
      const ur = await db.collection('users').where({ _id: _.in(chunk) }).field({ nickName: true }).get()
      ur.data.forEach(u => { userMap[u._id] = u })
    } catch (_) { /* skip */ }
  }
  const interactionComments = slice.map(c => ({
    _id: c._id,
    content: c.content,
    userId: c.userId,
    userNickName: userMap[c.userId]?.nickName || '食客',
    createdAt: c.createdAt
  }))
  const interactionChallenges = chSlice.map(c => ({
    _id: c._id,
    content: c.content,
    userId: c.userId,
    userNickName: userMap[c.userId]?.nickName || '食客',
    createdAt: c.createdAt
  }))
  return {
    likeCount: likes.length,
    likedByMe: actorId ? likes.some(x => x.userId === actorId) : false,
    commentCount: comments.length,
    challengeCount: challenges.length,
    interactionComments,
    interactionChallenges
  }
}

async function sameCompany(reviewAuthorId, actorId) {
  const [a, b] = await Promise.all([
    db.collection('users').doc(reviewAuthorId).field({ companyId: true }).get().catch(() => null),
    db.collection('users').doc(actorId).field({ companyId: true }).get().catch(() => null)
  ])
  const ca = a?.data?.companyId
  const cb = b?.data?.companyId
  if (!ca || !cb || ca !== cb) return false
  return true
}

async function checkTextSafe(content, openid) {
  try {
    const checkRes = await cloud.callFunction({
      name: 'contentCheck',
      data: { type: 'text', content, openid }
    })
    const r = checkRes.result
    if (r && r.code === 0 && r.pass === false) return false
  } catch (e) {
    console.warn('reviewInteraction contentCheck:', e)
  }
  return true
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, reviewId, content } = event

  if (!openid) return { code: -1, message: '请先登录' }
  if (!reviewId) return { code: -1, message: '缺少评价 ID' }

  try {
    await ensureCollection('review_interactions')

    const reviewDoc = await db.collection('reviews').doc(reviewId).get().catch(() => null)
    if (!reviewDoc?.data) return { code: 404, message: '评价不存在' }
    const authorId = reviewDoc.data.userId

    if (authorId !== openid) {
      const ok = await sameCompany(authorId, openid)
      if (!ok) return { code: 403, message: '只能和同团队的小伙伴互动哦' }
    }

    if (action === 'toggleLike') {
      const items = await getReviewInteractions(reviewId)
      const exist = items.find(x => x.userId === openid && x.type === 'like')
      if (exist) {
        await db.collection('review_interactions').doc(exist._id).remove()
        const summary = await buildSummary(reviewId, openid)
        return { code: 0, liked: false, reviewId, summary }
      }
      await db.collection('review_interactions').add({
        data: {
          reviewId,
          userId: openid,
          type: 'like',
          content: '',
          createdAt: db.serverDate()
        }
      })
      const summary = await buildSummary(reviewId, openid)
      return { code: 0, liked: true, reviewId, summary }
    }

    if (action === 'addComment') {
      const text = (content || '').trim()
      if (text.length < 2) return { code: -1, message: '至少写两个字吧' }
      if (text.length > 300) return { code: -1, message: '有点太长了，缩短到 300 字内' }
      const safe = await checkTextSafe(text, openid)
      if (!safe) return { code: 403, message: '内容需要调整一下再发' }
      await db.collection('review_interactions').add({
        data: {
          reviewId,
          userId: openid,
          type: 'comment',
          content: text,
          createdAt: db.serverDate()
        }
      })
      const summary = await buildSummary(reviewId, openid)
      return { code: 0, reviewId, summary }
    }

    if (action === 'addChallenge') {
      const text = (content || '').trim()
      if (text.length < 4) return { code: -1, message: '多写几句，说说为什么呢' }
      if (text.length > 500) return { code: -1, message: '不对劲说明请控制在 500 字内' }
      const safe = await checkTextSafe(text, openid)
      if (!safe) return { code: 403, message: '内容需要调整一下再发' }
      const items = await getReviewInteractions(reviewId)
      const prev = items.find(x => x.userId === openid && x.type === 'challenge')
      if (prev) {
        await db.collection('review_interactions').doc(prev._id).update({
          data: { content: text, createdAt: db.serverDate() }
        })
      } else {
        await db.collection('review_interactions').add({
          data: {
            reviewId,
            userId: openid,
            type: 'challenge',
            content: text,
            createdAt: db.serverDate()
          }
        })
      }
      const summary = await buildSummary(reviewId, openid)
      return { code: 0, reviewId, summary }
    }

    return { code: -1, message: '未知操作' }
  } catch (err) {
    console.error('reviewInteraction error:', err)
    return { code: -1, message: '操作失败，稍后再试' }
  }
}
