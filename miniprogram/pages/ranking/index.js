const { call } = require('../../utils/request')
const { formatMonth } = require('../../utils/format')

Page({
  data: {
    loading: true,
    ranking: null,
    month: ''
  },

  onLoad() {
    this.loadRanking()
  },

  async loadRanking() {
    try {
      const res = await call('getRanking', {})
      this.setData({
        ranking: res.ranking,
        month: formatMonth(new Date().toISOString()),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  onPullDownRefresh() {
    this.loadRanking().then(() => wx.stopPullDownRefresh())
  },

  shareRanking() {
    wx.showToast({ title: '长按截图分享到群里吧', icon: 'none' })
  }
})
