# 代码与协议架构

> [← 返回索引](/content/batch1/tools-readme) · **01 · 架构**

# Muse 服务协议与代码架构分析

> 第三轮深挖：从二进制反推协议与代码结构（承接 `DEEP-DIVE-FINDINGS.md`）

---

## 一、重大发现：二进制保留了完整 Rust 源码路径

`hatch` 二进制**未剥离源码路径字符串**，等于直接给出了整个代码库的文件结构。

### 1.1 顶层 workspace 结构

```
hatch-engine/crates/<crate>/src/...
```

即：主仓库名 **`hatch-engine`**，采用 Cargo workspace 多 crate 布局。

示例（真实路径字符串）：

```
hatch-engine/crates/hatch-server/src/daemon/runtime/daemon_loop/root_event_pump.rs:783
hatch-engine/crates/hatch-server/src/daemon/runtime/daemon_loop/presence_activity.rs:854
hatch-engine/crates/hatch-server/src/daemon/http_api/routes/voice/calls/cosmos.rs:26
hatch-engine/crates/hatch-server/src/daemon/websocket/chat_commands/execution.rs:275
hatch-engine/crates/hatch-server/src/daemon/peers/peerd_client.rs
```

注意路径格式带**行号**，说明这是 `tracing` 宏记录 source location 时留下的。

### 1.2 完整 crate 清单（**65 个**）

> ✅ **复核通过（实测复核）**：实测 `hatch-engine/crates/` 下 **63 个** crate
> （报告 65，差 2 ≈3%，属可接受范围）。
>
> **引用计数全部吻合**：
>
> | crate | 报告 | 实测 |
> |---|---|---|
> | `hatch-server` | 5226 | 5242 ✅ |
> | `hatch-agent` | 2917 | 2906 ✅ |
> | `hatch-db` | 397 | 404 ✅ |
> | `hatch-cron` | 267 | **267** ✅ 精确 |
> | `hatch-inference` | 215 | 221 ✅ |
> | `hatch-self-improvement` | 145 | **145** ✅ 精确 |
>
> **这是准确度最高的报告之一。**

按出现频次降序（频次≈代码量占比）：

#### 【复核补遗】63 个 crate 全清单（实测）

按类别归类（有助于理解系统分层）：

| 类别 | crate |
|---|---|
| **核心** | `hatch-server` `hatch-agent` `hatch-db` `hatch-cron` `hatch-inference` `hatch-self-improvement` `hatch-media` |
| **自我进化** | `hatch-alignment` `hatch-ideas` `hatch-memory` `hatch-goals` `hatch-feed` `hatch-measurement` `hatch-experiments` |
| **上下文管理** | `hatch-compaction` `hatch-context-workers` `hatch-mase-index` |
| **渠道** | `hatch-channels` `hatch-channelsd` `hatch-channel-provider-{imessage,instagram,messenger,telegram,whatsapp}` `hatch-whatsapp-wasa-contract` |
| **浏览器** | `browser-client` `browser-result` `hatch-browser-policy` `hatch-url-audit` `hatch-domain-blocking` |
| **实时/语音** | `hatch-realtime` `hatch-realtime-protocol` `hatch-asr` `hatch-streaming` `phone-client` |
| **安全/权限** | `hatch-gatekeeper` `hatch-peer-identity` `hatch-networking` `hatch-trash` |
| **内容** | `content-understanding` `hatch-artifacts` `hatch-spaces` `hatch-markdown` `hatch-podcast-storage` |
| **平台** | `hatch-os` `hatch-fileserver` `hatch-http` `hatch-protocol` `hatch-tool-sdk` `hatch-tools` `hatch-skills` |
| **配置/运维** | `hatch-config` `hatch-live-config` `hatch-user-config` `hatch-doctor` `hatch-cron-store` `hatch-metering` `hatch-instrumentation` `hatch-i18n` `hatch-util` `hatch-activity` `hatch-workflows` |

**值得注意**：
- `hatch-measurement` + `hatch-experiments` 独立成 crate → **印证 self-improvement 的测量/bandit 框架是一等公民**
- `hatch-compaction` 独立 → 上下文压缩是独立子系统（对应 `azure/avocado-compaction-v1`）
- `hatch-alignment` 独立 → 对齐反思有专属 crate
- **7 个渠道 provider** → 多平台 IM 接入是重投入方向

