// WebSocket wrapper around wx.connectSocket / SocketTask.
//
// Protocol (see Companion_server/app/api/realtime/ws.py):
//   - URL: wss://host/ws/{conversationId}?token={jwt}
//     conversation_id is NOT a capability token; the backend requires a valid
//     JWT owner. The token rides as a query param (WS handshakes can't carry
//     custom headers uniformly across clients).
//   - Send:   { type: 'ping' }
//             { type: 'message', data: { message, client_id, attachments } }
//   - Receive envelopes { type, data }:
//       ack      -> { message_id, client_id, received_at }
//       reply    -> { text, index, assistant_message_id? }
//       pending  -> { status: 'aggregating' | 'queued', delay }
//       delay    -> { duration }
//       done     -> { message_id }
//       error    -> { message }
//       pong     -> {}
const { WS_BASE_URL, PING_INTERVAL_MS } = require('../config.js');

function createChatSocket(conversationId, handlers, token) {
  const cb = handlers || {};
  let task = null;
  let pingTimer = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let disposed = false;
  let opened = false;

  function emitState(state) {
    if (cb.onState) cb.onState(state);
  }

  function startKeepalive() {
    stopKeepalive();
    pingTimer = setInterval(() => {
      send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  function stopKeepalive() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function scheduleReconnect() {
    if (disposed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delay = Math.min(8000, Math.round(1500 * Math.pow(1.5, reconnectAttempt)));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  function handleEnvelope(raw) {
    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return; // Protocol is always JSON envelopes; ignore malformed frames.
    }
    if (!json || typeof json !== 'object') return;
    if (json.type === 'pong') return;
    if (cb.onEvent) cb.onEvent(json.type || '', json.data || {});
  }

  function connect() {
    if (disposed) return;
    if (opened) return;
    emitState('connecting');
    let url = WS_BASE_URL + '/ws/' + conversationId;
    if (token) {
      url += '?token=' + encodeURIComponent(token);
    }
    task = wx.connectSocket({
      url,
      fail() {
        emitState('error');
        scheduleReconnect();
      },
    });

    task.onOpen(() => {
      if (disposed) {
        try { task.close({}); } catch (e) {}
        return;
      }
      opened = true;
      reconnectAttempt = 0;
      emitState('open');
      startKeepalive();
    });

    task.onMessage((res) => {
      handleEnvelope(res.data);
    });

    task.onClose(() => {
      opened = false;
      stopKeepalive();
      emitState('closed');
      if (!disposed) scheduleReconnect();
    });

    task.onError(() => {
      opened = false;
      stopKeepalive();
      emitState('error');
      if (!disposed) scheduleReconnect();
    });
  }

  function send(payload) {
    if (!task || !opened) return false;
    task.send({ data: JSON.stringify(payload) });
    return true;
  }

  function sendMessage(text, clientId, attachments) {
    const data = { message: text, client_id: clientId };
    if (attachments && attachments.length) {
      data.attachments = attachments;
    }
    return send({ type: 'message', data });
  }

  function close() {
    disposed = true;
    stopKeepalive();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (task) {
      try { task.close({}); } catch (e) {}
    }
    task = null;
    opened = false;
  }

  return {
    connect,
    send,
    sendMessage,
    close,
    isOpen() { return opened; },
  };
}

module.exports = { createChatSocket };
