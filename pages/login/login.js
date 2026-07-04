const api = require('../../utils/api.js');

const app = getApp();

Page({
  data: {
    mode: 'login', // 'login' | 'register'
    username: '',
    password: '',
    loading: false,
    wechatLoading: false,
  },

  onLoad() {
    // Auto-forward if we already have a valid-looking session. WeChat users who
    // haven't finished the mandatory profile step are routed back to it.
    const session = app.globalData.session;
    if (session && session.token) {
      let needProfile = false;
      try {
        needProfile = !!wx.getStorageSync('need_profile');
      } catch (e) {
        needProfile = false;
      }
      wx.reLaunch({
        url: needProfile ? '/pages/profile/profile' : '/pages/chat/chat',
      });
    }
  },

  onUsername(e) {
    this.setData({ username: e.detail.value });
  },

  onPassword(e) {
    this.setData({ password: e.detail.value });
  },

  toggleMode() {
    this.setData({ mode: this.data.mode === 'login' ? 'register' : 'login' });
  },

  onSetMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === 'login' || mode === 'register') this.setData({ mode });
  },

  // WeChat one-tap login (same identity as the mobile app via unionid, provided
  // both are bound to the same WeChat Open Platform account).
  onWechatLogin() {
    if (this.data.wechatLoading) return;
    this.setData({ wechatLoading: true });
    wx.login({
      success: async (res) => {
        if (!res.code) {
          this.setData({ wechatLoading: false });
          wx.showToast({ title: '获取微信授权失败', icon: 'none' });
          return;
        }
        try {
          const session = await api.wechatMiniLogin(res.code);
          app.setSession(session);
          // First-time users (no avatar yet) must finish the profile step; the
          // flag survives cold restarts so relaunching can't bypass it.
          const needProfile = !session.user_avatar_url;
          try {
            wx.setStorageSync('need_profile', needProfile);
          } catch (e) {
            // Storage failure just loses the re-entry guard, not the flow.
          }
          wx.reLaunch({
            url: needProfile ? '/pages/profile/profile' : '/pages/chat/chat',
          });
        } catch (err) {
          wx.showToast({ title: err.message || '微信登录失败', icon: 'none' });
        } finally {
          this.setData({ wechatLoading: false });
        }
      },
      fail: () => {
        this.setData({ wechatLoading: false });
        wx.showToast({ title: '获取微信授权失败', icon: 'none' });
      },
    });
  },

  async onSubmit() {
    if (this.data.loading) return;
    const username = (this.data.username || '').trim();
    const password = this.data.password || '';
    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const session =
        this.data.mode === 'login'
          ? await api.login(username, password)
          : await api.register(username, password);
      app.setSession(session);
      wx.reLaunch({ url: '/pages/chat/chat' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