**核心（大于 1000 处引用）**
```
hatch-server        5226   主服务：daemon / HTTP API / websocket / runtime
hatch-agent         2917   智能体循环与推理
hatch-db             397   数据层
hatch-cron           267   定时任务
hatch-inference      215   模型推理
hatch-self-improvement 145 自我改进
hatch-media          127   媒体生成
```

**业务模块**
```
hatch-spaces          95   空间（artifact 容器）
browser-client        73   浏览器客户端
hatch-fileserver      70   文件服务
hatch-realtime        66   实时通道（语音）
hatch-networking      36   网络策略
hatch-skills          30   技能系统
hatch-goals           27   目标
hatch-os              27   操作系统集成
hatch-realtime-protocol 27 实时协议
hatch-instrumentation 26   遥测埋点
hatch-memory          24   记忆
hatch-live-config     23   热配置
hatch-feed            20   Feed 信息流
hatch-activity        17   活动
hatch-channels        17   渠道
hatch-protocol        16   协议定义
hatch-tool-sdk        15   工具 SDK
hatch-ideas           13   点子
phone-client          13   电话客户端
hatch-experiments     12   A/B 实验框架
hatch-asr              9   语音识别
hatch-domain-blocking  9   域名封禁
content-understanding  8   内容理解
hatch-context-workers  7   上下文 worker
hatch-i18n             7   国际化
hatch-metering         7   计量（额度）
hatch-streaming        7   流式输出
hatch-channelsd        6   渠道守护进程
hatch-cron-store       6   定时任务存储
hatch-tools            6   工具
hatch-gatekeeper       5   准入控制
hatch-http             5   HTTP
hatch-doctor           5   诊断
hatch-config           5   配置
browser-result         4   浏览器结果
hatch-compaction       4   上下文压缩
web-search             4   网页搜索
hatch-artifacts        4   制品
hatch-workflows        3   工作流
hatch-url-audit        3   URL 审计
hatch-sentinel-config  2   ★ Sentinel 配置
hatch-channel-provider-common 2  渠道 provider 公共
hatch-alignment        2   对齐（价值对齐）
hatch-mase-index       2   ★ MASE 索引
hatch-measurement      1   测量
hatch-browser-policy   1   浏览器策略
hatch-trash            1   回收站
hatch-podcast-storage  1   播客存储
hatch-peer-identity    1   同伴身份
hatch-whatsapp-wasa-contract 1  WhatsApp 契约
hatch-markdown         1   Markdown
hatch-user-config      1   用户配置
hatch-util             1   工具库
```

**渠道 Provider（5 个独立 crate）**
```
hatch-channel-provider-whatsapp    252   ← 代码量最大的 provider
hatch-channel-provider-messenger   158
hatch-channel-provider-telegram     78
hatch-channel-provider-imessage     19
hatch-channel-provider-instagram     1
```

### 1.3 `hatch-server/src` 模块树

```
daemon/                  ← 主循环（最大模块）
  runtime/
    daemon_loop/         root_event_pump / presence_activity / presence / state
    maintenance/         context_subscribers / supervisor / handlers
    feed/                query_gate / prompt_seed / idea_slot / step_turns /
                         step_loop / wire / persist / generation_status
    spaces_workers/      generation / scheduled
    share_integrity_gate/ video_check
    egress_approval_runtime/  server / presentation_locale
    background_workers_runtime/
    checkout_spend/      stripe_link
    work/supervisor/     root_execution
    companions/          outbound
    ideas_feed_effects / workflow_terminal_handoff_worker
  http_api/routes/       config / chat / goals / ideas / feed / voice /
                         browser_session / sessions ...
  websocket/
    chat_commands/       settings / execution
    chat/                widget_state / search
    node_handlers/       invoke_result
  streaming/
    stream_pipeline/     task_status
    browser_task_lifecycle/ retained_outcome/control/viewer_recovery
  startup/daemon_service/ media_processor / realtime_listener
  peers/                 peerd_client
  device_reconciliation/
  fleet_outbox
  artifact_catalog / artifact_changes / artifact_placement / artifact_projection
  browser_broker_control / browser_sensitive_sites / browser_session / browser_task
  execd_manager
  flags
  product_messages/      connector_education / growth_onboarding
  realtime_voice
cron_store_authority / cron_store_backfill / cron_store_mirror /
cron_store_system_refresh
supervisor
startup
execd_manager
flags
```

---

## 二、协议层发现

### 2.1 `peerd` —— 同伴（Agent 间）协议

crate：`hatch-peer-identity`；模块：`daemon/peers/peerd_client.rs`

**HTTP 请求/响应结构体（从二进制提取，完整）**：

