// 评价标签
const REVIEW_TAGS = [
  { label: '💣 踩雷', value: '踩雷', type: 'bad' },
  { label: '🔥 强烈推荐', value: '强烈推荐', type: 'good' },
  { label: '💰 性价比超高', value: '性价比超高', type: 'good' },
  { label: '🍖 份量很足', value: '份量很足', type: 'good' },
  { label: '😭 难吃到哭', value: '难吃到哭', type: 'bad' },
  { label: '😍 好吃到哭', value: '好吃到哭', type: 'good' },
  { label: '📦 包装炸了', value: '包装炸了', type: 'bad' },
  { label: '🐌 送太慢了', value: '送太慢了', type: 'bad' },
  { label: '⚡ 送餐超快', value: '送餐超快', type: 'good' },
  { label: '🌶️ 够辣过瘾', value: '够辣过瘾', type: 'good' },
  { label: '🐦 份量偏少', value: '份量偏少', type: 'bad' },
  { label: '🎁 包装精致', value: '包装精致', type: 'good' }
]

// 心情标签
const MOOD_TAGS = [
  { label: '加班续命', value: '加班续命' },
  { label: '开心打卡', value: '开心打卡' },
  { label: '边开会边吃', value: '边开会边吃' },
  { label: '犒劳自己', value: '犒劳自己' },
  { label: '无聊随便吃', value: '无聊随便吃' }
]

// 口味偏好 - 辣度
const SPICY_OPTIONS = [
  { label: '完全不辣', value: 'none', emoji: '🧊' },
  { label: '微辣就好', value: 'mild', emoji: '🌶️' },
  { label: '越辣越好', value: 'hot', emoji: '🔥' },
  { label: '清淡为主', value: 'light', emoji: '🥗' }
]

// 口味偏好 - 忌口
const FORBIDDEN_OPTIONS = [
  { label: '素食', value: '素食', emoji: '🥦' },
  { label: '清真', value: '清真', emoji: '☪️' },
  { label: '不吃海鲜', value: '不吃海鲜', emoji: '🦐' },
  { label: '不吃香菜', value: '不吃香菜', emoji: '🌿' },
  { label: '不吃葱', value: '不吃葱', emoji: '🧅' },
  { label: '不吃蒜', value: '不吃蒜', emoji: '🧄' }
]

// 口味偏好 - 品类
const CATEGORY_OPTIONS = [
  { label: '快餐盖饭', value: '快餐', emoji: '🍱' },
  { label: '日料', value: '日料', emoji: '🍣' },
  { label: '中式炒菜', value: '炒菜', emoji: '🥘' },
  { label: '烧烤', value: '烧烤', emoji: '🍢' },
  { label: '粉面', value: '粉面', emoji: '🍜' },
  { label: '汉堡炸鸡', value: '汉堡', emoji: '🍔' }
]

// 口味偏好 - 价位
const BUDGET_OPTIONS = [
  { label: '25块以内', value: 'low', emoji: '💚' },
  { label: '25~50块', value: 'mid', emoji: '🧡' },
  { label: '无所谓', value: 'any', emoji: '💛' }
]

// 吃货人格
const PERSONALITIES = {
  spicy_lover: {
    title: '无辣不欢型',
    desc: '你的身体是辣椒做的，给辣菜的分永远偏高',
    emoji: '🌶️'
  },
  budget_hunter: {
    title: '性价比猎人',
    desc: '25块以内必须吃饱，一分钱一分货是你的信条',
    emoji: '💰'
  },
  mine_sweeper: {
    title: '专业踩雷选手',
    desc: '别人没踩过的店你总是第一个中招，感谢牺牲',
    emoji: '💣'
  },
  five_star_forever: {
    title: '什么都好吃',
    desc: '五星常客，给每家都打满分，人间至宝',
    emoji: '⭐'
  },
  food_detective: {
    title: '吃货侦探',
    desc: '评价字数最多，连包装有没有漏汁都要写进去',
    emoji: '🔍'
  },
  laid_back: {
    title: '佛系选手',
    desc: '很少写评价，但一旦写了，肯定是踩了大雷',
    emoji: '😌'
  },
  adventurer: {
    title: '尝鲜达人',
    desc: '总去没人评过的新店，吃货界的探险家',
    emoji: '🗺️'
  },
  regular: {
    title: '老饕',
    desc: '认准了就不变心，同一家店可以回头十次',
    emoji: '👴'
  }
}

// TabBar 页面路径（用于自定义 TabBar 激活判断）
const TAB_PAGES = [
  'pages/square/index',
  'pages/index/index',
  'pages/profile/index'
]

module.exports = {
  REVIEW_TAGS,
  MOOD_TAGS,
  SPICY_OPTIONS,
  FORBIDDEN_OPTIONS,
  CATEGORY_OPTIONS,
  BUDGET_OPTIONS,
  PERSONALITIES,
  TAB_PAGES
}
