const { timeAgo, truncate } = require('../../utils/format')

Component({
  properties: {
    review: { type: Object, value: {} },
    showMerchant: { type: Boolean, value: false }
  },
  data: {
    expanded: false
  },
  computed: {},
  methods: {
    tapExpand() {
      this.setData({ expanded: !this.data.expanded })
    },
    tapMerchant() {
      if (!this.properties.showMerchant) return
      wx.navigateTo({ url: `/pages/merchant-detail/index?id=${this.properties.review.merchantId}` })
    },
    previewImage(e) {
      const idx = e.currentTarget.dataset.index
      const images = this.properties.review.images || []
      const approved = images.filter(img => img.imgStatus === 'approved').map(img => img.fileID)
      if (!approved.length) return
      wx.previewImage({ current: approved[idx] || approved[0], urls: approved })
    },
    formatTime(dateStr) {
      return timeAgo(dateStr)
    }
  }
})
