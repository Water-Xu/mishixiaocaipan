const { timeAgo } = require('../../utils/format')
const { call } = require('../../utils/request')

Component({
  properties: {
    review: { type: Object, value: {} },
    showMerchant: { type: Boolean, value: false },
    linkable: { type: Boolean, value: true },
    defaultExpanded: { type: Boolean, value: false }
  },
  data: {
    expanded: false,
    avatarBroken: false,
    commentLines: [],
    challengeLines: [],
    acting: false
  },
  observers: {
    'review._id, review.userAvatarUrl': function () {
      this.setData({ avatarBroken: false })
    },
    defaultExpanded: function (val) {
      if (val) this.setData({ expanded: true })
    },
    'review.interactionComments': function (list) {
      if (!list || !list.length) {
        this.setData({ commentLines: [] })
        return
      }
      const commentLines = list.map(c => ({
        ...c,
        timeLabel: timeAgo(c.createdAt)
      }))
      this.setData({ commentLines })
    },
    'review.interactionChallenges': function (list) {
      if (!list || !list.length) {
        this.setData({ challengeLines: [] })
        return
      }
      const challengeLines = list.map(c => ({
        ...c,
        timeLabel: timeAgo(c.createdAt)
      }))
      this.setData({ challengeLines })
    }
  },
  methods: {
    onAvatarError() {
      this.setData({ avatarBroken: true })
    },
    tapExpand() {
      if (!this.properties.linkable) return
      if (!this.data.expanded) {
        this.tapCard()
        return
      }
      this.setData({ expanded: !this.data.expanded })
    },
    tapCard() {
      if (!this.properties.linkable) return
      const rid = this.properties.review._id
      if (!rid) return
      wx.navigateTo({ url: `/pages/review-detail/index?id=${rid}` })
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
    _emitSummary(res) {
      const summary = res && res.summary
      const rid = this.properties.review._id
      if (summary && rid) {
        this.triggerEvent('interactionupdate', { reviewId: rid, summary })
      }
    },
    async onToggleLike() {
      const rid = this.properties.review._id
      if (!rid || this.data.acting) return
      this.setData({ acting: true })
      try {
        const res = await call('reviewInteraction', { action: 'toggleLike', reviewId: rid })
        this._emitSummary(res)
      } catch (e) {
        /* toast by call */
      } finally {
        this.setData({ acting: false })
      }
    },
    onTapComment() {
      const rid = this.properties.review._id
      if (!rid) return
      wx.showModal({
        title: '评价这条动态',
        editable: true,
        placeholderText: '跟个队形，说两句…',
        confirmText: '发送',
        success: async (res) => {
          if (!res.confirm) return
          const text = (res.content !== undefined && res.content !== null ? String(res.content) : '').trim()
          if (text.length < 2) {
            wx.showToast({ title: '至少两个字', icon: 'none' })
            return
          }
          this.setData({ acting: true })
          try {
            const r = await call('reviewInteraction', { action: 'addComment', reviewId: rid, content: text })
            this._emitSummary(r)
            wx.showToast({ title: '已发送', icon: 'success' })
          } catch (e) {
            /* */
          } finally {
            this.setData({ acting: false })
          }
        }
      })
    },
    onTapChallenge() {
      const rid = this.properties.review._id
      if (!rid) return
      wx.showModal({
        title: '为什么呢？',
        content: '说说你觉得哪里不对劲，帮大家对齐预期～',
        editable: true,
        placeholderText: '例如：我点过同款觉得…',
        confirmText: '发出',
        confirmColor: '#F54B2A',
        success: async (res) => {
          if (!res.confirm) return
          const text = (res.content !== undefined && res.content !== null ? String(res.content) : '').trim()
          if (text.length < 4) {
            wx.showToast({ title: '多写几句说明哦', icon: 'none' })
            return
          }
          this.setData({ acting: true })
          try {
            const r = await call('reviewInteraction', { action: 'addChallenge', reviewId: rid, content: text })
            this._emitSummary(r)
            wx.showToast({ title: '已记录', icon: 'success' })
          } catch (e) {
            /* */
          } finally {
            this.setData({ acting: false })
          }
        }
      })
    }
  }
})
