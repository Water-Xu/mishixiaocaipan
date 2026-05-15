Component({
  properties: {
    merchant: { type: Object, value: {} }
  },
  methods: {
    tapCard() {
      wx.navigateTo({ url: `/pages/merchant-detail/index?id=${this.properties.merchant._id}` })
    }
  }
})
