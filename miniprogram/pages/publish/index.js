const { callWithLoading, call } = require('../../utils/request')
const { REVIEW_TAGS, MOOD_TAGS } = require('../../utils/constants')

Page({
  data: {
    merchantId: '',
    merchantName: '',
    searchKeyword: '',
    score: 0,
    subScores: { taste: 0, portion: 0, packaging: 0, speed: 0 },
    content: '',
    images: [],
    selectedTags: [],
    selectedMood: '',
    allTags: REVIEW_TAGS,
    moodTags: MOOD_TAGS,
    submitting: false,
    searchResults: [],
    searching: false,
    // OCR 导入相关
    ocrItems: [],
    ocrAmount: null,
    draftLoading: false  // AI 正在生成草稿
  },

  onLoad(options) {
    const rawName = options.merchantName
    const name = rawName && rawName !== 'undefined' ? decodeURIComponent(rawName) : ''
    const id = options.merchantId && options.merchantId !== 'undefined' ? options.merchantId : ''
    if (name) {
      this.setData({
        merchantId: id,
        merchantName: id ? name : '',
        searchKeyword: name
      })
      // 有名字但没 ID —— 自动搜索并确认（来自 OCR 导入且创建失败时的兜底）
      if (!id) {
        setTimeout(() => this._autoConfirmMerchant(name), 600)
      }
    }

    // 读取 OCR 暂存数据并生成草稿
    const app = getApp()
    const ocrData = app.globalData.pendingOcrData
    if (ocrData) {
      app.globalData.pendingOcrData = null
      this.setData({
        ocrItems: ocrData.items || [],
        ocrAmount: ocrData.totalAmount
      })
      if (ocrData.items && ocrData.items.length > 0) {
        this._generateDraft(ocrData)
      }
    }
  },

  async _generateDraft(ocrData) {
    this.setData({ draftLoading: true })
    const { merchantName, items, totalAmount } = ocrData
    const itemNames = items.map(it => it.name).join('、')
    const amountText = totalAmount ? `¥${totalAmount}` : ''
    const prompt = `我刚点了「${merchantName}」的外卖，点了${itemNames}${amountText ? `，花了${amountText}` : ''}。帮我用口语化的语气起草一段外卖评价，不超过80字，留出省略号让我补充自己的感受，不要用书面语，直接写评价正文。`

    try {
      const res = await wx.cloud.extend.AI.createModel('cloudbase').streamText({
        data: {
          model: 'deepseek-v3.2',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
          temperature: 0.85
        }
      })
      let draft = ''
      for await (const event of res.eventStream) {
        if (event.data === '[DONE]') break
        try {
          const data = JSON.parse(event.data)
          const text = data?.choices?.[0]?.delta?.content
          if (text) {
            draft += text
            this.setData({ content: draft })
          }
        } catch (_) {}
      }
    } catch (e) {
      // AI 失败时用模板兜底
      const fallback = `这次点了${itemNames}，${amountText ? `总共${amountText}，` : ''}整体感觉…（在这里写你的真实感受）`
      this.setData({ content: fallback })
    }
    this.setData({ draftLoading: false })
  },

  // 有名字但无 ID 时自动查找/创建商家并确认
  async _autoConfirmMerchant(name) {
    try {
      const res = await call('getMerchants', {
        keyword: name,
        createIfNotExist: true,
        source: 'ocr'
      })
      const list = res.list || []
      if (!list.length) return
      const match = list.find(m => m.name === name) || list[0]
      this.setData({
        merchantId: match._id,
        merchantName: match.name,
        searchKeyword: match.name,
        searchResults: []
      })
    } catch (e) {
      console.warn('auto confirm merchant failed', e)
    }
  },

  setScore(e) {
    this.setData({ score: e.detail.score })
  },
  setSubScore(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`subScores.${key}`]: e.detail.score })
  },
  inputContent(e) {
    this.setData({ content: e.detail.value })
  },
  onTagChange(e) {
    this.setData({ selectedTags: e.detail.selected })
  },
  selectMood(e) {
    const val = e.currentTarget.dataset.value
    this.setData({ selectedMood: this.data.selectedMood === val ? '' : val })
  },

  chooseImage() {
    if (this.data.images.length >= 6) {
      wx.showToast({ title: '最多上传 6 张', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: 6 - this.data.images.length,
      mediaType: ['image'],
      success: (res) => {
        const temp = res.tempFiles.map(f => ({ tempFilePath: f.tempFilePath, uploading: false }))
        this.setData({ images: [...this.data.images, ...temp] })
      }
    })
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
  },

  previewImage(e) {
    const idx = e.currentTarget.dataset.index
    const urls = this.data.images.map(i => i.tempFilePath).filter(Boolean)
    wx.previewImage({ current: urls[idx], urls })
  },

  // 搜索框输入——同步 searchKeyword 并触发搜索
  inputSearch(e) {
    const kw = e.detail.value
    this.setData({ searchKeyword: kw, merchantId: '', merchantName: '' })
    if (!kw.trim()) { this.setData({ searchResults: [] }); return }
    clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => this.doSearch(kw.trim()), 400)
  },

  async doSearch(kw) {
    this.setData({ searching: true })
    try {
      const res = await call('getMerchants', { keyword: kw, pageSize: 10 })
      this.setData({ searchResults: res.list || [], searching: false })
    } catch (e) {
      this.setData({ searching: false })
    }
  },

  selectMerchant(e) {
    const { id, name } = e.currentTarget.dataset
    this.setData({
      merchantId: id,
      merchantName: name,
      searchKeyword: name,
      searchResults: []
    })
  },

  async submit() {
    // 有商家名但还没确认 ID（异步确认还没完成），先同步确认一次
    if (!this.data.merchantId && this.data.searchKeyword.trim()) {
      wx.showLoading({ title: '确认商家中…', mask: true })
      await this._autoConfirmMerchant(this.data.searchKeyword.trim())
      wx.hideLoading()
    }
    if (!this.data.merchantId) { wx.showToast({ title: '先选个商家', icon: 'none' }); return }
    if (!this.data.score) { wx.showToast({ title: '给个总分吧', icon: 'none' }); return }
    if (this.data.content.length < 10) { wx.showToast({ title: '评价至少写 10 个字', icon: 'none' }); return }

    this.setData({ submitting: true })

    // 先上传图片到云存储
    const uploadedImages = []
    for (const img of this.data.images) {
      if (!img.tempFilePath) continue
      try {
        const ext = img.tempFilePath.split('.').pop()
        const name = `reviews/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath: name, filePath: img.tempFilePath })
        uploadedImages.push(uploadRes.fileID)
      } catch (e) {
        console.warn('图片上传失败', e)
      }
    }

    try {
      await callWithLoading('createReview', {
        merchantId: this.data.merchantId,
        score: this.data.score,
        subScores: this.data.subScores,
        content: this.data.content,
        images: uploadedImages,
        tags: this.data.selectedTags,
        mood: this.data.selectedMood,
        orderItems: this.data.ocrItems || [],
        totalAmount: this.data.ocrAmount
      }, '发布中…')
      wx.showToast({ title: '发出去了！', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/square/index' }), 1200)
    } catch (e) {
      this.setData({ submitting: false })
    }
  }
})
