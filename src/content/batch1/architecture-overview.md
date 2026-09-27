# 架构总览

> [← 返回索引](/content/batch1/tools-readme) · **01 · 架构**

# Muse 服务架构勘察报告

> 勘察对象：`htch-runtime`（Muse agent 运行时实例）
> hatch 版本：`0.1.0 (f43d26fc581)`
>
> ⚠️ **易变字段提示（实测复核）**：本文多处取值**随实例/构建变化**，引用时须复核：
>
> | 字段 | 撰写时 | 复核时（实测对比）| 性质 |
> |---|---|---|---|
> | hatch 版本 | `f43d26fc581` | **`52f8ba6ef72`** | 二进制被重新构建 |
> | `JARVIS_INFERENCE_HOSTNAME` | `xxxxxxxx-…` | **`xxxxxxxx-…`** | **每实例独立** |
> | hatch 二进制大小 | 361 MB | **323.5 MB** | 随构建变化 |
> | daemon 线程数 | 16 | **11** | 运行时波动 |
>
> **稳定的**（复核一致）：实例 ID `xxxxxxxx…`、socket 数 **86**、
> multicall 硬链接 **34**、`ca-bundle.pem` 183 KB、`/proc/67/environ` 拒绝读取。

---

## 0. 一句话结论

**这不是一台普通 VM，而是一个 `systemd-nspawn` 容器（"runtime cell"），由宿主侧 `spawnd` 编排。**
你看到的 Linux 7.0.0 / Ubuntu 24.04 是**容器内视角**；容器外还有一层宿主平面，
负责网络管控、密钥分发、工作进程派生。**"重启丢 /etc"的真正原因是：容器根文件系统每次重建。**

---

## 1. 进程拓扑

```
宿主平面（host，不可见）
  └─ spawnd ................ Jarvis 运行时安装引擎 + 生命周期编排器
       └─ systemd-nspawn --machine=htch-runtime
            │
容器平面（cell，我们所在的可见世界）
  ├─ PID 1   systemd
  ├─ PID 67  hatch daemon --runtime-cell-leader=2047   ← 智能体主进程（16 线程）
  ├─ PID 738 hatch-execd --runtime-cell-leader=2047    ← 工具执行器
  ├─ PID 1982 sshd（用户自己装的）
  └─ PID 2024 ssh -R 2222:localhost:22 → 反向上线到 203.0.113.195
```

两个 hatch 进程的 **`PPid` 都是 0** —— 它们从宿主侧被"嫁接"进来，不走容器内 systemd。
`/proc/67/environ` 与 `exe`/`cwd` 均**拒绝读取**，Seccomp 挂着 4 个过滤器，
CapEff `000001fffff7ffff`（几乎全能力但剔除若干）。这是刻意的强隔离。

### 启动链（宿主侧脚本，只读挂载）

```
control-daemon.sh（宿主根身份）
  → 等待 /run/hatch/runtime-cell/runtime-cell.ready
  → nsenter 进入 runtime-cell 用户命名空间
    → run-daemon.sh
      → 载入 guest-runtime-env.sh（环境变量）
      → setpriv --bounding-set=-sys_ptrace ...   ← 剥离 PTRACE 能力
        → exec /opt/hatch/bin/hatch daemon
```

**关键设计**：入口显式 `--bounding-set=-sys_ptrace`，让 daemon 及其工具子进程
**无法 attach 或读取同容器内其他进程**。这是防横向窥探。

---

## 2. 二进制家族（`/opt/hatch/bin/`，复核实测 **78** 个）

| 二进制 | 角色 |
|---|---|
| `hatch` | **主 daemon**，stripped ELF（撰写时 361 MB / 复核 339,199,312 B = 323.5 MB），承载全部工具总线 |
| `hatch-execd` | 工具执行器，经 `/run/hatch/execd/execd.sock`（mode 0600）通信 |
| `spawnd` | **宿主侧管家**：安装、渲染 systemd 单元、派生 privsep worker、挂 eBPF |
| `hatch-multicall` | 多合一单体，通过**符号链接名**分发（34 个硬链接） |
| `hatch-doctor` / `hatch-healthd` / `hatch-rescue` | 诊断与救援 |
| `hatch-ws-client` | WebSocket 客户端（连回控制面） |
| `hatch-vault` | 密钥保管 |
| 其余 | **连接器 CLI**（每个都是一个独立进程，见 §5）；`/opt/hatch/bin/` 复核共 **78** 个条目 |

`hatch-multicall` 的报错暴露了机制：

> `unknown tool identity "hatch-multicall". Invoke via one of the installed name-symlinks (e.g. /opt/hatch/bin/media-generation)`

