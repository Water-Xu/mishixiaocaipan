/**
 * 云函数调用统一封装
 * 含 loading 状态、错误提示、重试逻辑
 */

const call = (name, data = {}, options = {}) => {
  const { showLoading = false, loadingText = '加载中…', showError = true } = options

  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true })
  }

  return wx.cloud.callFunction({ name, data })
    .then(res => {
      if (showLoading) wx.hideLoading()
      const result = res.result
      // code 为 0 或者没有 code 字段的都算成功
      if (result && result.code !== undefined && result.code !== 0) {
        if (showError) {
          wx.showToast({
            title: result.message || '出了点小问题',
            icon: 'none',
            duration: 2000
          })
        }
        return Promise.reject(result)
      }
      return result
    })
    .catch(err => {
      if (showLoading) wx.hideLoading()
      console.error(`云函数 ${name} 调用失败:`, err)
      if (showError && !err.code) {
        wx.showToast({
          title: '网络开小差了，稍后再试',
          icon: 'none',
          duration: 2000
        })
      }
      return Promise.reject(err)
    })
}

// 带 loading 的快捷方式
const callWithLoading = (name, data = {}, loadingText = '加载中…') => {
  return call(name, data, { showLoading: true, loadingText })
}

// 静默调用（不显示 loading 也不弹错误）
const callSilent = (name, data = {}) => {
  return call(name, data, { showLoading: false, showError: false })
}

module.exports = { call, callWithLoading, callSilent }
