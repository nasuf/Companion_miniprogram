// Global app entry. Holds the auth session in globalData and mirrors it to
// local storage so a returning user is auto-authenticated.
App({
  globalData: {
    // AuthResponse shape returned by POST /auth/login (see companion server).
    session: null,
  },

  onLaunch() {
    try {
      const cached = wx.getStorageSync('session');
      if (cached && cached.token) {
        this.globalData.session = cached;
      }
    } catch (e) {
      // Ignore storage read errors; user will just log in again.
    }
  },

  setSession(session) {
    this.globalData.session = session;
    try {
      wx.setStorageSync('session', session);
    } catch (e) {
      // Non-fatal: session still lives in memory for this run.
    }
  },

  clearSession() {
    this.globalData.session = null;
    try {
      wx.removeStorageSync('session');
      wx.removeStorageSync('need_profile');
    } catch (e) {
      // Non-fatal.
    }
  },
});