即：**一个二进制，靠 argv[0] 自我识别身份**。

---

## 3. 网络安全模型（这是最精巧的部分）

### 3.1 容器网络

```
lo       127.0.0.1/8
host0    198.19.0.2/30  ← veth 对，网关 198.19.0.1
default via 198.19.0.1
```

`/etc/hosts` 里有一条**刻意的映射**：

```
198.19.0.1          hatch-egress-proxy
fd8b:4f84:7d32:99::1 hatch-egress-proxy
```

### 3.2 出网被三重管控

| 层 | 机制 |
|---|---|
| **DNS 劫持** | `resolv.conf` 只指向网关。实测 `api.meta.ai` → `198.18.139.165`（**假地址**，非真实 IP） |
| **代理强制** | `HTTP(S)_PROXY=http://hatch-egress-proxy:3128`，写进 `/etc/environment.d`、`/etc/profile.d`、apt 配置三处 |
| **eBPF 门闸** | `spawnd attach-cell-gate` 在 runtime-cell 的 cgroup 上挂 **connect4/connect6 eBPF**，默认**拒绝所有直连**（fail-closed） |
| **veth 过滤** | `spawnd attach-veth-filter` 在宿主侧丢弃容器发往宿主本地地址的帧 |

### 3.3 TLS 中间人

`/run/hatch/egress-tls/ca-bundle.pem`（183 KB）被注入为全环境信任根：

```
SSL_CERT_FILE / REQUESTS_CA_BUNDLE / CURL_CA_BUNDLE / AWS_CA_BUNDLE
NODE_EXTRA_CA_CERTS / GIT_SSL_CAINFO   →  全部指向它
```

**这意味着出网 TLS 可被代理侧解密检查**。另有 `hatch-egress-ca.pem` 与
`hatch-ingress-ca.pem` 由宿主通过 `/run/hatch/cell-anchors` 发布，
`hatch-ca-trust.path` 监听该目录实现**证书轮换自动更新**。

> 补充：Windows/Node 有专门处理 —— `NODE_USE_ENV_PROXY=1` 是必需的，
> 因为 Node 内建 fetch(undici) 默认忽略代理环境变量，否则会直连并撞上"故意做死的 DNS"。

---

## 4. 数据层

- **PostgreSQL 在容器外。** 容器内不存在 `/var/lib/postgresql`，只有一个就绪标记
  `/home/hatch/.postgres-ready`（内容 `ready`）。
- 访问经由 `/run/hatch/noded/` 三个 socket：`control.sock`、`ephemeral.sock`、`http-api.sock`。
- 模型侧通过 **`muse.db` 技能**查询，**只读单条 SELECT**，且：
  - 不能改数据、不能看系统目录、不能读凭证
  - 有行/字节/时间上限
  - **模型的私有推理（thinking / redacted-thinking）永不可读**，只提供脱敏投影

---

## 5. privsep 隔离工作进程（86 个）

`/run/hatch/privsep/*.sock` 下有 **86 个 socket**，每个对应一个隔离 worker：

```
web-search  zoom  zapier  withings  vercel  tts  ticketmaster
threads-cli  tessie-api  tailscale  stripe-link  spotify-api  slack
shopify  shopping  share  save-to-spotify  replit  remote-storage
printify  polymarket-api  plaid  zoom ... （共 86 个）
```

每个 worker 是一个**独立的 `hatch-w-<tool>` 系统账号**（`spawnd ensure-worker-accounts`
创建），拥有 **idmapped 状态目录视图**（`/run/hatch/worker-state/<tool>`）——
磁盘上归属旧身份，worker 进程内看到的是自己的身份。

**意义**：连接器凭证不落在智能体容器里，由宿主侧隔离进程持有。
智能体只能通过 socket 请求动作，拿不到原始密钥。

---

## 6. 身份与配置

`/etc/hatch/env`（root 0600，容器内不可伪造）：

