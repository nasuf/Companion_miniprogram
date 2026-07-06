const api = require('../../utils/api.js');

const app = getApp();

Page({
  data: {
    displayName: '我',
    username: '',
    avatarUrl: '',
  },

  onLoad() {
    const session = app.globalData.session;
    if (!session || !session.token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const username = session.username || '';
    this.setData({
      displayName: session.user_display_name || username || '我',
      username,
    });
    api
      .resolveUserAvatar(session.token, session.user_avatar_url || '')
      .then((path) => {
        if (path) this.setData({ avatarUrl: path });
      })
      .catch(() => {});
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#e8553d',
      success: (res) => {
        if (!res.confirm) return;
        app.clearSession();
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },
});
