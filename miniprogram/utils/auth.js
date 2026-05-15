/**
 * 登录态管理
 */
const { call } = require('./request')

// 登录（绑定身份：昵称 + 头像）
const login = (nickName, avatarUrl) => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          reject(new Error('wx.login 失败'))
          return
        }
        call('login', { code: res.code, nickName, avatarUrl })
          .then(result => {
            const app = getApp()
            app.globalData.userInfo = result.userInfo
            app.globalData.isLoggedIn = true
            wx.setStorageSync('userInfo', result.userInfo)
            if (result.isNewUser) {
              app.globalData.hasOnboarded = false
              wx.removeStorageSync('hasOnboarded')
            }
            resolve(result)
          })
          .catch(reject)
      },
      fail: reject
    })
  })
}

// 静默登录（无需昵称，刷新 session）
const silentLogin = () => {
  const app = getApp()
  if (app.globalData.isLoggedIn) return Promise.resolve(app.globalData.userInfo)

  const userInfo = wx.getStorageSync('userInfo')
  if (userInfo) {
    app.globalData.userInfo = userInfo
    app.globalData.isLoggedIn = true
    return Promise.resolve(userInfo)
  }

  return Promise.reject(new Error('未登录'))
}

// 检查是否需要跳转到登录或引导页
const checkAndRedirect = () => {
  const app = getApp()
  if (!app.globalData.isLoggedIn) {
    wx.reLaunch({ url: '/pages/onboarding/index' })
    return false
  }
  if (!app.globalData.hasOnboarded) {
    wx.reLaunch({ url: '/pages/onboarding/index' })
    return false
  }
  return true
}

module.exports = { login, silentLogin, checkAndRedirect }
