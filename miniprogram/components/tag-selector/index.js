Component({
  properties: {
    tags: { type: Array, value: [] },
    selected: { type: Array, value: [] },
    max: { type: Number, value: 999 }
  },
  data: {
    _selected: [],
    _selectedSet: {}   // { value: true } 供 WXML 直接查询，避免 indexOf 不可靠
  },
  observers: {
    'selected': function (val) {
      const arr = Array.isArray(val) ? val : []
      const set = {}
      arr.forEach(v => { set[v] = true })
      this.setData({ _selected: arr, _selectedSet: set })
    }
  },
  methods: {
    toggle(e) {
      const val = e.currentTarget.dataset.value
      const current = [...this.data._selected]
      const idx = current.indexOf(val)
      if (idx > -1) {
        current.splice(idx, 1)
      } else {
        if (current.length >= this.properties.max) {
          wx.showToast({ title: `最多选 ${this.properties.max} 个`, icon: 'none' })
          return
        }
        current.push(val)
      }
      const set = {}
      current.forEach(v => { set[v] = true })
      this.setData({ _selected: current, _selectedSet: set })
      this.triggerEvent('change', { selected: current })
    }
  }
})
