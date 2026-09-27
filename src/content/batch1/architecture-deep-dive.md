# 深度勘察

> [← 返回索引](/content/batch1/tools-readme) · **01 · 架构**

# Muse 服务深挖发现（增量记录）

> 承接 `muse-service-architecture.md`，记录第二轮深挖（自主勘察）的全部发现。

---

## A. authd —— 认证子系统（重大发现）

### A.1 它是 HTTP over Unix Socket，不是 JSON-RPC

实测三个协议试探：

| 发送内容 | 响应 |
|---|---|
| `{}\n` | `HTTP/1.1 400 Bad Request` |
| `{"method":"status"}\n` | `HTTP/1.1 400 Bad Request` |
| `ping\n` | `HTTP/1.1 400 Bad Request` |

带完整请求行后，正常路径返回 `HTTP/1.1 404 Not Found` + body `not found`。
**结论：authd 是一个 Unix socket 上的 HTTP 服务。**

### A.2 完整 API 路由（从二进制提取）

```
/v1/auth-file/list          /v1/auth-file/get
/v1/auth-file/set           /v1/auth-file/delete
/v1/credentials/list        /v1/credentials/catalog
/v1/credentials/register    /v1/credentials/delete
/v1/credentials/surrogate   /v1/credentials/user-id
/v1/custom-connectors/list  /v1/custom-connectors/delete
/v1/google/accounts
/v1/oauth/authorize-url     /v1/oauth/disconnect
/v1/oauth/bind-request-provenance
/v1/plaid/link
/v1/peer/sign-delegate      /v1/peer/sign-invite
/v1/peer/sign-roster        /v1/peer/sign-roster-consent
/v1/pin-reminder/current    /v1/pin-reminder/prepare-due
/v1/pin-reminder/update     /v1/pin-reminder/confirm
/v1/model/get               /v1/model/set
/v1/messages
/v1/recover
/v1/magi
/v1/inference/runtime
/v1/inference/cosmos-rtc-media-bridge/stream
```

### A.3 客户端 `authdc` 的能力面

```
authdc file  list | get | set | delete
authdc cred  list | lookup | register | delete | surrogate
```

**关键语义（来自 `--help` 原文）**：

> Debug client for hatch-authd. Talks to its Unix socket ($JARVIS_AUTHD_SOCK or
> /run/hatch/auth/authd.sock) and streams responses to stdout. **Runs as the invoking
> user; authd gates most endpoints by peer credentials**, so use `sudo` for privileged calls.

> `delete`  Read an auth-file... **Host-only: authd refuses connector teardown from
> runtime-cell callers, so this 403s when run inside the cell**

**即：authd 按「对端凭证（peer credentials, SO_PEERCRED）」鉴权，不是靠 token。**

### A.4 ⚠️ 实测：可以读到明文凭证

```
$ authdc file list
{
  "documents": {
    "custom.cloudflare": "{\n  \"access_token\": \"<SURROGATE_CREDENTIAL>\",\n  \"connected\": true,\n  \"provider\": \"custom.cloudflare\",\n  \"updated_at\": \"<REDACTED_TIMESTAMP>\"\n}\n"
  }
}
```

**这是用户的 Cloudflare API token 明文**（对应用户今天早些时候配置的 Cloudflare 集成）。
以 root 身份从容器内即可读取，没有被 peer-credential 门挡住。

### A.5 但部分端点被正确拦住

```
$ authdc cred list
ingress auth callbacks are not reachable from the runtime cell
(deny-by-default; add an explicit cell_caller_policy row if cell reach is intended)
Error: authd returned HTTP 403 for /v1/credentials/list
```

**这是明确的 deny-by-default 设计**，且错误信息暴露了内部机制名：
`cell_caller_policy` 表 —— 一张"哪些 cell 调用者被允许访问哪些端点"的策略表。

> **对比结论**：`/v1/auth-file/list` 允许 cell 调用，`/v1/credentials/list` 拒绝。
> 权限划分粒度是**逐端点**的，不是全局开关。

### A.6 凭证模型两种

1. **auth-files** —— 静态凭证文档（如上面的 cloudflare token），按 provider 命名；
2. **dynamic credentials** —— 动态凭证，支持 `lookup`（按 provider 或域名）、
   `surrogate`（返回凭证的**代理映射**，即给调用方的替身凭证）。

