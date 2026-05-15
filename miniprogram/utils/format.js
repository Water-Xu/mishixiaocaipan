/**
 * 格式化工具函数
 */

// 时间格式化：距离现在多久
const timeAgo = (dateStr) => {
  if (!dateStr) return ''
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`

  const d = new Date(dateStr)
  const month = d.getMonth() + 1
  const dayNum = d.getDate()
  return `${month}月${dayNum}日`
}

// 完整日期格式
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

// 月份格式（用于榜单）
const formatMonth = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
}

// 金额格式化
const formatMoney = (amount) => {
  if (amount === undefined || amount === null) return '--'
  return `¥${Number(amount).toFixed(0)}`
}

// 评分格式化
const formatScore = (score) => {
  if (!score && score !== 0) return '--'
  return Number(score).toFixed(1)
}

// 距离格式化（米）
const formatDistance = (meters) => {
  if (!meters && meters !== 0) return ''
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

// 截断长文字
const truncate = (str, len = 80) => {
  if (!str) return ''
  if (str.length <= len) return str
  return str.slice(0, len) + '…'
}

// 星级转中文描述
const scoreLabel = (score) => {
  const labels = ['', '太难吃了', '一般般', '还行吧', '挺好吃的', '超好吃！']
  return labels[Math.round(score)] || ''
}

module.exports = { timeAgo, formatDate, formatMonth, formatMoney, formatScore, formatDistance, truncate, scoreLabel }
