// Global backend configuration for the WeChat Mini Program.
//
// 只需改 ENV 一个字段即可在「本地联调」和「线上」之间切换，无需手改 URL。
//
//   ENV = 'local' → 连本地后端（开发/联调）
//   ENV = 'prod'  → 连线上后端（发布 / 体验版）
//
// 切到 'local' 时，请确保：
//   1. 微信开发者工具「详情 → 本地设置」勾选「不校验合法域名…」，否则 http/ws/IP 连不上。
//   2. 后端已在本地跑起来（server + Redis + Ollama）。
//   3. 模拟器可用 localhost；真机预览时手机访问不了电脑的 localhost，
//      需把 ENDPOINTS.local 改成电脑的局域网 IP（手机与电脑同一 WiFi），如
//      'http://192.168.1.10:8000'。
//
// 切到 'prod' 上架前：URL 必须是 https，且域名已 ICP 备案并在小程序后台
// 「开发管理 → 服务器域名」配置了 request 合法域名 / socket 合法域名。
const ENV = 'prod'; // 'local' | 'prod'  ← 本地联调改回 'local'

const ENDPOINTS = {
  local: 'http://localhost:8000',
  // 生产 nginx 把 /api/ 反代到后端并剥掉前缀 (与 Flutter/Web 生产一致):
  //   https://banshengcomp.com/api/auth/login → 后端 /auth/login
  //   wss://banshengcomp.com/api/ws/{id}      → 后端 /ws/{id}
  prod: 'https://banshengcomp.com/api',
};

// REST base（后端路由挂在根路径，无 /api 前缀）。
const BASE_URL = ENDPOINTS[ENV];

// WebSocket base 由 BASE_URL 推导（http→ws, https→wss）。
const WS_BASE_URL = BASE_URL.replace(/^http/, 'ws');

// Idle ping interval. 后端 90s 无消息断开，这里 < 90s 保活。
const PING_INTERVAL_MS = 25 * 1000;

module.exports = {
  ENV,
  BASE_URL,
  WS_BASE_URL,
  PING_INTERVAL_MS,
};