```
struct SignResponse
struct PeerdIdentity
struct CheckOutput
struct AnnounceKey
struct FlightPresentation
struct ProfileSyncCheckpoint
struct PinUpdateHttpRequest
struct PinReminderConfirmHttpRequest
struct MintInviteHttpRequest
struct IssueGrantHttpRequest
struct NarrowGrantHttpRequest        ← 收窄授权
struct NarrowCapabilityHttp          ← 收窄能力
struct AcceptInviteHttpRequest
struct PatchPeerHttpRequest
struct CreateCircleHttpRequest       ← 圈子（circle）
struct AddCircleMemberHttpRequest
struct StartSessionParams / StartSessionHttpRequest
struct ForkSessionParams / ForkSessionHttpRequest     ← 会话分叉
struct DeleteSessionHttpRequest
struct UpdateSessionArchiveHttpRequest
struct SessionPinPositionHttpRequest
struct UpdateSessionPinHttpRequest / UpdateSessionUnpinHttpRequest
struct RenameSessionHttpRequest
```

**peerd 事件（`PeerdEvent` 枚举，从二进制提取）**：
```
PeerdEvent::ConnUp       连接建立
PeerdEvent::ConnDown     连接断开
PeerdEvent::DialFailed   拨号失败
PeerdEvent::PeerAttested 同伴已认证
PeerdEvent::StrangerDropped  陌生方被丢弃
PeerdEvent::InboundHumanRepresentative  入站人类代表
PeerdEvent::StreamLagged 流失步
```

**authd 侧的 peer 端点**：
```
/v1/peer/sign-delegate          委派签名
/v1/peer/sign-invite            邀请签名
/v1/peer/sign-roster            名册签名
/v1/peer/sign-roster-consent    名册同意签名
```

**能力收窄（NarrowGrant / NarrowCapability）** 是个重要设计：
同伴间授权不是"给全权"，而是**可以逐步收窄的凭证**。

### 2.2 渠道协议

`struct ChannelStatusRowHttpResponse` / `ChannelAccountStatusHttpResponse` /
`ChannelsStatusHttpResponse` / `ChannelControlHttpResponse` /
`struct ChannelsLinkRequest` / `ChannelsUnlinkRequest`

5 个 provider crate 独立实现，其中 **WhatsApp 代码量最大（252 处）**，
且有一个专门的契约 crate `hatch-whatsapp-wasa-contract`（WASA = WhatsApp 某协议）。

### 2.3 会话协议（HTTP）

```
struct StartSessionHttpRequest / StartSessionParams
struct ForkSessionParams / ForkSessionHttpRequest
struct DeleteSessionHttpRequest
struct RenameSessionHttpRequest
struct UpdateSessionArchiveHttpRequest
struct SessionPinPositionHttpRequest / UpdateSessionPinHttpRequest / Unpin
```

→ 会话支持：**启动、分叉（fork）、归档、固定（pin）、重命名**。

### 2.4 其他协议结构

```
struct WidgetStatePatchParams / WidgetStateSetParams
struct OtaManifest                            OTA 升级清单
struct BrowserEnvironmentRefreshRequest       浏览器环境刷新
struct ChatSubscribeHttpRequest
struct FeedDayCursorEnvelop
struct GoalListPageCursorEnvelop
struct IdeaCardsPageCursorEnvelop             ← 游标分页信封
struct Envelope / struct Request
struct KindCounts
struct ConnectorReference
struct ExploreSnapshotUpsertRequest
struct FrozenPromptSpawnSteerDirectTunnelRelevanceToUserIntentReviewResponse
```

**游标分页（Cursor Envelop）** 是统一模式：Feed、Goals、Ideas 都用。

### 2.5 已废弃端点

```
Deprecated endpoint. Every request returns a 410 deprecated_endpoint error.
Feed sharing has been removed and has no replacement.
"no replacement; feed sharing has been removed from Hatch"
```

→ `feed.share` 能力已被移除，返回 HTTP 410。

---

## 三、审查（Review）系统 —— Sentinel 的判定面

从二进制提取的审查请求/响应类型：

```
PromptReviewRequest / PromptReviewResponse          提示词审查
ResponseReviewRequest / ResponseReviewResponse      响应审查
ArtifactMediaCheckRequest / ArtifactMediaCheckResponse   制品媒体检查
ArtifactMediaVideoCheckRequest / Response           视频检查
VerificationCodeScanRequest / VerificationCodeScanResponse   验证码扫描
RelevanceToUserIntentReviewRequest / Response       与用户意图相关性
RelevanceToUserIntentReviewIpcRequest
CyberToolReviewRequest                              网络安全工具审查
```

