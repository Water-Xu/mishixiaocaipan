const { call } = require('../../utils/request')
const { timeAgo, formatMoney } = require('../../utils/format')

const SUB_SCORE_LABELS = {
  taste: '口味',
  portion: '份量',
  packaging: '包装',
  speed: '配送'
}

Page({
  data: {
    reviewId: '',
    review: null,
    merchant: null,
    loading: true,
    hasOrderInfo: false,
    orderItems: [],
    subScoreList: []
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      wx.showToast({ title: '帖子不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({ reviewId: id })
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const res = await call('getReviewDetail', { reviewId: this.data.reviewId })
      const review = this._processReview(res.review || {})
      const orderItems = review.orderItems || []
      const subScoreList = this._buildSubScores(review.subScores)
      const hasOrderInfo = orderItems.length > 0 || (review.totalAmount != null && review.totalAmount !== '')
      this.setData({
        review,
        merchant: res.merchant || null,
        orderItems,
        subScoreList,
        hasOrderInfo,
        loading: false
      })
      wx.setNavigationBarTitle({
        title: review.merchantName ? `${review.merchantName}` : '评价详情'
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  _processReview(r) {
    return {
      ...r,
      orderItems: Array.isArray(r.orderItems) ? r.orderItems : [],
      contentShort: r.content,
      createdAt: timeAgo(r.createdAt),
      totalAmountLabel: r.totalAmount != null && r.totalAmount !== '' ? formatMoney(r.totalAmount) : ''
    }
  },

  _buildSubScores(subScores) {
    if (!subScores || typeof subScores !== 'object') return []
    return Object.keys(SUB_SCORE_LABELS)
      .map((key) => ({
        key,
        label: SUB_SCORE_LABELS[key],
        score: subScores[key] || 0
      }))
      .filter((item) => item.score > 0)
  },

  goMerchant() {
    const id = this.data.review?.merchantId
    if (!id) return
    wx.navigateTo({ url: `/pages/merchant-detail/index?id=${id}` })
  },

  onReviewInteractionUpdate() {
    this.loadDetail()
  }
})
