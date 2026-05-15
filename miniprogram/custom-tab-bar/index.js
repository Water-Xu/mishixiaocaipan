Component({
  data: {
    selected: 0,
    list: [
      { text: '广场', icon: '🍱', selectedIcon: '🍱', pagePath: '/pages/square/index' },
      { text: '今天吃啥', icon: '🎲', selectedIcon: '🎲', pagePath: '/pages/index/index' },
      { text: '我的', icon: '👤', selectedIcon: '👤', pagePath: '/pages/profile/index' }
    ]
  },
  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.list[index]
      wx.switchTab({ url: item.pagePath })
    }
  }
})