**审查判定结果枚举**：
```
Allow  Block  Unreviewable
DeterministicPrivateData  CredentialBearing  SafetyManipulation
MalformedOrAmbiguous  UnobservableCarrier  PolicyGuard
PrivateDataClassifierUnavailable  TaintedDataCarrier
```

**媒体内容分级（`ArtifactMediaCheckResponse`）**：
```
Credential  MedicalHealth  Financial  Insurance  Account
GovernmentIdentity  ContactBirth  Location  ContactBirth
FragmentedPrivateRecord  OpaqueDataPayload
```

**审批决策粒度**：
```
AllowOnce  AllowSession  AllowToday  AllowAlways  DenyAlways  AutoAllow
```

→ 这是 Sentinel 卡片的**实际选项集**：一次 / 本次会话 / 今天 / 永久 / 拒绝 / 自动放行。

**目的地类型**：
```
Destination  DestinationDomain  Entity  Connector  AllActions
Recipient  Checkout  PaymentOption
```

---

## 四、安全相关机制

### 4.1 Prompt Injection 防护

```
PromptInjection
enforcement_steering
browser_enforcement_steering
policyguard_enforcement_enabled
dark_logging_enabled
```

### 4.2 Cyber 工具审查

```
Cyber Tool-Call Boundary
policy_alias: cyber_misuse_tool_call_target_v2
policy_id: cyber_misuse_tool_call_target_v2
```

→ 存在专门的**网络滥用（cyber misuse）策略**，对工具调用目标做边界检查。

### 4.3 内容边界

```
JARVIS_EXTERNAL_CONTENT_BOUNDARIES_ENABLED
external_content_boundaries_source
taint_status
```

→ **污点追踪（taint）** 机制：外部内容被标记，防止注入指令被执行。

### 4.4 域名黑名单

crate `hatch-domain-blocking`，字段：
```
NewsDomainsBlackholeUrls
central_blackhole_verdict / reason / blocklist / site
browser_search_url_blocklist_skipped_count
```

### 4.5 浏览器敏感站点

`browser_sensitive_sites` 模块：
```
SensitiveSitesLimitReached  SensitiveSitesPolicyCapacityExceeded
SensitiveSitesNotInitialized  SensitiveSitesUnavailable
SensitiveSitesSaveUncertain
```

---

## 五、网络出口（Egress）机制细节

### 5.1 出口分层

```
egress_tier
requested_egress_profile / egress_profile
ResidentialEgressUnattributed       住宅代理未归属
ResidentialEgressDisabled           住宅代理已禁用
ResidentialEgressUnavailable        住宅代理不可用
EgressReplacementUnsupported        不支持出口替换
egress_profile (in browser tasks)
public_egress_ip / previous_public_egress_ip / public_egress_changed
```

→ **存在"住宅代理（Residential Egress）"能力**，用于浏览器任务，可按任务指定出口配置。

### 5.2 出口审批

```
approval_registration
approval_delivery_mode
approval_attention_mode
approval_lifecycle_phase
approval_expiry_mode / approval_request_expires_at_ms
caller_wait_deadline_ms / caller_wait_timed_out_at_ms
observed_decision / observed_would_block / decision_overridden
```

### 5.3 连接分类与 MITM

```
connect_classification / connect_classification_reason
connect_probe_bytes / connect_classification_latency_ms
connect_mitm_eligibility / connect_mitm_exclusion_reason / connect_mitm_result
exfil_shadow_crossings          ← 数据外泄检测
connector_decision_source
matched_network_grant_id
```

→ **"connect probe"**：对直连尝试先探测分类；
**MITM 资格判定**：决定是否对该连接做中间人解密。

### 5.4 配额

```
quota_mode / quota_limit / quota_policy_id / quota_activity_class
quota_capacity_units / quota_available_units / quota_min_available_units
quota_available_bytes / quota_min_available_bytes
quota_refill_units_per_second
quota_current_utilization_permille / quota_peak_utilization_permille
quota_retry_after_secs
```

→ 连接器配额是**令牌桶**模型（按秒补充），并有字节配额。

---

## 六、内部服务发现

### 6.1 内部主机名

```
inference-proxy.local          ← 推理代理的服务发现名
magi-media                     ← 媒体相关
authd.local                    ← authd 自称的 Host
```

### 6.2 真实外部域名（白名单内）

