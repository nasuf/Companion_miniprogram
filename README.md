# 伴生 Companion 微信小程序（聊天）

一个最小可用的微信小程序，接入 `Companion_server` 后端，只做**聊天窗口**：
文字聊天、表情面板、拍照/相册图片上传，界面参考微信。功能逻辑对齐 Flutter 端
(`Companion_flutter/lib/chat_socket.dart` + `companion_api.dart`)。

## 目录结构

```
Companion_miniprogram/
├── app.js / app.json / app.wxss     # 全局入口、页面注册、全局样式
├── config.js                        # 后端地址配置（改这里）
├── project.config.json              # 开发者工具项目配置（AppID 在这里）
├── sitemap.json
├── utils/
│   ├── api.js                       # REST 封装（登录/会话/历史/图片上传）
│   ├── socket.js                    # WebSocket 封装（连接/保活/重连/事件）
│   └── emoji.js                     # 表情列表
└── pages/
    ├── login/                       # 登录 / 注册
    └── chat/                        # 聊天主界面
```

## 后端协议（已对接）

- 微信一键登录：`POST /auth/wechat/miniprogram`（`wx.login()` 的 code → 后端 jscode2session）
- 登录/注册（备用）：`POST /auth/login`、`POST /auth/register`（用户名+密码）
- 会话：`GET /conversations`、`POST /conversations`
- 历史：`GET /conversations/{id}/messages`
- 图片：`POST /chat/media`（base64 上传，≤ 2MB）
- 实时：`wss://<host>/ws/{conversationId}`
  - 发送：`{type:'ping'}` / `{type:'message', data:{message, client_id, attachments:[{id}]}}`
  - 接收：`ack` / `reply` / `proactive` / `pending` / `delay` / `done` / `error` / `pong`
  - 每 25s 发送 `ping` 保活（后端 90s 空闲断开）

## 运行步骤（开发/体验版，无需备案）

1. 用**微信开发者工具**打开本目录 `Companion_miniprogram/`。
2. 打开 `config.js`，把 `BASE_URL` 改成你的后端地址：
   - 本地联调：`http://<你电脑局域网IP>:8000`（真机需和手机同一网络）
   - 或已部署的地址：`https://banshengcomp.com`
3. 开发者工具右上角「详情 → 本地设置」勾选：
   **不校验合法域名、web-view、TLS 版本以及 HTTPS 证书**（这样 http/ws 或 IP 才能连）。
4. 在小程序里**注册/登录**一个后端已存在的账号。
   > ⚠️ 该账号需要**已经有一个 AI 伙伴（agent）**。本小程序只做聊天，不含建人设流程；
   > 若账号还没有 agent，会显示提示。请先在 App/Web 端创建 agent 再来聊天。

## 你需要提供 / 配置的东西（Keys & Config）

| 项 | 位置 | 说明 |
|---|---|---|
| **后端地址 BASE_URL** | `config.js` | 必填。指向 `Companion_server` 根地址（无 `/api` 前缀）。 |
| **小程序 AppID** | `project.config.json` 的 `appid` | 目前是 `touristappid`（仅工具内测试）。微信一键登录/真机预览/体验版必须替换为真实 AppID。 |
| **微信登录开关 + 小程序密钥** | 后端 `Companion_server/.env` | 微信一键登录需要：`WECHAT_LOGIN_ENABLED=true`、`WECHAT_MINI_APP_ID=<小程序AppID>`、`WECHAT_MINI_APP_SECRET=<小程序AppSecret>`。AppSecret 只放后端，绝不进小程序代码。 |
| **合法域名（生产）** | 微信公众平台后台 | 上架前：在「开发管理 → 服务器域名」配置 `request 合法域名` 和 `socket 合法域名` 为你的 ICP 备案域名（HTTPS/WSS）。 |

### ⭐ 跨端账号 & 对话数据延续（重点）

要让「小程序用户」和「以后的 App 用户」是**同一个账号、共享同一份对话数据**：

1. 在**微信开放平台**（open.weixin.qq.com）创建/使用一个开放平台账号，
   在「管理中心」里**同时绑定**：本小程序 + 未来的移动应用（App）。
2. 绑定后，同一个微信用户在小程序（`jscode2session`）和 App（OAuth）拿到的
   **UnionID 相同**。
3. 后端以 `unionid` 作为身份主键（`auth_identities.provider='wechat'`），
   小程序登录复用与 App 完全相同的 `find_or_create_wechat_user` 逻辑，
   写入**同一套 `users` / `auth_identities` 表** → 同一个 `User` → 对话
   （`conversations` / `messages`）自动延续。

> ⚠️ 若**不绑定开放平台**：小程序与 App 只有各自的 openid、拿不到统一 unionid，
> 会被后端当成**两个不同用户**，对话数据无法互通。这是跨端延续的硬前提。

### 小程序端**不需要**任何 LLM / 第三方 API Key

聊天所需的所有模型密钥（通义千问 / bge-m3 / Redis / 数据库等）都在
**后端 `Companion_server/.env`** 里，小程序只连后端，不直接接触任何模型 key。

## 登录方式说明

小程序提供两种登录，写入的都是**同一套后端表**：

1. **微信一键登录（推荐，跨端延续靠它）**：`wx.login()` → code → 后端
   `/auth/wechat/miniprogram` → `jscode2session` → 用 unionid/openid
   自动建号或复用已有账号。**需要真实 AppID + 后端配置小程序密钥**（见上表）。
   - 昵称/头像：微信已收紧，不能静默获取。如需展示可后续加「头像昵称填写能力」
     （`<button open-type="chooseAvatar">` + 昵称 input），由用户手动授权。
2. **用户名+密码（备用/开发用）**：`/auth/login`、`/auth/register`，方便在
   工具里用 `touristappid` 直接联调，不依赖微信配置。

> 与 Flutter 端的关系：Flutter 走 `/auth/wechat/mobile`（开放平台移动应用
> OAuth），小程序走 `/auth/wechat/miniprogram`（jscode2session）——两条链路
> **共用同一段 `find_or_create_wechat_user`**、同一张身份表、以 unionid 归一，
> 因此同一微信用户在两端是同一账号。

## 已知限制（MVP）

- 只做聊天：不含建 agent、记忆管理、音乐、送礼等页面。
- 历史图片：`/chat/media` 需鉴权，`<image>` 无法带 token，历史里的图片可能不显示；
  新发出的图片用本地临时路径预览正常。
- WebSocket 通过 `?token={jwt}` 查询参数鉴权（后端校验 JWT 属主，与 Flutter/Web 一致）。

## 上架前合规提醒

AI 聊天属于「深度合成-AI问答」，上架需：企业主体认证 + 小程序 ICP 备案 +
【深度合成-AI问答】类目（用通义千问「在用证明」最快）+ 代码审核；陪伴/拟人化
产品还需对齐《人工智能拟人化互动服务管理暂行办法》。开发/体验版阶段无需上述备案。
