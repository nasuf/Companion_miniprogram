// Thin REST client for the Companion backend. Mirrors the endpoints used by the
// Flutter client (companion_api.dart): auth, conversations, messages, media.
const { BASE_URL } = require('../config.js');

function request(method, path, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    const header = { 'content-type': 'application/json' };
    if (opts.token) {
      header.Authorization = 'Bearer ' + opts.token;
    }
    wx.request({
      url: BASE_URL + path,
      method,
      data: opts.data,
      header,
      timeout: 15000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const detail =
            res.data && (res.data.detail || res.data.message)
              ? res.data.detail || res.data.message
              : '请求失败 (' + res.statusCode + ')';
          reject(new Error(detail));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络连接失败'));
      },
    });
  });
}

// --- Auth ---------------------------------------------------------------

function login(username, password) {
  return request('POST', '/auth/login', { data: { username, password } });
}

function register(username, password) {
  return request('POST', '/auth/register', { data: { username, password } });
}

function getMe(token) {
  return request('GET', '/auth/me', { token });
}

// WeChat Mini Program login: exchange the wx.login() code for a session.
// Backend calls jscode2session and upserts the same users/auth_identities rows
// as the mobile app (keyed on unionid when bound to the same Open Platform).
function wechatMiniLogin(code) {
  return request('POST', '/auth/wechat/miniprogram', { data: { code } });
}

// Persist the 头像昵称填写能力 result. avatarBase64/avatarMime optional.
function updateWechatProfile(token, { nickname, avatarBase64, avatarMime }) {
  return request('POST', '/auth/wechat/profile', {
    token,
    data: {
      nickname: nickname || null,
      avatar_base64: avatarBase64 || null,
      avatar_mime: avatarMime || null,
    },
  });
}

// --- Conversations ------------------------------------------------------

function listConversations(token, userId, workspaceId) {
  let path = '/conversations?user_id=' + encodeURIComponent(userId);
  if (workspaceId) {
    path += '&workspace_id=' + encodeURIComponent(workspaceId);
  }
  return request('GET', path, { token });
}

function createConversation(token, userId, agentId, workspaceId) {
  return request('POST', '/conversations', {
    token,
    data: { user_id: userId, agent_id: agentId, workspace_id: workspaceId },
  });
}

// Conversation detail: includes ai_status_label / ai_activity / interaction_days
// used by the chat header (Flutter-style status pill).
function getConversation(token, conversationId) {
  return request('GET', '/conversations/' + conversationId, { token });
}

// Returns messages ordered newest-first (server default). Caller reverses.
function loadMessages(token, conversationId, limit) {
  const path =
    '/conversations/' +
    conversationId +
    '/messages?limit=' +
    (limit || 50) +
    '&offset=0&include_metadata=true';
  return request('GET', path, { token });
}

// --- Media --------------------------------------------------------------

// Upload a base64-encoded image. Returns ChatAttachmentResponse { id, url, ... }.
function uploadChatImage(token, payload) {
  return request('POST', '/chat/media', { token, data: payload });
}

module.exports = {
  request,
  login,
  register,
  getMe,
  wechatMiniLogin,
  updateWechatProfile,
  listConversations,
  createConversation,
  getConversation,
  loadMessages,
  uploadChatImage,
};
