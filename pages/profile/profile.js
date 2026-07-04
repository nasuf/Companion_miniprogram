const api = require('../../utils/api.js');

const app = getApp();

function mimeFromPath(path) {
  const lower = (path || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

Page({
  data: {
    avatarPath: '', // local temp path from chooseAvatar
    nickname: '',
    saving: false,
  },

  onLoad() {
    const session = app.globalData.session;
    if (!session || !session.token) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  // WeChat chooseAvatar gives a local temp file path in e.detail.avatarUrl.
  onChooseAvatar(e) {
    const path = e.detail && e.detail.avatarUrl;
    if (path) this.setData({ avatarPath: path });
  },

  onNickname(e) {
    this.setData({ nickname: e.detail.value || '' });
  },

  goChat() {
    wx.reLaunch({ url: '/pages/chat/chat' });
  },

  // Completion is mandatory (no skip): both avatar and nickname are required.
  async onSave() {
    if (this.data.saving) return;
    const nickname = (this.data.nickname || '').trim();
    const avatarPath = this.data.avatarPath;
    if (!avatarPath) {
      wx.showToast({ title: '请选择头像', icon: 'none' });
      return;
    }
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    try {
      const base64 = await this.readBase64(avatarPath);
      const session = await api.updateWechatProfile(app.globalData.session.token, {
        nickname,
        avatarBase64: base64,
        avatarMime: mimeFromPath(avatarPath),
      });
      app.setSession(session);
      try {
        wx.removeStorageSync('need_profile');
      } catch (e) {
        // Non-fatal: the flag is re-derived on next WeChat login anyway.
      }
      this.goChat();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // Back to login: drops the pending session (profile stays mandatory for the
  // next WeChat login), so the login page won't auto-forward back here.
  onBackToLogin() {
    app.clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },

  readBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (res) => resolve(res.data),
        fail: () => reject(new Error('读取头像失败')),
      });
    });
  },
});