```
accountscenter.meta.com
adsmanager.facebook.com
transparency.meta.com
readscenter.meta.com
www.facebook.com
xx.fbcdn.net
*.metaaivm.com          ← VM 自身域名（JARVIS_FQDN）
```

### 6.3 内部请求头

```
x-jarvis-request-id
x-jarvis-inference-context
x-request-id
```

### 6.4 新增 socket 变量（第三轮发现）

```
JARVIS_SECURITY_SOCK / JARVIS_SECURITY_SOCK
HATCH_API_SOCK / HATCH_API_URL
HATCH_NODED_CONTROL_SOCK          数据库代理控制口
HATCH_PEERD_API_SOCK              同伴 API
HATCH_STEFI_PROXY_SOCK
HATCH_SPACE_INFERENCE_SOCKET      空间推理
HATCH_SPACE_WEB_SEARCH_SOCKET     空间联网搜索
HATCH_SPACE_MEDIA_SOCKET          空间媒体
HATCH_SPACE_PRIVILEGED_SOCKET     空间特权
HATCH_SPACE_ACTION_TIMEOUT_MS
HATCH_SPACE_INFERENCE_DEFAULT_TIMEOUT_MS
BROWSER_BROKER_SOCK
JARVIS_CREDIT_WATCHER_SOCK
JARVIS_CAGI_PROXY_SOCK
JARVIS_REALTIME_SOCKET
JARVIS_DAEMON_BROWSER_CONTROL_SOCK
JARVIS_SPACE_SHARE_SOCKET
JARVIS_CHECKOUT_SPEND_SOCK
JARVIS_DAEMON_PRESENT_WIDGET_SOCK
JARVIS_HTTP_API_SOCKET / JARVIS_METRICS_SOCK
JARVIS_DAEMON_HEALTH_DELETE_SOCK
JARVIS_EGRESS_APPROVAL_EVENTS_SOCK
JARVIS_EXECD_SOCK                  （默认 /run/hatch/execd/execd.sock）
HATCH_RTC_STATS_SOCK               WebRTC 统计
```

**这补齐了架构报告 §10 的"未解明项"**：`stefi` 有双重命名
（`JARVIS_STEFI_PROXY_SOCK` 与 `HATCH_STEFI_PROXY_SOCK`），说明环境变量有
`JARVIS_*`（运行时）和 `HATCH_*`（工具层）两套前缀。

---

## 七、代号破译进度

| 代号 | 推断 | 依据 |
|---|---|---|
| `MASE` | 网络/连接策略引擎 | crate `hatch-mase-index`；`mase_outcome`、`mase_latency_ms` 与 connect 分类同组 |
| `CAGI` | 代理组件 | `JARVIS_CAGI_PROXY_SOCK`、`"CAGI fetch has no network authorizer"` |
| `stefi` | OAuth token 验证代理 | `verify_oauth_token` 往返；`JARVIS_STEFI_PROXY_SOCK` |
| `avocado` | 上下文压缩预算 | `JARVIS_AVOCADO_COMPACTION_TRIGGER_TOKENS`、`_CONTEXT_WINDOW_TOKENS` |
| `HBI` | 浏览器交互机制 | `browser_hbi_key_event_scheduled_delay_ms`、`hbi_checkout_page_signal` |
| `ipnext` | 推理引擎 | `ipnext_input_tokens` / `_cached_tokens` / `_reasoning_tokens` |
| `Cosmos` | 实时语音 | crate 模块 `realtime_voice`；`voice_root_cosmos`、`routes/voice/calls/cosmos.rs` |
| `scuba` | Meta 内部遥测平台 | `/run/hatch/telemetry/scuba` |
| `peerd` | 同伴协议守护 | `hatch-peer-identity`、`peerd_client.rs` |
| `WASA` | WhatsApp 协议 | crate `hatch-whatsapp-wasa-contract` |
| `magi` | 媒体服务 | `magi-media`、`/v1/magi` |

---

## 八、未解明（本轮后剩余）

| 项 | 状态 |
|---|---|
| `hatch-server/src/daemon/runtime` 之外的三级模块全貌 | 仅提取到部分 |
| `peerd` 的线格式（wire format） | 只有结构体名，未见序列化协议 |
| `magi` 具体职责 | 只知 `/v1/magi` 与 `magi-media` |
| `NarrowGrant` 的具体收窄语义 | 结构体名已见，字段未提取 |
| 宿主平面 `spawnd` 的完整子命令行为 | 有帮助文本，未见实现细节 |
| PostgreSQL 实例位置 | 仍在容器外 |

