// 心动伴侣 · 默认数据结构（Electron 与浏览器共用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HeartbeatDefaults = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    profile: {
      nickname: '我',
      partnerName: 'TA',
      loveStartDate: new Date().toISOString().split('T')[0],
      avatar: '💖',
      moodToday: null
    },
    anniversaries: [],
    diaries: [],
    whispers: [],
    wishes: [],
    album: [],
    chat: { clientId: '', messages: [] },
    binding: {
      bound: false,
      myCode: '',
      partnerCode: '',
      bindDate: '',
      partnerName: 'TA',
      partnerLocation: '未上报',
      partnerBattery: null,
      partnerBatterySupported: true,
      partnerCharging: false,
      partnerStatusAt: '',
      partnerWeather: null,
      partnerLat: null,
      partnerLng: null
    },
    account: {
      userId: '',
      email: ''
    },
    settings: {
      theme: 'romantic',
      dailyQuote: true,
      cloud: {
        supabaseUrl: '',
        supabaseAnonKey: '',
        amapKey: ''
      }
    }
  };
});
