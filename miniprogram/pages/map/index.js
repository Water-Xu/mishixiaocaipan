const { call } = require('../../utils/request')

Page({
  data: {
    latitude: 39.9042,
    longitude: 116.4074,
    markers: [],
    loading: true,
    selectedMerchant: null,
    showPopover: false
  },

  onLoad() {
    this.getLocation()
  },

  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude
        })
        this.loadMerchants(res.latitude, res.longitude)
      },
      fail: () => {
        this.loadMerchants(this.data.latitude, this.data.longitude)
      }
    })
  },

  async loadMerchants(lat, lng) {
    try {
      const res = await call('getMerchants', { lat, lng, radius: 5000 })
      const markers = (res.list || []).map((m, i) => ({
        id: i,
        latitude: m.location?.lat || lat,
        longitude: m.location?.lng || lng,
        title: m.name,
        iconPath: '',
        width: 40,
        height: 40,
        callout: {
          content: m.avgScore >= 4 ? '😊' : m.avgScore <= 2 ? '💣' : '•',
          color: m.avgScore >= 4 ? '#4CAF7D' : m.avgScore <= 2 ? '#F54B2A' : '#9E9185',
          fontSize: 20,
          borderRadius: 20,
          bgColor: '#FFFFFF',
          padding: 4,
          display: 'ALWAYS'
        },
        _data: m
      }))
      this.setData({ markers, loading: false })
      this._merchantMap = {}
      res.list?.forEach(m => { this._merchantMap[m._id] = m })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  tapMarker(e) {
    const markerId = e.markerId
    const marker = this.data.markers.find(m => m.id === markerId)
    if (marker) {
      this.setData({ selectedMerchant: marker._data, showPopover: true })
    }
  },

  closePopover() {
    this.setData({ showPopover: false })
  },

  goDetail() {
    const m = this.data.selectedMerchant
    if (!m) return
    this.setData({ showPopover: false })
    wx.navigateTo({ url: `/pages/merchant-detail/index?id=${m._id}` })
  }
})