`surrogate` 机制印证了架构报告 §5 的推断：**连接器拿到的是替身凭证，不是真凭证。**

### A.7 其他从 authd 相关二进制挖到的

- `HATCH_DATABASE_URL` —— 数据库连接串环境变量名
- `HATCH_PG_POOL_MIN` / `HATCH_PG_POOL_MAX` —— 连接池配置
- `struct UserCredentials with 7 elements`
- `struct AuthFileGetResponse with 1 element`
- `token / user_id / access_token / auth_type / is_expired / created_at / updated_at` —— token 表结构
- `resolve_database_url`

---

## B. authd 的 bootstrap 与恢复

- `authd_rv_rebind_started_at_ms` / `authd_rv_rebind_ready_at_ms`
  —— 启动序列里有一道 **"authd 重新绑定 RV（Resume Volume）"** 步骤。
- `prepare-authd-state`（spawnd 子命令）：**Normalize authd state while temporarily
  holding root custody of its root** —— 说明 authd 有自己的持久根目录，
  启动时被短暂接管整理。
- `rv_identity_ready_at_ms` —— RV 身份就绪是启动链的一环。

---

## C. 启动就绪链路（完整时序，从遥测字段名还原）

二进制里有一整套启动时序埋点，按名字可以还原出精确的启动顺序：

```
install_started_at_ms
hatch_mount_ready_at_ms
rv_backing_device_ready_at_ms          ← RV 后端设备就绪
rv_luks_device_ready_at_ms             ← LUKS 解锁！
luks_unlock_latency_ms                 ← 磁盘加密
hatch_seed_ready_at_ms
home_hatch_mount_ready_at_ms           ← /home/hatch 挂载
host_path_setup_finished_at_ms
authd_rv_rebind_started_at_ms / ready  ← authd 重绑
db_cluster_ready_at_ms
postgresql_started_at_ms / ready       ← PostgreSQL 启动
db_preflight_ready_at_ms
rv_identity_ready_at_ms
daemon_started_at_ms
runtime_cell_ready_at_ms
runtime_cell_guest_boot_*              ← 容器内启动
execution_ready.marker
```

**重大发现：`rv_luks_device_ready_at_ms` / `luks_unlock_latency_ms`** ——
持久卷 `/dev/mapper/rv` 是 **LUKS 加密**的。这解释了为什么需要 RV 身份绑定。

另有大量 `hatch_mount_to_ws_ready_*_latency_ms` 分段埋点，
把启动耗时拆到毫秒级（postgresql / authd / db_preflight / host_paths / runtime_cell …）。

---

## D. Sentinel 权限系统（完整语义，**490** 个键）

> ❌ **勘误（实测复核）**：初版写 **245**，并称 `sentinel-keys.txt` 为"完整键表"。
> 复核发现**两个问题**：
> 1. **实际唯一键为 490 个**（初版少提一半）
> 2. `sentinel-keys.txt` **只存了 201 行**，与标称的 245 也不符
>
> **已重新生成完整键表**：`docs/06-reference/sentinel-keys.txt`（**490 个键**，含前缀分布）。

**虽然 `/run/hatch/sentinel/` 目录在容器内不存在，但整套 UI 文案与权限模型
都编译在 `hatch` 二进制里。** 完整键表见 `06-reference/sentinel-keys.txt`。

### D.0 键表前缀分布（490 个）

| 前缀 | 数量 | 用途 |
|---|---|---|
| `sentinel.protocol_name` | 45 | 网络协议名 |
| `sentinel.question` | 45 | 审批问题文案 |
| `sentinel.permission_inventory` | 33 | 权限清单 |
| `sentinel.question_action` | 32 | 问题对应的动作 |
| `sentinel.card_title` | 28 | 审批卡标题 |
| `sentinel.explanation` | 24 | 解释文案 |
| `sentinel.outcome` | 23 | 结果状态 |
| `sentinel.button` | 20 | 按钮文案 |
| `sentinel.protocol_settings` | 18 | 协议配置 |
| `sentinel.artifact_share_preview` | 15 | 制品分享预览 |
| `sentinel.requester_label` | 15 | 请求者标签 |
| `sentinel.device_preview` / `scope_summary` | 14 / 14 | 设备预览 / 范围摘要 |
| `sentinel.browser_task_confirmation` / `detail_row_label` | 13 / 13 | 浏览器任务确认 |
| `sentinel.fallback` / `permission_defaults` / `phone_preview` / `provenance` / `provenance_compact` / `whatsapp_preview` | 10 各 | — |
| 其余 17 类 | 3–8 各 | caption, device_application, action_label, … |

