const { login } = require('../../utils/auth')
const { SPICY_OPTIONS, FORBIDDEN_OPTIONS, CATEGORY_OPTIONS, BUDGET_OPTIONS } = require('../../utils/constants')
const { call, callWithLoading } = require('../../utils/request')

Page({
  data: {
    // 步骤：0=身份绑定, 1=群组, 2=口味偏好
    step: 0,
    startStep: 0,

    // Step 0 - 身份
    avatarUrl: '',
    nickName: '',
    identityError: '',
    identityLoading: false,

    // Step 1 - 群组
    groupMode: '', // 'join' | 'create'
    inviteCode: '',
    companyName: '',
    groupError: '',
    groupLoading: false,
    joinedCompany: null, // 加入/创建成功后的群组信息

    // Step 2 - 口味偏好
    preference: { spicy: '', forbidden: [], category: [], budget: '' },
    forbiddenSet: {},
    categorySet: {},
    spicyOptions: SPICY_OPTIONS,
    forbiddenOptions: FORBIDDEN_OPTIONS,
    categoryOptions: CATEGORY_OPTIONS,
    budgetOptions: BUDGET_OPTIONS,
    submitting: false
  },

  onLoad(options) {
    const step = parseInt(options.step) || 0
    this.setData({ step, startStep: step })
  },

  // ─── Step 0：身份绑定 ────────────────────────────────────

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value.trim(), identityError: '' })
  },

  async confirmIdentity() {
    const { nickName, avatarUrl } = this.data
    if (!nickName) {
      this.setData({ identityError: '起个昵称，让大家认识你' })
      return
    }
    this.setData({ identityLoading: true, identityError: '' })
    try {
      const result = await login(nickName, avatarUrl)
      if (result.hasCompany) {
        const hasOnboarded = wx.getStorageSync('hasOnboarded')
        if (hasOnboarded) {
          const app = getApp()
          app.authReady = Promise.resolve(-1)
          wx.reLaunch({ url: '/pages/square/index' })
        } else {
          wx.pageScrollTo({ scrollTop: 0, duration: 0 })
          this.setData({ step: 2, identityLoading: false })
        }
        return
      }
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      this.setData({ step: 1, identityLoading: false })
    } catch (err) {
      this.setData({
        identityError: '登录出了点问题，稍后再试',
        identityLoading: false
      })
    }
  },

  // ─── Step 1：群组 ────────────────────────────────────────

  selectGroupMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ groupMode: mode, groupError: '', inviteCode: '', companyName: '' })
  },

  inputInviteCode(e) {
    this.setData({ inviteCode: e.detail.value.trim().toUpperCase(), groupError: '' })
  },

  inputCompanyName(e) {
    this.setData({ companyName: e.detail.value.trim(), groupError: '' })
  },

  async confirmGroup() {
    const { groupMode, inviteCode, companyName } = this.data
    if (!groupMode) {
      this.setData({ groupError: '选择加入已有群组或创建新群组' })
      return
    }

    this.setData({ groupLoading: true, groupError: '' })
    try {
      let result
      if (groupMode === 'join') {
        if (!inviteCode) {
          this.setData({ groupError: '请输入邀请码', groupLoading: false })
          return
        }
        result = await call('joinCompany', { inviteCode })
      } else {
        if (!companyName) {
          this.setData({ groupError: '请输入群组名称', groupLoading: false })
          return
        }
        result = await call('createCompany', { companyName })
      }

      const app = getApp()
      if (app.globalData.userInfo) {
        app.globalData.userInfo.companyId = result.company._id
        wx.setStorageSync('userInfo', app.globalData.userInfo)
      }
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      this.setData({ step: 2, joinedCompany: result.company, groupLoading: false })
    } catch (err) {
      const msg = err.message || ''
      this.setData({
        groupError: msg.includes('邀请码') ? msg : (groupMode === 'join' ? '邀请码不对，再试一次' : '创建失败，稍后再试'),
        groupLoading: false
      })
    }
  },

  // ─── Step 2：口味偏好 ────────────────────────────────────

  selectSpicy(e) {
    this.setData({ 'preference.spicy': e.currentTarget.dataset.value })
  },
  toggleForbidden(e) {
    const val = e.currentTarget.dataset.value
    let arr = [...this.data.preference.forbidden]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    const forbiddenSet = {}
    arr.forEach(v => { forbiddenSet[v] = true })
    this.setData({ 'preference.forbidden': arr, forbiddenSet })
  },
  toggleCategory(e) {
    const val = e.currentTarget.dataset.value
    let arr = [...this.data.preference.category]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    const categorySet = {}
    arr.forEach(v => { categorySet[v] = true })
    this.setData({ 'preference.category': arr, categorySet })
  },
  selectBudget(e) {
    this.setData({ 'preference.budget': e.currentTarget.dataset.value })
  },

  async finishOnboarding() {
    const { spicy, budget } = this.data.preference
    if (!spicy) { wx.showToast({ title: '选一个辣度吧', icon: 'none' }); return }
    if (!budget) { wx.showToast({ title: '价位也要选哦', icon: 'none' }); return }
    this.setData({ submitting: true })
    try {
      await callWithLoading('updateUserInfo', { preference: this.data.preference }, '保存中…')
      const app = getApp()
      app.globalData.hasOnboarded = true
      wx.setStorageSync('hasOnboarded', true)
      // 重置 authReady，防止 square 页拿到旧的缓存值再次跳回注册
      app.authReady = Promise.resolve(-1)
      wx.reLaunch({ url: '/pages/square/index' })
    } catch (err) {
      this.setData({ submitting: false })
    }
  }
})
