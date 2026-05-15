Component({
  properties: {
    score: { type: Number, value: 0 },
    readonly: { type: Boolean, value: false },
    size: { type: String, value: 'normal' } // normal | large | small
  },
  data: {
    stars: []
  },
  observers: {
    score(val) {
      this.setData({ stars: this._buildStars(val) })
    }
  },
  lifetimes: {
    attached() {
      this.setData({ stars: this._buildStars(this.properties.score) })
    }
  },
  methods: {
    _buildStars(score) {
      return [1, 2, 3, 4, 5].map(i => ({
        index: i,
        type: i <= score ? 'full' : 'empty'
      }))
    },
    tapStar(e) {
      if (this.properties.readonly) return
      const val = e.currentTarget.dataset.index
      this.setData({ stars: this._buildStars(val) })
      this.triggerEvent('change', { score: val })
    }
  }
})