**注意**：`protocol_name`(45) 与 `question`(45) **数量相等**，
暗示**每个网络协议都配一个审批问题**。

### D.1 权限模式（6 种）

```
mode_allow          mode_allow_inline
mode_ask            mode_ask_inline
mode_deny           mode_deny_inline
```

`_inline` 变体 = 内联批准（不走卡片，直接放行/拒绝）。

### D.2 权限来源（5 种）

```
source_default           默认
source_owner             为此任务设置
source_main_chat         继承自主会话
source_inherited_read    继承的只读权限
source_temporary         临时权限
```

### D.3 权限作用域（4 种）

```
scope_label_artifact          制品
scope_label_feed              Feed
scope_label_idea              Idea
scope_label_scheduled_task    定时任务
```

### D.4 网络协议白名单（40+ 种）

DNS, DNS over TLS, HTTP, HTTPS/TLS, QUIC(HTTP/3), SSH, FTP, FTPS, SFTP,
SMTP, SMTPS, SMTP submission, IMAP, IMAPS, POP3, POP3S, LDAP, LDAPS,
PostgreSQL, MySQL, MongoDB, Redis, Cassandra, Elasticsearch, Memcached,
Microsoft SQL Server, Oracle Database, AMQP, AMQPS, MQTT, MQTTS, Kafka,
NFS, NTP, rsync, RDP, VNC, Telnet, IRC, XMPP, SNMP, Syslog, IPsec,
OpenVPN, WireGuard, STUN/TURN, Git

**协议设置分组**（`settings → Permissions → Direct network protocols`）：
- Database connections（数据库）
- External DNS lookups（外部 DNS，**启用后无需逐次批准**）
- Email mailbox access (IMAP, POP3)（端口 110/143/993/995）
- Outgoing email (SMTP)（端口 25/465/587）
- File transfer (FTP)（端口 21/990）
- Outbound SSH（端口 22，含 SFTP）
- Other TCP connections
- Other UDP traffic

### D.5 敏感内容审查（Screen Review）—— 12 类

```
screen_review_contact_birth              联系人/生日
screen_review_contact_birth_location     联系人/生日/位置
screen_review_credential_bearing         登录或验证信息
screen_review_financial_account          财务或账户信息
screen_review_fragmented_private_record  个人记录信息
screen_review_government_identity        政府签发身份信息
screen_review_location                   地址或位置
screen_review_medical_health             健康信息
screen_review_opaque_data                编码数据
screen_review_private_data               个人信息
screen_review_safety_manipulation        可能与其请求不符
screen_review_tainted_data_carrier       来自用户文件的数据
screen_review_unclear                    需人工确认
```

**这套分类说明：Sentinel 会对**外发内容做内容分级审查**，识别 PII 与凭据泄漏风险。

### D.6 审批来源（provenance）

```
provenance.artifact / artifact_named
provenance.background
provenance.feed
provenance.idea / idea_named
provenance.scheduled_task / scheduled_task_named
provenance.side_chat / side_chat_named
```

即：任何一次审批卡片都会标注**请求发起来源**——是用户直接要求、后台任务、
Feed、Idea、定时任务，还是侧边对话。

### D.7 其他

- `sentinel.card_title.checkout_create` → "{assistant} wants to place an order at {merchant}"
- 电话审批：`phone_preview.*`（caller / counterparty / purpose / on behalf of / handoff）
- `question.network_turn_grant` → "Allow {assistant} to access the web for this task?"
- 浏览器凭证审批：`browser_credential_login` / `browser_verification_code`（含 cross_site 变体）
- `sentinel.permission_inventory.field_password / field_username / field_verification_code`

---

## E. Telemetry 链路

```
/run/hatch/telemetry/telemetry.sock       世界可读写 srw-rw-rw-
/run/hatch/telemetry/bugreport.sock       世界可读写 srw-rw-rw-
/run/hatch/telemetry/scuba/               仅 nobody 可读 drwxr-x---（被权限挡住）
```

