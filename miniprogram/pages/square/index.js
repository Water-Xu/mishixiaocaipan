const { call } = require('../../utils/request')
const { timeAgo, truncate } = require('../../utils/format')

Page({
  data: {
    reviews: [],
    loading: true,
    loadingMore: false,
    noMore: false,
    sortBy: 'latest', // latest | hot | bad
    filterLabel: '最新出炉',
    page: 1,
    pageSize: 10
  },

  async onLoad() {
    const app = getApp()
    const step = await app.authReady
    if (step >= 0) {
      wx.reLaunch({ url: `/pages/onboarding/index?step=${step}` })
      return
    }
    this.loadReviews(true)
  },

  onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  async loadReviews(reset = false) {
    if (reset) {
      this.setData({ loading: true, page: 1, noMore: false, reviews: [] })
    } else {
      if (this.data.loadingMore || this.data.noMore) return
      this.setData({ loadingMore: true })
    }

    try {
      const res = await call('getReviews', {
        sortBy: this.data.sortBy,
        page: reset ? 1 : this.data.page,
        pageSize: this.data.pageSize
      })
      const list = this._processReviews(res.list || [])
      if (reset) {
        this.setData({ reviews: list, loading: false, page: 2 })
      } else {
        this.setData({
          reviews: [...this.data.reviews, ...list],
          loadingMore: false,
          page: this.data.page + 1,
          noMore: list.length < this.data.pageSize
        })
      }
    } catch (e) {
      this.setData({ loading: false, loadingMore: false })
    }
  },

  _processReviews(list) {
    return list.map(r => ({
      ...r,
      contentShort: truncate(r.content, 80),
      createdAt: timeAgo(r.createdAt)
    }))
  },

  switchSort(e) {
    const sortBy = e.currentTarget.dataset.sort
    const labels = { latest: '最新出炉', hot: '最多人赞', bad: '差评集中营' }
    if (sortBy === this.data.sortBy) return
    this.setData({ sortBy, filterLabel: labels[sortBy] })
    this.loadReviews(true)
  },

  onReachBottom() {
    this.loadReviews(false)
  },

  onPullDownRefresh() {
    this.loadReviews(true).then(() => wx.stopPullDownRefresh())
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/publish/index' })
  },

  goImport() {
    wx.navigateTo({ url: '/pages/import/index' })
  }
})
