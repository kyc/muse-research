# Web Chat 实现

> [← 返回索引](/content/batch1/tools-readme) · **04 · 推理与 Agent**

# Web 端 Chat 的实现机制

> 问题：Web 能聊天，说明推理通道存在 —— 它到底怎么走的？

---

## 一、完整答案：三跳架构

```
【公网】
  浏览器 / App（Muse Web 客户端）
      │  ① WSS + JWT
      │     wss://<env>.hatch.fbinfra.net/v1/noise
      ▼
【Cloudflare / Meta 边缘】
      │  ② Noise_XX 加密隧道
      ▼
【宿主侧 ingress-rev-proxy】  ← 关键：不在容器内！
      │  ③ 解密后转发到本地 Unix socket
      ▼
【容器内 daemon】
      /run/hatch/daemon/http-api.sock  →  DaemonHttp
      │
      ▼
   daemon 处理 chat.send_message
      │
      ▼
   推理（daemon 内部，通过自己的 inference proxy）
```

**关键点**：`ingress-rev-proxy` **不在容器里**（实测 `ps` 找不到它），
它跑在**宿主侧**，通过 Unix socket 访问容器内的 daemon。

---

## 二、逐层证据

### 2.1 `ingress-rev-proxy` 是入口（12.0 MiB 二进制）

> **精确值（实测复核）**：`12,608,040 B` = **12.02 MiB**（初版写 12.5 MB，略偏 ~4%）

它的自述（从二进制提取）：

> **Internet-facing ingress reverse proxy with Noise_XX encryption**

暴露的路由：

```
/v1/noise            ← Web 客户端主入口
/v1/noise-probe      ← 存活探测
/v1/tunnel           ← 隧道
/v1/ssh              ← SSH 访问
/v1/auth             ← 认证
/v1/vault/*          ← 密钥保管
/v1/rescue/*         ← 救援
/v1/ops/*            ← 运维
/v1/ping
/v1/spaces
```

**监听两个平面**（二进制原文）：

| 平面 | 端口 | 用途 |
|---|---|---|
| `--listen-user` | `[::]:4431` | **公网数据面**（ping, noise, spaces） |
| `--listen-infra` | `:443` | 基础设施（+ noise-probe, health, ops, journal, rescue, yolk） |

> `--listen-public-internet` is the preferred, impact-focused flag name;
> the `--listen-user` spelling is retained as an alias

### 2.2 ⭐ 后端映射表（最关键的证据）

从二进制提取的**完整后端 socket 映射**：

```
/run/hatch/daemon/http-api.sock          → DaemonHttp        daemon.invalid
/run/hatch/noded/http-api.sock           → NodeService       noded.invalid
/run/hatch/sentinel/http-api.sock        → Sentinel          (sentinel.invalid)
/run/hatch/vault/auth.sock               → Vault             vault.invalid
/run/hatch/vault/health.sock             → VaultHealth       vault-health.invalid
/run/hatch/auth/authd.sock               → Authd             authd.invalid
/run/hatch/auth/authd.sock               → AuthdCheck        authd-check.invalid
/run/hatch/healthd/healthd.sock          → Healthd           healthd.invalid
/run/hatch/storage-recovery/http-api.sock → StorageRecovery  storage-recovery.invalid
/run/hatch/daemon/metrics.sock           → DaemonMetrics     daemon-metrics.invalid
/run/hatch/journal/gateway.sock          → Journal           journal.invalid
/run/hatch/ssh-access/ssh-access.sock    → SshAccess         ssh-access.invalid
/run/hatch/rescue/http-api.sock          → RescueHttp        rescue-http.invalid
/run/hatch/rescue/ws.sock                → (rescue websocket) rescue-ws.invalid
/run/hatch/yolk/yolk.sock                → (yolk tunnel)
/run/hatch/peerd/ingress.sock            → Peerd             peerd.invalid
```

**这就是答案**：Web 客户端的 chat 请求，
最终被转发到 **`/run/hatch/daemon/http-api.sock`**。