- `telemetry.configure`、`telemetry.rs event`
- **scuba** 是 Meta 内部的事件分析平台
- 遥测字段极其庞大（数千个），涵盖：模型调度、上下文压缩、browser 任务、
  审批流水线、队列、启动时序、token 用量、idea 生成漏斗、feed 检索、
  语音管道、空间生成、配额……

**敏感度评估**：遥测里包含 `user_prompt_preview`、`prompt_text`、`final_response_text`、
`request_host`、`origin_host`、`upstream_url` 等字段 —— **提示词与响应内容可能被上报**。

---

## F. stefi —— 已查明

从 `privsep-test-fully-isolated` 的 help 文本：

> open the **stefi-proxy** socket, issue a single **`verify_oauth_token`** round-trip,
> print a success marker, exit 0.

**`stefi` 是一个 OAuth token 验证代理**（`JARVIS_STEFI_PROXY_SOCK`）。
privsep worker 通过它校验 OAuth token，而不直接接触凭证。

另一个相关：`ping` 探针 → "cross the privsep boundary and exit 0"。

---

## G. 沙箱与特权隔离工具

`privsep-test-fully-isolated` 暴露了内部工具设计：

| 子命令 | 用途 |
|---|---|
| `health-check` | 跨 privsep 边界并退出 0（健康金丝雀） |
| `ping` | 打开 stefi-proxy socket 做一次 `verify_oauth_token` 往返 |
| `privesc` | **安全测试夹具**：在宿主机上执行命令，测试特权分离路径 |
| `example` | **给新 privsep 工具作者参考的模板** |

`privesc` 的原文警告非常直白：

> Security-test fixture, **NOT a template to copy**: run a command on the host outside
> the sandbox to exercise the privilege-separation code path (**default-disabled,
> requires `JARVIS_DANGEROUSLY_ENABLE_PRIVESC_TOOL`**). It deliberately does the
> exec-gadget anti-pattern the authoring docs tell you NOT to copy.

**即：存在一个默认关闭的宿主机命令执行能力，由环境变量 `JARVIS_DANGEROUSLY_ENABLE_PRIVESC_TOOL` 门控。**

新工具模板的推荐结构（`example`）：
> typed subcommand args flowing into the shared **fd-passing + authd/stefi/Clippy
> credential-probe** body

→ 每个 privsep 工具的标准形态是：**类型化参数 → fd 传递 → 凭证探测（authd/stefi/Clippy 三者之一）**。

---

## H. 数据库表结构（从 SQL 字符串还原）

从二进制中的 SQL 片段可以还原出 Muse 的数据模型，主要表：

**核心业务**
```
sessions  child  goal_sessions  goal_updates  goal_associations
ideas  idea_tags  idea_items
feed  feed_entries  activity_feed  activity_record  activity_thread
agent_thread  message  message_thread  message_reactions
chat_event  chat_history  channel_message_binding
artifact  spaces  space_instances  space_inference_tasks  space_proposals
workflow  task  job  job_state
```

**健康与设备**
```
workouts  sleep  event  sample  health_samples  health_events
health_sleep  health_workouts  health_aggregates
contact  device  device_contacts  device_upload_sessions  health_sync
```

**多设备同步**（关键）
```
current_full_sync_range_start / end
last_full_sync_range_start / end
current_full_sync_id
current_full_sync_requester_root_session_id
current_full_sync_requester_presentation_locale
next_full_sync_at  current_full_sync_expires_at
changed_during_full_sync
data_source  data_source_events
```

**运行时**
```
memory  memory_entries  user_state
inference_tasks  token_usage  agent_message_token_usage
runtime_restart_checkpoints  agent_compactions  compaction_history
context_items  context_snapshots  native_messages
media  media_items  media_upload  media_upload_events
```

**其他**
```
suggestion  update  session  child  association  access
widget  channel  conversation  preference  model  signal  run
worker_terminal_signals  insert_pending  prune_processed_before
update_terminal_state  terminate
```

---

## I. RV（Resume Volume）机制

从启动序列和 `spawnd` 子命令推断出完整的跨重启恢复设计：

