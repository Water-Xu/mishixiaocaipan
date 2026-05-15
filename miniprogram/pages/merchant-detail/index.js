const { call } = require('../../utils/request')
const { timeAgo, truncate, formatScore } = require('../../utils/format')

Page({
  data: {
    merchantId: '',
    merchant: null,
    reviews: [],
    loading: true,
    loadingMore: false,
    noMore: false,
    page: 1
  },

  onLoad(options) {
    this.setData({ merchantId: options.id })
    this.loadData()
  },

  async loadData() {
    try {
      const [mRes, rRes] = await Promise.all([
        call('getMerchants', { id: this.data.merchantId }),
        call('getReviews', { merchantId: this.data.merchantId, page: 1, pageSize: 10 })
      ])
      this.setData({
        merchant: mRes.merchant,
        reviews: this._processReviews(rRes.list || []),
        loading: false,
        page: 2
      })
      wx.setNavigationBarTitle({ title: mRes.merchant?.name || '商家详情' })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  async loadMoreReviews() {
    if (this.data.loadingMore || this.data.noMore) return
    this.setData({ loadingMore: true })
    try {
      const res = await call('getReviews', {
        merchantId: this.data.merchantId,
        page: this.data.page,
        pageSize: 10
      })
      const list = this._processReviews(res.list || [])
      this.setData({
        reviews: [...this.data.reviews, ...list],
        loadingMore: false,
        page: this.data.page + 1,
        noMore: list.length < 10
      })
    } catch (e) {
      this.setData({ loadingMore: false })
    }
  },

  _processReviews(list) {
    return list.map(r => ({
      ...r,
      contentShort: truncate(r.content, 80),
      createdAt: timeAgo(r.createdAt)
    }))
  },

  onReachBottom() {
    this.loadMoreReviews()
  },

  goPublish() {
    const m = this.data.merchant
    if (!m) return
    wx.navigateTo({ url: `/pages/publish/index?merchantId=${m._id}&merchantName=${encodeURIComponent(m.name)}` })
  },

  voteBlacklist() {
    wx.showModal({
      title: '投票拉黑',
      content: `要把「${this.data.merchant?.name}」拉黑、不再出现在推荐里吗？`,
      confirmText: '投票',
      confirmColor: '#F54B2A',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await call('getMerchants', { action: 'voteBlacklist', id: this.data.merchantId })
          wx.showToast({ title: '投票成功', icon: 'success' })
        } catch (e) {}
      }
    })
  }
})
