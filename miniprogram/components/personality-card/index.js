const { PERSONALITIES } = require('../../utils/constants')

Component({
  properties: {
    personality: { type: String, value: '' },
    nickName: { type: String, value: '' }
  },
  computed: {},
  methods: {
    getPersonality() {
      return PERSONALITIES[this.properties.personality] || {
        title: '神秘食客',
        desc: '还没写过什么评价，低调神秘的存在',
        emoji: '🕵️'
      }
    },
    share() {
      wx.showToast({ title: '长按图片可以分享哦', icon: 'none' })
    }
  }
})
