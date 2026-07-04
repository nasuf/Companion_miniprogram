const { BASE_URL } = require('../../config.js');

const app = getApp();

function absoluteUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return BASE_URL + trimmed;
  return trimmed;
}

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
      avatarUrl: absoluteUrl(session.user_avatar_url || ''),
    });
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