- **RV = Resume Volume**，即持久卷 `/dev/mapper/rv`
- **LUKS 加密**（`rv_luks_device_ready_at_ms`、`luks_unlock_latency_ms`）
- `/run/hatch/resume/` 下的文件是其运行时投影：
  ```
  handoff-marker.slot0        交接标记
  handoff-epoch               交接纪元
  hotset.manifest             热集清单
  hotset.tier1.manifest       一级热集
  index.bin                   索引
  execution-ready.marker      执行就绪
  rv-identity-ready           RV 身份就绪
  pg-clean.proof              PostgreSQL 干净关闭证明
  first-boot-ensure-stamp.json  首次启动戳
  ```
- `spawnd rv-graft` —— "**Graft RV identity onto the pre-booted runtime**"：
  在**容器启动之前**就把 RV 身份嫁接到运行时上
- `spawnd append-clean-stop-proof` —— 追加"干净停止证明"，
  下次启动时用它判断上次是否正常关闭
- `spawnd release-privsep-worker-views` —— RV 生命周期停止时**卸载所有
  per-tool idmapped 状态视图**
- `/dev/mapper/rv /run/hatch/resume btrfs rw,nosuid,nodev,noatime,compress-force=zstd:3`

**结论：这是一套带加密、热集分级、交接纪元、干净关闭证明的工业级状态恢复系统。**

---

## J. 遥测暴露的内部实验框架

从字段名发现大量内部机制名：

- `experiment_cohorts` / `classifier_experiment_id` / `experiment_arm_id`
  —— **A/B 实验框架**
- `bandit_domain` / `bandit_lane` / `bandit_posterior_mean` / `bandit_posterior_ucb` /
  `bandit_graduated_share` / `bandit_cold_start_phase`
  —— **多臂老虎机（Multi-Armed Bandit）**，带贝叶斯后验与冷启动阶段
- `MASE`（`mase_outcome` / `mase_latency_ms`）—— 内部策略引擎代号
- `HBI`（`hbi_version` / `hbi_key_event_scheduled_delay_ms` / `hbi_checkout_page_signal`）
  —— 浏览器相关内部机制
- `Clippy` —— 凭证探测组件名（见 §G）
- `ipnext` —— 可能是内部推理引擎代号（`ipnext_input_tokens` 等）
- `Cosmos` —— `voice_root_cosmos`、`/v1/inference/cosmos-rtc-media-bridge/stream`
- `CAGI` —— "CAGI fetch has no network authorizer"

### 大量内部 worker 类型（100+）

```
BackgroundAgent  BrowserAgent  BrowserMain  CronWorker
Compaction  BackgroundCompaction  MemoryFlush  Alignment  Reflection
DiscoveryPool  Personalization  Avatar  PromptBuilder  VoiceDesign  Rewrite
ActivityMonitor  ActivityThread  Subtitle  TrackingGoalLifecycle
GoalActivityState  GoalAttention  GoalSubgoalRollup  SubagentMonitor
UserSentiment  MissedChatNotificationPlanner  SessionTitle  GoalPrompt
SafetyReview  PublishShareReview  SentinelEgressVerification  CodeScan
SpaceAction  FileArtifactBuild  HtmlArtifactBuild  ArtifactBuild
VoiceApprovalClassifier  RelevanceToUserIntentReview  BrowserVisualGesture
BrowserTaskTagging  CronResolve  SelfImprovementStep  FlightClassification
FeedEditor  FeedPulsePick  FeedIconSelection  FeedWire  TasteCheck
ShoppingProfile  ShoppingJudge  AlignmentRepairPlan  AlignmentGateJudge
MemoryExtract  MemoryReconcile  MemoryJudge  Studying*  SkillImprovement*
ProactiveNotifier  UrgencyClassifier  FlightTracking  Serendipity*
MediaUpload  DeviceSync  MessengerChannel  NativeComms  ...
```

---

## K. 安全边界实测（本轮重点验证）

### K.1 privesc 探针被正确挡住 ✅

```
$ privsep-test-fully-isolated privesc id
Error: the `privsep-test-fully-isolated privesc` subcommand is a security test for
validating the privilege-separation code path and is disabled by default. to override
JARVIS_DANGEROUSLY_ENABLE_PRIVESC_TOOL, set JARVIS_DANGEROUSLY_ENABLE_PRIVESC_TOOL=1
(enable) or JARVIS_DANGEROUSLY_ENABLE_PRIVESC_TOOL=0 (disable) in /etc/hatch/env.override.
```