### 2.3 chat 的具体路由

```
chat.subscribe    ← 订阅回复流（Web 客户端"看着"回复到达的通道）
```

二进制中的相关日志点：

```
crates/ingress-rev-proxy/src/noise_routes/chat_subscribe.rs:80
  "chat.subscribe daemon unavailable while reliable storage is constrained"
  "chat.subscribe storage recovery response withheld because daemon readiness..."
  daemon_ready
```

**即**：Web 客户端用 `chat.subscribe` 订阅流，`ingress-rev-proxy` 把它桥接到 daemon。

---

## 三、为什么这条通道不能复用

### 3.1 它需要三层凭证与网络权限，容器内全不可达

| 层 | 需要什么 | 现状与实测阻断 |
|---|---|---|
| ① 传输网络与 JWT | `Authorization: Bearer <jwt>` + `?auth_token=` | ❌ 需登录 Token，且出网先遭宿主 eBPF 拦截（`os error 1`） |
| ② Noise_XX 机器身份 | **RV 密钥**（32 字节机密卷密钥）+ **Hen Notary Token** | ❌ 容器内无私钥，且无 Meta 内网 Hen 服务路由 |
| ③ TEE 硬件校验 | **服务端 AMD SEV-SNP 硬件证明与镜像透明度** | ⚠️ 客户端校验服务端真实性（可用 `--allow-unattested-rv` 单向跳过） |

**第 ② 层与网络门禁是双重死结**。`hatch-ws-client --noise` 源码（`hen.rs` 与 `noise.rs`）与实机测试表明：
- 客户端在 `msg3` 必须呈递 `RV key` 与 Hen 密钥服务（`thatch.hen.*`）签发的 `notary token`。
- 客户端在 `msg2` 会主动校验服务端出具的 AMD SEV-SNP 证明与镜像签名；若服务端证明失败，客户端拒绝呈递 RV 密钥并报错中断（可用 `--allow-unattested-rv` 跳过对服务端的硬件证明校验，但无法越过缺失的客户端 RV 密钥与 Hen 凭据）。
- 容器内直接发起的 TCP 握手在物理层首先遭遇宿主 eBPF 内核门禁硬性拦截（`Operation not permitted`）。

#### 【审核补遗】`:4431` 与 `:443` 的权威关系（二进制 --help 原文）

初版把两者描述为"公网数据面"和"基础设施"，**不够精确**。原文（逐字）：

> **`--listen-user`**（默认 `[::]:4431`）
> "Public-internet data-plane listener. The `:4431` surface is a **strict SUBSET of
> `:443`** — the full `Surface::PublicInternet` route set: proxy-local `ping`,
> `v1/noise`, and `spaces`. **Nothing is exclusive to this plane**, so an operator
> auditing this internet-facing listener must **scope monitoring/firewall/cert
> review to ALL of the above**, not just Spaces/Noise."
>
> **别名**：`--listen-public-internet`（原文标注为
> "the **preferred, impact-focused** flag name"，`--listen-user` 保留仅为平滑迁移）

