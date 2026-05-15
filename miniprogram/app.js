const CLOUD_ENV_ID = 'cloud1-d2gtx2h3s8530c3bb'

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    hasOnboarded: false,
    cloudEnvId: CLOUD_ENV_ID,
    pendingOcrData: null
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请升级微信基础库到 2.2.3 以上')
      return
    }

    if (CLOUD_ENV_ID === 'YOUR_ENV_ID') {
      wx.showModal({
        title: '还差最后一步',
        content: '请在 app.js 把 YOUR_ENV_ID 替换成你的云开发环境 ID',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }

    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })

    // 先读本地缓存（让页面有初始值，避免闪屏）
    const userInfo = wx.getStorageSync('userInfo')
    const hasOnboarded = wx.getStorageSync('hasOnboarded')
    if (userInfo) {
      this.globalData.userInfo = userInfo
      this.globalData.isLoggedIn = true
    }
    if (hasOnboarded) {
      this.globalData.hasOnboarded = true
    }

    // 每次启动都做云端验证，authReady 供各页面 await
    this.authReady = this._verifyAuth()
  },

  /**
   * 调用 login 云函数验证身份，返回应跳转的起始步骤
   * -1 = 已完成所有步骤，正常进入主界面
   *  0 = 全新用户，从第 0 步（身份绑定）开始
   *  1 = 已有用户但未绑定群组，从第 1 步（群组）开始
   *  2 = 已有群组但未设置偏好，从第 2 步（偏好）开始
   */
  _verifyAuth() {
    return new Promise((resolve) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            resolve(this.globalData.isLoggedIn ? -1 : 0)
            return
          }
          wx.cloud.callFunction({ name: 'login', data: { code: res.code } })
            .then(({ result }) => {
              if (result && result.code === 0) {
                const userInfo = result.userInfo
                this.globalData.userInfo = userInfo
                this.globalData.isLoggedIn = true
                wx.setStorageSync('userInfo', userInfo)

                if (!userInfo.companyId) {
                  // 未绑定群组
                  this.globalData.hasOnboarded = false
                  wx.removeStorageSync('hasOnboarded')
                  resolve(result.isNewUser ? 0 : 1)
                } else if (!wx.getStorageSync('hasOnboarded')) {
                  // 有群组但偏好未设置
                  this.globalData.hasOnboarded = false
                  resolve(2)
                } else {
                  // 全部完成，正常进入
                  this.globalData.hasOnboarded = true
                  resolve(-1)
                }
              } else {
                // 云端登录失败，清除缓存
                this.globalData.isLoggedIn = false
                this.globalData.hasOnboarded = false
                wx.removeStorageSync('userInfo')
                wx.removeStorageSync('hasOnboarded')
                resolve(0)
              }
            })
            .catch(() => {
              // 网络异常，降级用缓存
              resolve(this.globalData.isLoggedIn && this.globalData.hasOnboarded ? -1 : 0)
            })
        },
        fail: () => resolve(0)
      })
    })
  }
})