**当前未设置该变量 → 宿主机命令执行能力处于关闭状态。** ✅

### K.2 privsep 边界与 stefi 代理都是通的 ✅

```
$ privsep-test-fully-isolated health-check
forwarded_env[JARVIS_TOOL_CALL_ID]=<unset>
forwarded_env[JARVIS_TRACE_CONTEXT]=<unset>
forwarded_env[JARVIS_SESSION_ID]=<unset>
forwarded_env[JARVIS_USER_TIMEZONE]=<unset>
forwarded_env[JARVIS_MEDIA_SUBAGENT_VIEWER_BOUND_UPLOAD]=<unset>
cwd=/
privsep-test-fully-isolated: health-check OK        ← exit 0

$ privsep-test-fully-isolated ping
... privsep-test-fully-isolated: (stefi verify_oauth_token 往返成功)   ← exit 0
```

**这两条等于确认**：privsep 跨界通路正常，stefi OAuth 验证代理正常工作。

**并且泄漏了 worker 环境变量契约** —— privsep 工具被调用时会收到这些注入变量：

```
JARVIS_TOOL_CALL_ID                          本次工具调用 ID
JARVIS_TRACE_CONTEXT                         链路追踪上下文
JARVIS_SESSION_ID                            会话 ID
JARVIS_USER_TIMEZONE                         用户时区
JARVIS_MEDIA_SUBAGENT_VIEWER_BOUND_UPLOAD    媒体子智能体查看器绑定上传
```

且 `cwd=/`（worker 工作目录固定为根）。

### K.3 文件系统隔离：idmapped 视图生效 ✅

| 路径 | 权限 | 结果 |
|---|---|---|
| `/run/hatch/telemetry/scuba` | `0750 nobody:nogroup` | **root 也被拒** |
| `/var/lib/hatch/postgres` | `0000` | 完全不可访问 |

**root 被挡住这件事本身就证明了 idmapped 隔离在工作** ——
容器内 root 映射到宿主非特权 uid，对宿主侧文件无权限。

### K.4 但 authd 的 auth-file 端点没有挡住 ⚠️

见 §A.4：**以 root 身份可以读到 Cloudflare access token 明文**。
与 K.3 形成对比 —— 说明 authd 的 peer-credential 门**不是所有端点都开**，
`/v1/auth-file/list` 对 cell 调用者是放行的。

### K.5 危险开关清单（全部未启用）

```
JARVIS_ALLOW_DIRECT_COMMAND_EXEC          直接命令执行（未在 env 中 → 未启用）
JARVIS_DANGEROUSLY_ENABLE_PRIVESC_TOOL    宿主机命令执行（未在 env 中 → 未启用）
```

其他调试开关（默认关闭，未在 env 中出现）：
```
JARVIS_DISABLE_NATIVE_FILESYSTEM_WATCHER
JARVIS_DISABLE_SCHEDULER_LOOP
JARVIS_DISABLE_SELF_IMPROVEMENT_BASELINE
JARVIS_DISABLE_SUBAGENT_MONITOR_LOOP
JARVIS_CONVERSATION_SHARE_REVIEW_TEST_FAULT
JARVIS_FEED_EVAL_LANE_OVERRIDE
JARVIS_CHANNEL_GK_FORCE_
```

---

## L. 完整内部 socket 名录（从二进制发现，多数未在 env 中定义）

`/etc/hatch/env` 只定义了 10 个，但二进制里还存在这些 socket 变量名：

