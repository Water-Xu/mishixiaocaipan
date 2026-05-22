const { call, callWithLoading } = require('../../utils/request')
const { timeAgo, truncate } = require('../../utils/format')
const { SPICY_OPTIONS, FORBIDDEN_OPTIONS, CATEGORY_OPTIONS, BUDGET_OPTIONS } = require('../../utils/constants')

Page({
  data: {
    userInfo: null,
    company: null,
    reviews: [],
    loading: true,
    editingPref: false,
    preference: { spicy: '', forbidden: [], category: [], budget: '' },
    forbiddenSet: {},
    categorySet: {},
    displaySpicy: '未设置',
    displayForbidden: '没有忌口',
    displayCategory: '什么都吃',
    displayBudget: '未设置',
    spicyOptions: SPICY_OPTIONS,
    forbiddenOptions: FORBIDDEN_OPTIONS,
    categoryOptions: CATEGORY_OPTIONS,
    budgetOptions: BUDGET_OPTIONS
  },

  onLoad() {
    this.loadProfile()
  },

  async onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 2 })
    }
    const app = getApp()
    const step = await app.authReady
    if (step >= 0) {
      wx.reLaunch({ url: `/pages/onboarding/index?step=${step}` })
    }
  },

  async loadProfile() {
    const app = getApp()
    const localUser = app.globalData.userInfo
    this.setData({ userInfo: localUser })
    try {
      const res = await call('getUserInfo', {})
      const remotePref = res.userInfo?.preference
      const pref = {
        spicy: remotePref?.spicy || '',
        forbidden: remotePref?.forbidden || [],
        category: remotePref?.category || [],
        budget: remotePref?.budget || ''
      }
      this.setData({
        userInfo: res.userInfo,
        company: res.company || null,
        reviews: (res.reviews || []).map(r => ({
          ...r,
          contentShort: truncate(r.content, 60),
          createdAt: timeAgo(r.createdAt)
        })),
        preference: pref,
        ...this._buildActiveSets(pref),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  // 把 forbidden/category 数组转成 { value: true } 对象 + 预计算展示文字
  _buildActiveSets(pref) {
    const forbiddenSet = {}
    const categorySet = {}
    ;(pref?.forbidden || []).forEach(v => { forbiddenSet[v] = true })
    ;(pref?.category || []).forEach(v => { categorySet[v] = true })

    const spicyMap = { none: '完全不辣', mild: '微辣就好', hot: '越辣越好', light: '清淡为主' }
    const budgetMap = { low: '25块以内', mid: '25~50块', any: '无所谓' }

    return {
      forbiddenSet,
      categorySet,
      displaySpicy: spicyMap[pref?.spicy] || '未设置',
      displayForbidden: (pref?.forbidden || []).length ? (pref.forbidden || []).join('、') : '没有忌口',
      displayCategory: (pref?.category || []).length ? (pref.category || []).join('、') : '什么都吃',
      displayBudget: budgetMap[pref?.budget] || '未设置'
    }
  },

  toggleEditPref() {
    this.setData({ editingPref: !this.data.editingPref })
  },

  selectSpicy(e) {
    this.setData({ 'preference.spicy': e.currentTarget.dataset.value })
  },
  toggleForbidden(e) {
    const val = e.currentTarget.dataset.value
    const arr = [...(this.data.preference?.forbidden || [])]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    const pref = { ...this.data.preference, forbidden: arr }
    this.setData({ preference: pref, ...this._buildActiveSets(pref) })
  },
  toggleCategory(e) {
    const val = e.currentTarget.dataset.value
    const arr = [...(this.data.preference?.category || [])]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    const pref = { ...this.data.preference, category: arr }
    this.setData({ preference: pref, ...this._buildActiveSets(pref) })
  },
  selectBudget(e) {
    this.setData({ 'preference.budget': e.currentTarget.dataset.value })
  },

  async savePref() {
    try {
      await callWithLoading('updateUserInfo', { preference: this.data.preference }, '保存中…')
      this.setData({ editingPref: false, ...this._buildActiveSets(this.data.preference) })
      wx.showToast({ title: '保存了', icon: 'success' })
    } catch (e) {}
  },

  goRanking() {
    wx.navigateTo({ url: '/pages/ranking/index' })
  },

  goReview(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/merchant-detail/index?id=${id}` })
  },

  copyInviteCode() {
    const code = this.data.company?.inviteCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '团队码已复制', icon: 'success' })
    })
  },

  leaveTeam() {
    wx.showModal({
      title: '退出团队？',
      content: '退出后看不到同事动态，你的评价会保留。之后可凭团队码再加入。',
      confirmText: '退出',
      confirmColor: '#F54B2A',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callWithLoading('leaveCompany', {}, '处理中…')
          const app = getApp()
          const userInfo = { ...app.globalData.userInfo, companyId: '', inviteCode: '' }
          app.globalData.userInfo = userInfo
          wx.setStorageSync('userInfo', userInfo)
          wx.reLaunch({ url: '/pages/onboarding/index?step=1' })
        } catch (e) { /* toast by call */ }
      }
    })
  }
})
