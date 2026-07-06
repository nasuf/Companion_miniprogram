const api = require('../../utils/api.js');
const { BASE_URL } = require('../../config.js');
const { createChatSocket } = require('../../utils/socket.js');
const { EMOJIS } = require('../../utils/emoji.js');

const app = getApp();

// Extension -> mime for uploaded images.
function mimeFromPath(path) {
  const lower = (path || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function makeClientId() {
  return 'c_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

// Message timestamp with date awareness (WeChat convention, mirrors Flutter):
// today -> HH:MM; yesterday -> 昨天 HH:MM; within a week -> 周X HH:MM;
// same year -> M月D日 HH:MM; otherwise -> YYYY年M月D日 HH:MM.
function formatClock(ts) {
  const d = new Date(ts);
  const now = new Date();
  const clock =
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0');

  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000)
  );

  if (diffDays <= 0) return clock;
  if (diffDays === 1) return '昨天 ' + clock;
  if (diffDays <= 6) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[d.getDay()] + ' ' + clock;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + clock;
  }
  return (
    d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + clock
  );
}

function absoluteUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return BASE_URL + trimmed;
  return trimmed;
}

Page({
  data: {
    messages: [],
    inputValue: '',
    showEmoji: false,
    showPlus: false,
    aiTyping: false,
    emojis: EMOJIS,
    agentName: '伴生',
    aiInitial: '伴',
    aiAvatarUrl: '',
    userAvatarUrl: '',
    interactionDays: 0,
    scrollInto: '',
    noAgent: false,
    statusBarHeight: 44,
    navBarHeight: 44,
    // Composer bottom inset: keyboard height when shown, safe-area otherwise.
    composerBottom: 'env(safe-area-inset-bottom)',
  },

  session: null,
  conversationId: null,
  socket: null,

  onLoad() {
    const session = app.globalData.session;
    if (!session || !session.token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.session = session;
    this.setupNavMetrics();

    const agentName = session.agent_name || session.agentName || '伴生';
    this.setData({
      agentName,
      aiInitial: agentName.slice(0, 1),
      aiAvatarUrl: absoluteUrl(session.agent_avatar_url || session.agentAvatarUrl || ''),
    });

    // WeChat users get their real avatar in the message list (async, decorative).
    api
      .resolveUserAvatar(session.token, session.user_avatar_url || '')
      .then((path) => {
        if (path) this.setData({ userAvatarUrl: path });
      })
      .catch(() => {});

    this.bootstrap();
  },

  onUnload() {
    if (this.socket) this.socket.close();
  },

  // Custom navigation bar sizing: status bar height + capsule-aligned content row.
  setupNavMetrics() {
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const menu = wx.getMenuButtonBoundingClientRect();
      const statusBarHeight = win.statusBarHeight || 44;
      // Content row spans from status bar to just below the capsule button.
      const navBarHeight = menu && menu.height
        ? menu.height + (menu.top - statusBarHeight) * 2
        : 44;
      this.setData({ statusBarHeight, navBarHeight });
    } catch (e) {
      // Defaults already set; a wrong header height is cosmetic only.
    }
  },

  async bootstrap() {
    const s = this.session;
    const token = s.token;
    const userId = s.user_id || s.userId;
    const agentId = s.agent_id || s.agentId;
    const workspaceId = s.workspace_id || s.workspaceId;
    const hasAgent = s.has_agent != null ? s.has_agent : s.hasAgent;

    if (!hasAgent || !agentId) {
      this.setData({ noAgent: true });
      return;
    }

    wx.showLoading({ title: '加载中', mask: true });
    try {
      let conversationId = s.conversation_id || s.conversationId;
      if (!conversationId) {
        const list = await api.listConversations(token, userId, workspaceId);
        const matched = (list || []).find(
          (c) => (c.agent_id || c.agentId) === agentId
        );
        conversationId = matched
          ? matched.id
          : (await api.createConversation(token, userId, agentId, workspaceId)).id;
      }
      this.conversationId = conversationId;

      await this.loadHistory();
      this.connectSocket();
      // Header status is decorative; load in background, never block chat.
      this.loadHeaderMeta();
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // Header meta: interaction-days badge only (status pill removed by design).
  async loadHeaderMeta() {
    try {
      const conv = await api.getConversation(this.session.token, this.conversationId);
      this.setData({ interactionDays: conv.interaction_days || 0 });
    } catch (e) {
      // Badge is decorative; ignore failures.
    }
  },

  async loadHistory() {
    const rows = await api.loadMessages(this.session.token, this.conversationId, 50);
    const ordered = (rows || []).slice().reverse();
    const messages = [];
    ordered.forEach((m) => {
      if (m.role !== 'user' && m.role !== 'assistant') return;
      const image = this.extractImageUrl(m.metadata);
      const text = (m.content || '').trim();
      if (!text && !image) return;
      const ts = m.created_at ? Date.parse(m.created_at) || 0 : 0;
      messages.push({
        key: m.id,
        role: m.role,
        text,
        image,
        status: 'sent',
        ts,
        clock: ts ? formatClock(ts) : '',
      });
    });
    this.setData({ messages }, () => this.scrollToBottom());
  },

  extractImageUrl(metadata) {
    if (!metadata || typeof metadata !== 'object') return '';
    const attachments = metadata.attachments;
    if (!Array.isArray(attachments) || !attachments.length) return '';
    const first = attachments[0];
    const url = first && (first.url || '');
    if (!url) return '';
    return /^https?:\/\//.test(url) ? url : '';
  },

  connectSocket() {
    const self = this;
    let everConnected = false;
    this.socket = createChatSocket(this.conversationId, {
      onEvent(type, data) {
        self.handleEvent(type, data);
      },
      onState(state) {
        // Replies persisted while we were offline (e.g. server redeploy killed
        // the socket mid-reply) would otherwise never show and the typing
        // indicator would spin forever — reconcile by reloading history.
        if (state === 'open') {
          if (everConnected) {
            self.setData({ aiTyping: false });
            self.loadHistory().catch(() => {});
          }
          everConnected = true;
        }
      },
    });
    this.socket.connect();
  },

  handleEvent(type, data) {
    switch (type) {
      case 'ack':
        this.markSent(data.client_id);
        break;
      case 'pending':
      case 'delay':
        this.setData({ aiTyping: true }, () => this.scrollToBottom());
        break;
      case 'reply':
      case 'proactive':
        this.appendAssistant(data.text);
        break;
      case 'done':
        this.setData({ aiTyping: false });
        break;
      case 'error':
        this.setData({ aiTyping: false });
        wx.showToast({ title: data.message || '出错了', icon: 'none' });
        break;
      default:
        if (data && typeof data.text === 'string' && data.text.trim()) {
          this.appendAssistant(data.text);
        }
        break;
    }
  },

  markSent(clientId) {
    if (!clientId) return;
    const messages = this.data.messages.map((m) =>
      m.key === clientId ? Object.assign({}, m, { status: 'sent' }) : m
    );
    this.setData({ messages });
  },

  appendAssistant(text) {
    const clean = (text || '').trim();
    if (!clean) return;
    const now = Date.now();
    const messages = this.data.messages.concat([
      {
        key: 'a_' + now + '_' + Math.floor(Math.random() * 100000),
        role: 'assistant',
        text: clean,
        image: '',
        status: 'sent',
        ts: now,
        clock: formatClock(now),
      },
    ]);
    this.setData({ messages, aiTyping: false }, () => this.scrollToBottom());
  },

  // --- Input handlers ---------------------------------------------------

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // Manual keyboard handling (adjust-position=false): lift only the composer by
  // the keyboard height so the custom header stays visible.
  onKeyboardHeight(e) {
    const height = (e.detail && e.detail.height) || 0;
    this.setData({
      composerBottom: height > 0 ? height + 'px' : 'env(safe-area-inset-bottom)',
    });
    if (height > 0) {
      if (this.data.showEmoji || this.data.showPlus) {
        this.setData({ showEmoji: false, showPlus: false });
      }
      this.scrollToBottom();
    }
  },

  onInputBlur() {
    // Safety reset in case keyboardheightchange(0) is missed.
    this.setData({ composerBottom: 'env(safe-area-inset-bottom)' });
  },

  hideKeyboard() {
    if (wx.hideKeyboard) {
      wx.hideKeyboard({ fail() {} });
    }
  },

  onInputFocus() {
    if (this.data.showEmoji || this.data.showPlus) {
      this.setData({ showEmoji: false, showPlus: false });
    }
    this.scrollToBottom();
  },

  onListTap() {
    this.hideKeyboard();
    if (this.data.showEmoji || this.data.showPlus) {
      this.setData({ showEmoji: false, showPlus: false });
    }
  },

  toggleEmoji() {
    this.hideKeyboard();
    this.setData({ showEmoji: !this.data.showEmoji, showPlus: false }, () => {
      if (this.data.showEmoji) this.scrollToBottom();
    });
  },

  togglePlus() {
    this.hideKeyboard();
    this.setData({ showPlus: !this.data.showPlus, showEmoji: false }, () => {
      if (this.data.showPlus) this.scrollToBottom();
    });
  },

  onPickEmoji(e) {
    const emoji = e.currentTarget.dataset.emoji || '';
    this.setData({ inputValue: this.data.inputValue + emoji });
  },

  onSendText() {
    const text = (this.data.inputValue || '').trim();
    if (!text) return;
    if (!this.socket || !this.socket.isOpen()) {
      wx.showToast({ title: '连接中，请稍后重试', icon: 'none' });
      return;
    }

    const clientId = makeClientId();
    const now = Date.now();
    const messages = this.data.messages.concat([
      {
        key: clientId,
        role: 'user',
        text,
        image: '',
        status: 'sending',
        ts: now,
        clock: formatClock(now),
      },
    ]);
    this.setData(
      { messages, inputValue: '', showEmoji: false, showPlus: false },
      () => this.scrollToBottom()
    );
    this.socket.sendMessage(text, clientId);
  },

  // --- Image upload (plus panel: album / camera) ------------------------

  onPickAlbum() {
    this.chooseImage('album');
  },

  onTakePhoto() {
    this.chooseImage('camera');
  },

  chooseImage(source) {
    const self = this;
    this.setData({ showPlus: false });
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [source],
      sizeType: ['compressed'],
      success(res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (file) self.uploadAndSendImage(file);
      },
      fail() {},
    });
  },

  uploadAndSendImage(file) {
    const self = this;
    const filePath = file.tempFilePath;
    const mime = mimeFromPath(filePath);
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(readRes) {
        self.doUploadImage(filePath, mime, file, readRes.data);
      },
      fail() {
        wx.showToast({ title: '读取图片失败', icon: 'none' });
      },
    });
  },

  async doUploadImage(filePath, mime, file, base64) {
    if (!this.socket || !this.socket.isOpen()) {
      wx.showToast({ title: '连接中，请稍后重试', icon: 'none' });
      return;
    }

    const clientId = makeClientId();
    const now = Date.now();
    const messages = this.data.messages.concat([
      {
        key: clientId,
        role: 'user',
        text: '',
        image: filePath,
        status: 'sending',
        ts: now,
        clock: formatClock(now),
      },
    ]);
    this.setData({ messages }, () => this.scrollToBottom());

    try {
      const attachment = await api.uploadChatImage(this.session.token, {
        conversation_id: this.conversationId,
        name: file.tempFilePath.split('/').pop() || 'image.jpg',
        mime,
        size: file.size || 0,
        width: file.width || 0,
        height: file.height || 0,
        base64,
      });
      this.socket.sendMessage('', clientId, [{ id: attachment.id }]);
    } catch (err) {
      const failed = this.data.messages.map((m) =>
        m.key === clientId ? Object.assign({}, m, { status: 'sent' }) : m
      );
      this.setData({ messages: failed });
      wx.showToast({ title: err.message || '图片发送失败', icon: 'none' });
    }
  },

  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src;
    if (src) wx.previewImage({ urls: [src], current: src });
  },

  // Tap own avatar -> personal menu page (logout lives there).
  goMenu() {
    wx.navigateTo({ url: '/pages/menu/menu' });
  },

  onUserAvatarError() {
    // Broken avatar (expired CDN url etc.) -> fall back to the "我" placeholder.
    this.setData({ userAvatarUrl: '' });
  },

  // --- Misc -------------------------------------------------------------

  scrollToBottom() {
    this.setData({ scrollInto: '' }, () => {
      setTimeout(() => {
        this.setData({ scrollInto: 'anchor-bottom' });
      }, 30);
    });
  },

  onLogout() {
    app.clearSession();
    if (this.socket) this.socket.close();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
