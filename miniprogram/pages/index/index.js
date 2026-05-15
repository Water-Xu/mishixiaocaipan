const { call } = require('../../utils/request')

Page({
  data: {
    rolling: false,
    result: null,
    excludeIds: [],
    chatMode: false,
    chatInput: '',
    loading: false
  },

  onLoad() {},

  onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 1 })
    }
    wx.onAccelerometerChange(res => {
      const shake = Math.abs(res.x) + Math.abs(res.y) + Math.abs(res.z)
      if (shake > 2.8 && !this.data.rolling) {
        this.rollDice()
      }
    })
  },

  onHide() {
    wx.stopAccelerometer()
  },

  rollDice() {
    if (this.data.rolling) return
    this.setData({ rolling: true, result: null })
  },

  async onDiceDone() {
    const app = getApp()
    const userId = app.globalData.userInfo?._id
    this.setData({ loading: true })
    try {
      const res = await call('aiRecommend', {
        userId,
        excludeIds: this.data.excludeIds
      })
      this.setData({
        rolling: false,
        loading: false,
        result: res,
        excludeIds: [...this.data.excludeIds, res.merchant?._id].filter(Boolean)
      })
    } catch (e) {
      this.setData({ rolling: false, loading: false })
      wx.showToast({ title: '没找到合适的，换个条件？', icon: 'none' })
    }
  },

  reroll() {
    this.setData({ result: null })
    setTimeout(() => this.rollDice(), 150)
  },

  confirmMerchant() {
    const merchant = this.data.result?.merchant
    if (!merchant) return
    wx.navigateTo({ url: `/pages/publish/index?merchantId=${merchant._id}&merchantName=${encodeURIComponent(merchant.name)}` })
  },

  goMerchantDetail() {
    const merchant = this.data.result?.merchant
    if (!merchant) return
    wx.navigateTo({ url: `/pages/merchant-detail/index?id=${merchant._id}` })
  },

  toggleChat() {
    this.setData({ chatMode: !this.data.chatMode })
  },

  inputChat(e) {
    this.setData({ chatInput: e.detail.value })
  },

  async sendChat() {
    if (!this.data.chatInput.trim()) return
    const app = getApp()
    this.setData({ loading: true })
    try {
      const res = await call('aiRecommend', {
        userId: app.globalData.userInfo?._id,
        chatQuery: this.data.chatInput,
        excludeIds: this.data.excludeIds
      })
      this.setData({ result: res, loading: false, chatInput: '' })
    } catch (e) {
      this.setData({ loading: false })
    }
  }
})