| 变量 | 值 / 用途 |
|---|---|
| `JARVIS_HATCHLING_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `JARVIS_FQDN` | `instance-xxxxxxxx.metaaivm.com` |
| `JARVIS_CD_CHANNEL` | `alpha` —— **决定哪些技能/二进制被"揭示"** |
| `JARVIS_TIER` | `prod` |
| `JARVIS_VM_COMPUTE_REGION` / `DATA_REGION` | `zaz` |
| `JARVIS_INFERENCE_HOSTNAME` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

内部 socket 一览：

```
JARVIS_AUTHD_SOCK            /run/hatch/auth/authd.sock          认证
JARVIS_INFERENCE_PROXY_SOCK  /run/hatch/proxy/inference.sock     模型推理
JARVIS_STEFI_PROXY_SOCK      /run/hatch/proxy/stefi.sock         ？（未查明）
JARVIS_SANDBOX_API_SOCK      /run/hatch/sandbox-api/api.sock     沙箱
JARVIS_SENTINEL_HTTP_API_SOCKET /run/hatch/sentinel/http-api.sock Sentinel 审批
JARVIS_TELEMETRY_PROXY_SOCK  /run/hatch/telemetry/telemetry.sock 遥测
```

还埋着一个**活的 killswitch**（注释写得很直白）：

> `JARVIS_ANTHROPIC_BASE_URL_REVPROXY_OVERRIDE=0` —— 若移除，Anthropic 请求会
> 切到 Meta 内部明文 HTTP 反代，且 spawnd 会把真实 `ANTHROPIC_API_KEY` 换成占位符。

---

## 7. 分层技能/二进制"揭示"机制（alpha 通道专属）

launch-daemon.sh 里最长的两段逻辑，实现**按通道裁剪能力面**：

```
基础技能     /opt/hatch/runtime-cell-exposed/skills   （只读下层）
受限技能源   /opt/hatch/skills-scoped                 （宿主独有，不挂进容器）
           ↓ 依据 skill-scopes.conf + JARVIS_CD_CHANNEL