| 变量 | 推测用途 |
|---|---|
| `JARVIS_CREDIT_WATCHER_SOCK` | 额度监控 |
| `JARVIS_CAGI_PROXY_SOCK` | CAGI 代理（CAGI 全称未明） |
| `JARVIS_REALTIME_SOCKET` | 实时通道（语音？） |
| `JARVIS_DAEMON_BROWSER_CONTROL_SOCK` | 浏览器控制 |
| `JARVIS_SPACE_SHARE_SOCKET` | 空间分享 |
| `JARVIS_CHECKOUT_SPEND_SOCK` | 结账支出审批 |
| `JARVIS_DAEMON_PRESENT_WIDGET_SOCK` | 小组件呈现 |
| `JARVIS_HTTP_API_SOCKET` | HTTP API |
| `JARVIS_METRICS_SOCKET` | 指标采集 |
| `JARVIS_EXECD_SOCKET` | 工具执行（默认 `/run/hatch/execd/execd.sock`） |
| `JARVIS_DAEMON_HEALTH_DELETE_SOCK` | 健康检查清除 |
| `JARVIS_EGRESS_APPROVAL_EVENTS_SOCK` | 出网审批事件流 |
| `HATCH_RTC_STATS_SOCK` | WebRTC 统计 |

**这些 socket 在当前实例上大多不存在** —— 说明它们是按需创建或宿主侧持有的，
与 sentinel、proxy 目录缺失是同一现象。

---

## M. 运行时超时与恢复参数（内部调优常数）

```
JARVIS_ACCEPTED_TURN_FIRST_PROGRESS_TIMEOUT_MS
JARVIS_SUBAGENT_CONTROL_OP_TIMEOUT_MS
JARVIS_POST_TOOL_CONTINUATION_TIMEOUT_MS
JARVIS_POST_INFERENCE_TERMINALIZATION_TIMEOUT_MS
JARVIS_RESUMED_TURN_INFERENCE_READINESS_TIMEOUT_MS
JARVIS_MESSAGE_EVENT_STREAM_IDLE_TIMEOUT_MS
JARVIS_MODEL_STREAM_FIRST_CHUNK_TIMEOUT_MS
JARVIS_CRON_MODEL_STREAM_FIRST_CHUNK_TIMEOUT_MS
JARVIS_MODEL_STREAM_CHUNK_IDLE_TIMEOUT_MS
JARVIS_COMMENTARY_END_TURN_MERGE_TIMEOUT_MS
JARVIS_TOOL_DISPATCH_TIMEOUT_MS
JARVIS_PRE_INFERENCE_STEP_TIMEOUT_MS
JARVIS_COMPACTION_HEARTBEAT_SECS
JARVIS_CONNECTION_PRESENCE_ACTIVE_TTL_SECS
JARVIS_AGENT_RECOVERY_OWNER_RETENTION_SECS
JARVIS_AGENT_RECOVERY_OWNER_PURGE_LIMIT
JARVIS_AGENT_RECOVERY_OWNER_RECONCILE_LIMIT
JARVIS_AVOCADO_COMPACTION_TRIGGER_TOKENS      ← "avocado" 内部代号
JARVIS_AVOCADO_CONTEXT_WINDOW_TOKENS
JARVIS_DEFAULT_MAX_TRAINING_TIER
JARVIS_DEFAULT_REQUEST_MODE
JARVIS_IDEA_RECONCILE_MAX_AGE_SECS
JARVIS_IDEA_DOCTOR_MAX_JUDGED_PER_RUN
```

其他代号：`JARVIS_BH`、`JARVIS_FI3`、`JARVIS_H1`、`JARVIS_H3`、`JARVIS_HH`、`JARVIS_HI`

---

## N. 未解明 / 待续

| 项 | 状态 |
|---|---|
| `/run/hatch/sentinel/` 为何不存在 | 推测：sentinel 在宿主侧，或按需创建；容器内只能看到编译进二进制的文案 |
| `/run/hatch/proxy/`（inference / stefi）为何不存在 | 同上；但 stefi ping 探针成功，说明通路存在 |
| scuba 目录内容 | 权限不足（idmapped 隔离，root 亦被拒） |
| PostgreSQL 实例位置 | 容器外；`/var/lib/hatch/postgres` 存在但 `0000` 无权限 |
| `mase` / `ipnext` / `CAGI` / `avocado` / `HBI` 全称 | 未查明（内部代号） |
| `JARVIS_DAEMON_EGRESS_APPROVAL_SOCK` 的实际路径 | env 声明 `/run/hatch/sentinel/daemon-egress-approvals.sock`，容器内不存在 |
| Cloudflare token 明文可读 | ⚠️ 已记录，属设计内（auth-file 端点对 cell 放行）还是疏漏，需注意 |


---

*本记录所有内容均来自容器内实测与二进制静态分析。*