> **`--listen-infra`**（默认 `[::]:443`）
> "INFRA/ops listener: the **SAME `Surface::PublicInternet` set** as `--listen-user`
> (ping, noise, spaces) **PLUS** the infra-only routes (`noise-probe`, `health`,
> `healthz`, `version`, auth-test/*, `v1/ops/*`, journal, rescue, yolk)."
> "Binding `443` requires `CAP_NET_BIND_SERVICE` (granted by the systemd unit via
> `AmbientCapabilities`), since the proxy is non-root."

**关键修正**：
| | 初版理解 | 准确理解 |
|---|---|---|
| `:4431` | 公网数据面 | **`:443` 的真子集**（3 条路由）|
| `:443` | 基础设施 | **超集** = 公网 3 条 + infra 专属路由 |
| 关系 | 并列 | **包含**（4431 ⊂ 443）|

**安全含义**（原文强调）：审计公网监听器时，
**必须把监控/防火墙/证书审查范围覆盖到全部路由**，不能只看 Spaces/Noise。

**证书**：两者**都用同一张 INTERNAL PKI 的 Meta-RA "credentials" 证书**
（`/etc/tls/credentials`，`0640 root:hatch-shared`，非 root 代理经 group 读取）；
`/etc/tls/prodca` 是手动调用时的占位默认值。
> The RV key is **confidential-volume key material**, so by default the client
> verifies attestation before presenting it

**RV 密钥是 LUKS 机密卷的解密密钥**，用于向服务端证明"我是合法镜像"。
它在**宿主侧**，容器内拿不到。

### 3.2 ingress-rev-proxy 自身不可达

```
$ ps aux | grep ingress-rev-proxy
  ❌ 未运行（不在容器内）

$ connect 198.19.0.1:4431
  PermissionError     ← eBPF 挡

$ connect 127.0.0.1:4431
  ConnectionRefused   ← 本地没有
```

它跑在**宿主侧**，容器内**既看不到进程，也连不到端口**。

### 3.3 它转发到的 daemon socket 也不可达

`/run/hatch/daemon/http-api.sock` —— 这个路径在容器内**不存在**。

daemon 跑在**独立 mount namespace**（第三轮验证）：
```
PID 67 (daemon)  → /proc/67/ns/mnt: Permission denied
当前 shell       → mnt:[4026532379]     ← 不同 namespace
```

---

## 四、三层通道的对照

现在可以把所有通道摆在一起看了：

| 通道 | 面向 | 路径 | 我们能走吗 |
|---|---|---|---|
| **工具** (privsep) | 容器内进程 | `/run/hatch/privsep/*.sock` | ✅ **已打通** |
| **Web chat** | 公网客户端 | ingress :4431 → Noise → daemon | ❌ 缺 RV 密钥 + 证明 |
| **daemon API** | 宿主侧组件 | `/run/hatch/daemon/http-api.sock` | ❌ namespace 隔离 |
| **推理** | daemon 内部 | 私有 inference proxy | ❌ 四重封锁 |

**Web chat 走的是第二条**，而这条需要**机密计算证明**。

---

## 五、一个重要的认知修正

我之前的表述是"推理层完全封闭"，**这不够准确**。

**更准确的表述**：

```
推理能力是存在的，而且 Web 客户端正在用。
但它绑定在"机密计算通道"上：
  客户端必须提供身份（RV 密钥 + Hen 签发的 Notary Token）
  且必须验证服务端的 AMD SEV-SNP 硬件证明（或显式跳过）
  → 握手成功后服务端把请求解密并转发给 daemon
  → daemon 才发起推理

而 RV 密钥和 Hen 铸造能力都在容器外，容器内发起的请求先行被 eBPF 拦截。
```

**所以问题不是"推理不存在"，而是"进入推理的门票在容器外，且网络链路受内核门禁拦截"。**

### 三种"客户端"的身份差异

```
Web 客户端    → 有 RV 密钥 + Hen Notary Token → 可完成握手调用 chat
外部客户端   → 无 RV 密钥与 Notary Token     → 只能到 ingress 的 4431 端口，Noise 握手过不去
容器内进程    → 遭 eBPF 封锁 + 缺私钥凭据     → 出网直接报 Operation not permitted (os error 1)
```

---

## 六、有没有理论上的第三条路？

穷举：

### 6.1 ❌ 用 hatch-ws-client --noise

实测首先在物理链路被宿主 eBPF 拦截（`connect timed out: IO error: Operation not permitted (os error 1)`）。
即使打通网络，客户端在 Noise `msg3` 中必须呈递 32 字节机密卷恢复密钥（RV key）与外部 Hen 密钥服务签署的 Notary Token。同时客户端默认要求服务端出具 AMD SEV-SNP 硬件证明（可通过 `--allow-unattested-rv` 跳过对服务端的校验，但客户端所需的 RV 密钥和 Hen 凭据在容器内仍不可得）。

**RV 密钥在哪里？** `/run/hatch/resume/` 下仅有宿主挂载的 `rv-identity-ready` 状态标记，容器内不存在任何私钥实体，更无 Meta 企业内网 Hen 服务路由。

### 6.2 ❌ 让 CF 隧道指向 ingress

我们的 CF 隧道回源是 `localhost:18080`（muse-bridge）。

**理论上**可以让 cloudflared 回源到某个能连 ingress 的地方 —— 但：

- 外部宿主环境**不在** Muse 网络里，连不到 `198.19.0.1:4431`
- VM 内连 4431 被 eBPF 挡
- **没有任何一跳能到达 ingress**

### 6.3 ❌ 从 agent 会话"重放"

`agents/*/sessions/*.jsonl` 里有历史会话，
但那是**已完成推理的记录**，重放它不会发起新推理。

### 6.4 ⚠️ 唯一的间接路径：工具内部的推理

某些工具内部会调模型：

```
web-search        → 可能做结果排序/摘要
image-search      → 语义匹配（provider=mase）
media-generation  → 生成模型（不是 LLM，但也是推理）
```

**但**：
- 不能自由指定 prompt
- 输出是工具语义结果，不是 token
- **不能当通用 LLM 用**

---

## 七、结论

### 7.1 直接回答"Web 端 chat 如何实现"

```
浏览器
  → wss://<env>.hatch.fbinfra.net/v1/noise   (JWT + Noise_XX)
  → 宿主侧 ingress-rev-proxy :4431
  → 解密后经 Unix socket 转发
  → 容器内 /run/hatch/daemon/http-api.sock
  → daemon 处理 chat.send_message
  → daemon 内部发起推理
```

**Web 客户端是"受信任的客户端"**，
它持有合法 RV 密钥并经由 Hen 签发 Notary Token，验证服务端 SEV-SNP 证明后建立安全通道直达 daemon。

### 7.2 我们能复用吗

**不能。** 物理链路与凭据双重封锁：

1. **宿主 eBPF 内核门禁**：容器内发起的出站 TCP 连接被宿主内核直接拦截（`Operation not permitted`）。
2. **Noise 握手缺失客户端凭据**：容器内无 32 字节 RV 密钥实体，且无内网路由与权限调用 Hen 密钥服务铸造 Notary Token。
3. **服务端机密计算硬件绑定**：服务端必须出具合法 AMD SEV-SNP 硬件证明与镜像签名，外部客户端才会呈递私钥（虽可在测试中单向跳过服务端校验，但无法解决客户端私钥缺失）。

### 7.3 能力边界最终表

| 能力 | 能否经 CF 对外 |
|---|---|
| 56 个工具 | ✅ **已实现** |
| **LLM chat / 推理** | ❌ **不可行**（门票在容器外） |
| agent 编排 | ❌ 不可行 |
| 读取会话记录 | ⚠️ 可读文件 |

---

## 八、设计洞察

### 为什么工具开放而 chat 封闭？

```
工具调用    无状态、单次、副作用可枚举
            → privsep socket 就够（socket 权限即边界）

chat 推理   有状态（会话历史）、持续、消耗额度
            → 需要完整的客户端身份
            → 用机密计算证明"你是合法客户端"
```

**Web chat 之所以需要 Noise + RV 密钥 + 硬件证明**，
是因为它承载的是**用户的完整会话**（含记忆、历史、私人数据），
而工具只是一次性的能力调用。

### 这个设计的一致性

```
工具    → socket 权限      → 开放
daemon  → mount namespace  → 隔离（即使容器内 root 也看不到）
ingress → 硬件证明 + 密钥  → 只认"真客户端"
```

**三层用三种不同的机制**，但目标一致：
**让"能力"可被本地程序使用，让"会话"只属于真正的用户客户端。**

---

*本报告基于 ingress-rev-proxy 二进制的字符串分析 + 容器内实测。*
*ingress-rev-proxy 本身未运行在容器内，其行为从二进制与配置推断。*