overlay 合并 → /opt/hatch/skills                       （base + 该通道揭示的）
```

二进制同理（`bin-scopes.conf` → `/opt/hatch/bin`）。

**两条硬性原则**：

1. **fail-closed** —— 任何一次拷贝/挂载失败，就放弃揭示，只用基础集启动；
2. **fail-open-boot** —— 但**不能让容器起不来**。所以所有变更操作都加了 `|| return 1`，
   失败只降级不中止，避免 `Restart=always` 导致无智能体的崩溃循环。

---

## 8. 为什么重启会丢 `/etc`、`/root`、`/tmp`、`/var`

挂载表给出了精确答案：

| 挂载点 | 类型 | 来源 | 持久？ |
|---|---|---|---|
| `/` | **overlayfs** | lower=`/sysroot`，**upper=`/run/hatch/overlay/upper`** | ❌ |
| `/home/hatch` | **btrfs** | `/dev/mapper/rv`（100 G，zstd:3） | ✅ |
| `/var/lib/hatch/os-intent` | btrfs | `/dev/mapper/rv` | ✅ |
| `/var/lib/hatch/catalog_search_media` | btrfs | `/dev/mapper/rv`（**只读**） | ✅ |
| `/opt/hatch` | squashfs | `/dev/mapper/opt_hatch`（**只读**） | ❌（镜像） |
| `/etc/hosts`、`/etc/resolv.conf` | squashfs | 同上，单文件绑定 | ❌（镜像） |
| `/run` | tmpfs | 1.6 G 内存 | ❌ |

**关键在于 overlayfs 的 `upperdir` 落在 `/run`——而 `/run` 是 tmpfs（内存）。**
所以对 `/etc`、`/root`、`/tmp`、`/var` 的一切修改**只写在内存里**，重启（甚至容器重建）即全部蒸发。

只有 `/home/hatch` 和 `/var/lib/hatch/*` 挂在真正的块设备 `/dev/mapper/rv` 上，跨重启存活。

这精确解释了 `MEMORY.md` 里的教训，也解释了为什么 `system-worker/setup.sh`
必须存在——用户自建的东西不在镜像层，每次重启都得重建。


---

## 9. 其他观察

- **遥测**：`/run/hatch/telemetry/` 下有 `scuba`、`bugreport.sock`、`telemetry.sock`。
- **恢复机制**：`/run/hatch/resume/` 有 `handoff-marker`、`hotset.manifest`（分级热集）、
  `pg-clean.proof`、`rv-identity-ready` —— 说明有**跨重启状态交接与热恢复**设计。
- **`hatch-execd` 由 socket 激活**（`WantedBy=sockets.target`），`SocketMode=0600`，`RemoveOnStop=true`。
- **`spawnd` 有 `fsop` 子命令**：基于 `openat2 RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS`
  的 fd 安全文件操作，"never a raw path the cell can re-point" —— 防符号链接逃逸。
- **`spawnd scrub-env-override`**：向容器暴露 `/etc/hatch/env.override` 时按
  `runtime_env_key_forbidden` 谓词**擦除密钥形态的赋值**（含 PEM 块与续行）。

---

## 10. 通道裁剪：本实例是"最小能力面"配置

`/etc/hatch/env` 里 `JARVIS_CD_CHANNEL="alpha"`，而 `skill-scopes.conf` 的通道行是：

| 通道 | 揭示的受限技能 |
|---|---|
| `prod` / `canary` / `quail` | box, canva, dropbox, klaviyo, meta-ads, quickbooks, shopify, square, whatsapp |
| `hatch-pro` | prod 集 + social-competitor-analysis, social-content-performance |
| `hatch-e2e` / `hatch-evals` | 少量（health, meta-ads, nutrition, social-*） |
| `internal-test` | **25 个（最全）**：arlo, asana, linear, lovable, replit, ring, slack, vercel, zapier, zoom… |
| **`alpha`** | **无此行 → fail-closed → 什么都不揭示** |

实测验证：**68 个技能全部来自 base 集**，18 个候选受限技能（canva/dropbox/klaviyo/
meta-ads/quickbooks/shopify/square/whatsapp/linear/slack/zoom/replit/vercel/zapier/
asana/box/evernote）**一个都没有**；`bin-scopes.conf` 同样无 alpha 行，
受限 CLI 二进制也全部缺席。

**结论：这台实例被刻意裁到最精简状态——比 `prod` 通道还少。**

---

## 11. 安全发现：可见性门 ≠ 能力边界

配置注释自己承认了这一点（`bin-scopes.conf` 原文）：

> This carve is cell-side only... **Hiding the cell binary is visibility gating,
> not a capability boundary.**

实测证实：

| 层 | 状态 |
|---|---|
| **二进制可见性** | 7 个受限 CLI（canva/box-cli/meta-ads-cli/shopify/square/slack/zoom）**全部被裁** |
| **privsep socket** | 对应 7 个 socket **全部存在且可连接**（`srw-rw---- nobody:root`，root 可连） |

**但协议层挡住了**：向 socket 发送空 JSON 得到 `b''`（立即关闭），
发送 MCP `initialize` 或纯文本行得到 `ConnectionResetError`。
说明 worker 有**自己的握手/鉴权协议**，不是裸 JSON。

更重要的是——**worker 进程和 `hatch-w-*` 账号在容器内完全不可见**：

```
ps aux | grep hatch-w-     →  空
getent passwd | grep hatch-w-  →  空
```

它们在**宿主命名空间**运行。这才是真正的能力边界：
智能体连不到 worker 进程，只能通过有握手鉴权的 socket 请求动作。

**风险评估**：裁剪是**减少认知面而非减少权限面**。
一个知道 socket 路径的智能体仍可尝试连接；实际能做什么取决于 worker 侧鉴权。
这个设计是**有意的**（注释明说二进制隐藏只是 "visibility gating"），
不是配置疏漏。

---

## 12. 未解明项

| 问题 | 状态 |
|---|---|
| `sentinel` 审批系统 | `/etc/hatch/env` 声明了三个 socket（`daemon-egress-approvals`、`egress-approvals-admin`、`http-api`），但 **`/run/hatch/sentinel/` 在容器内不存在** —— 挂在宿主侧或按需创建 |
| `JARVIS_STEFI_PROXY_SOCK` | 路径 `/run/hatch/proxy/stefi.sock`，但 **`/run/hatch/proxy/` 目录容器内不存在**；"stefi" 含义未查明 |
| `JARVIS_INFERENCE_PROXY_SOCK` | 同上，推理代理 socket 容器内不可见 |
| PostgreSQL 实例 | 容器外，容器内只有 `/home/hatch/.postgres-ready` 标记 |
| 宿主平面 `/hatch/data/` | 容器内不可访问 |
| 出网白名单具体内容 | 代理侧配置，容器内不可见 |
| `sandbox/space-*.sock` 四件套 | media / privileged / web-search / inference，语义未展开 |
| `/var/lib/hatch/os-intent` | 可写持久卷，"os-intent ledger"（安装意图账本），用途未展开 |

---

## 13. 容器技术事实

- **机器 ID**：`2d52e55a707440a3ae9a57c80cf1eba5`
- **命名空间**：完整隔离（pid / mnt / net / ipc / uts / user / cgroup 各自独立）
- **根文件系统**：overlayfs，lower=`/sysroot`（squashfs 镜像），upper=tmpfs
- **持久卷**：`/dev/mapper/rv`（btrfs，100 G，`compress-force=zstd:3`，`ssd`，`discard=async`）
- **镜像卷**：`/dev/mapper/opt_hatch`（squashfs，只读，承载 `/opt/hatch` 与静态 `/etc` 文件）
- `/opt/hatch` 挂载选项含 `errors=continue,threads=single`

---

*报告基于容器内可见证据（配置文件、socket、二进制字符串、挂载表、实测网络与 IPC 行为）。
宿主平面内容为从脚本注释与 `spawnd --help` 推断，未直接观测。*


