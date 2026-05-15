const { callWithLoading } = require('../../utils/request')
const { formatMoney } = require('../../utils/format')

Page({
  data: {
    step: 0, // 0=选图, 1=识别结果确认
    uploading: false,
    recognizing: false,
    result: null,
    confirmed: false
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath
        this.setData({ uploading: true })
        try {
          const ext = path.split('.').pop()
          const cloudPath = `ocr-temp/${Date.now()}.${ext}`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: path })
          this.setData({ uploading: false, recognizing: true })
          const ocrRes = await callWithLoading('ocr', { fileID: uploadRes.fileID }, '识别中…')
          this.setData({
            recognizing: false,
            step: 1,
            result: {
              ...ocrRes,
              fileID: uploadRes.fileID,
              tempPath: path
            }
          })
        } catch (e) {
          this.setData({ uploading: false, recognizing: false })
          wx.showToast({ title: '识别失败，试试手动输入', icon: 'none' })
        }
      }
    })
  },

  inputMerchantName(e) {
    this.setData({ 'result.merchantName': e.detail.value })
  },
  inputAmount(e) {
    this.setData({ 'result.totalAmount': e.detail.value })
  },

  async confirm() {
    const r = this.data.result
    if (!r.merchantName) {
      wx.showToast({ title: '店名不能空着', icon: 'none' })
      return
    }
    this.setData({ confirmed: true })
    try {
      const res = await callWithLoading('getMerchants', {
        keyword: r.merchantName,
        createIfNotExist: true,
        totalAmount: r.totalAmount,
        items: r.items || [],
        source: 'ocr'
      }, '保存中…')
      const merchant = res.list && res.list[0]

      // 把 OCR 识别结果存到全局，publish 页面读取后自动填充
      const app = getApp()
      app.globalData.pendingOcrData = {
        merchantName: r.merchantName,
        totalAmount: r.totalAmount,
        items: r.items || []
      }

      wx.showToast({ title: '导入成功', icon: 'success' })
      setTimeout(() => {
        const id = merchant?._id || ''
        const name = encodeURIComponent(r.merchantName || '')
        wx.navigateTo({ url: `/pages/publish/index?merchantId=${id}&merchantName=${name}` })
      }, 800)
    } catch (e) {
      this.setData({ confirmed: false })
    }
  },

  retake() {
    this.setData({ step: 0, result: null })
  },

  goManual() {
    wx.navigateTo({ url: '/pages/publish/index' })
  },

  previewExample() {
    wx.previewImage({
      urls: ['/images/eg.jpg'],
      current: '/images/eg.jpg'
    })
  }
})
