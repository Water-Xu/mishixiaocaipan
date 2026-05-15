Component({
  properties: {
    rolling: { type: Boolean, value: false }
  },
  observers: {
    rolling(val) {
      if (val) {
        this.startRoll()
      }
    }
  },
  data: {
    animClass: '',
    face: '🎲'
  },
  methods: {
    startRoll() {
      this.setData({ animClass: 'rolling' })
      const faces = ['🎲', '🎯', '🍱', '🔥', '⭐', '🎉']
      let count = 0
      const interval = setInterval(() => {
        count++
        this.setData({ face: faces[count % faces.length] })
        if (count >= 12) {
          clearInterval(interval)
          this.setData({ face: '🎲', animClass: 'bounce' })
          setTimeout(() => this.setData({ animClass: '' }), 500)
          this.triggerEvent('done')
        }
      }, 100)
    },
    tap() {
      if (this.properties.rolling) return
      this.triggerEvent('roll')
    }
  }
})
