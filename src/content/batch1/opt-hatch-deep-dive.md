# /opt/hatch 深度勘察与核心运行时架构

> [← 返回架构目录](/content/batch1/tools-readme) · [返回文档索引](/content/batch1/tools-readme) · [一页速览](/content/batch1/overview)

本文档承接前期对 Muse VM 运行时的基础勘察，针对 `/opt/hatch`、`/opt/hatch-image`、`/opt/meta-chromium` 及其宿主编排套件展开深度逆向剖析。内容涵盖运行时文件系统分层、CD-Channel OverlayFS 动态揭示引擎、多层纵深网络与特权安全隔离、78 个二进制程序的分类学及专属工具逆向分析、辅助运行时集群（Codex Agent、RTC Sidecar、Meta Chromium 152）以及 65 个 Rust Crate 与环境变量全景映射。

---

## 1. /opt 与 /opt/hatch 运行时全景解剖

Meta Muse 虚拟机的核心软件基础设施并非分散存放于操作系统的默认系统目录中，而是高度集中于 `/opt` 目录下的三个核心分支：只读运行时根 `/opt/hatch`、镜像基底与声明式配置库 `/opt/hatch-image`、以及专有定制浏览器套件 `/opt/meta-chromium`。

```
/opt/
├── hatch/                                  # 运行时核心目录（容器内部通过只读挂载呈现）
│   ├── assets/                             # 预置静态资产与安全模型库
│   │   ├── ideas/                          # 内置商业 Idea 库与矢量图标
│   │   │   ├── new-user/catalog.json       # 43 个商业 Idea 原始未压缩全量配置
│   │   │   ├── icons/                      # 948 个现代 3D 渲染 .webp 矢量图标
│   │   │   └── icons-legacy/               # 76 个遗留 PNG 格式图标
│   │   └── blocklist/                      # MASE 网络安全搜索引擎屏蔽数据库
│   │       ├── manifest.json               # 资产清单与版本指纹（genai_web_search）
│   │       ├── mase_all_urls_fingerprints.bin # 7,497,435 条 URL 二进制指纹（60 MB）
│   │       ├── mase_all_domains.fst        # 屏蔽域名有限状态自动机（13.6 MB FST）
│   │       ├── mase_reduced_domains.fst    # 紧缩域名自动机（13.3 MB）
│   │       ├── mase_contract_domains.fst   # 核心收缩域名表（3.3 KB）
│   │       └── mase_blocklist_regex.json   # 知名人物与敏感正则规则库
│   ├── bin/                                # 运行时可执行文件集（共 78 个条目）
│   │   ├── hatch-multicall                 # 多调用 Rust 二进制文件（29.1 MB，17 个硬链接）
│   │   ├── hatch                           # 智能体主调度与执行守护进程（339 MB）
│   │   └── [60 个独立二进制程序]           # 涵盖穿戴交互、支付、社交检索、机密计算等
│   ├── runtime-cell/                       # 宿主编排、生命周期与命名空间入关脚本集（19 个脚本）
│   └── skills/                             # 基础智能体技能库（含 SKILL.md、tools 等）
├── hatch-image/                            # 镜像基础设施与声明式系统定义
│   └── bin/
│       ├── codex                           # Codex CLI 编码智能体（258.3 MB，v0.149.0）
│       ├── rtc-sidecar                     # WebRTC 媒体路由侧车服务（34.2 MB，fbcode 编译）
│       ├── bun                             # Bun JavaScript/TypeScript 运行时（79.5 MB，v1.4.2）
│       ├── hatch-manifest                  # 声明式系统状态对齐程序（3.4 MB）
│       └── runtime-cell.kdl                # 系统级 KDL 格式声明式清单（包管理、安全补丁）
└── meta-chromium/                          # 专有自动化无头浏览器套件
    ├── chrome                              # Meta 定制 Chromium 152（527.8 MB，v152.0.7977.82）
    ├── chrome_crashpad_handler             # 崩溃转储捕获进程
    └── libvk_swiftshader.so                # SwiftShader 纯 CPU 软件 Vulkan/WebGL 光栅化引擎
```

### 1.1 资产库与 Flock 项目原初指纹

位于 `/opt/hatch/assets/ideas/new-user/catalog.json` 的文件是整个系统商业 Idea 的原始出厂镜像。该文件未经运行时二次过滤或动态脱敏，包含全部 43 个商业 Ideas 的完整数据结构。该文件的元数据字段明确标明作者为 `"flock-community"`，验证了 Muse 项目在内部孵化时期的核心代号即为 "Flock"。

在视觉呈现层面，`/opt/hatch/assets/ideas/icons/` 存放了 948 个现代 `.webp` 格式的 3D 渲染立体图标，每一个图标在命名上与内置 Idea 库中的类别标签和特征向量保持精准对齐。这批图标与其 384 维向量空间索引共同构成了智能体向前端可穿戴设备推送卡片时的多模态资产基底。

### 1.2 MASE 恶意网络与域名防御库

位于 `/opt/hatch/assets/blocklist/` 的数据集是 Meta AI Security Engine（MASE）的重要防御屏障。该目录包含由 `genai_web_search` 数据集生成的网络黑名单。核心数据文件 `mase_all_urls_fingerprints.bin` 尺寸达 60 MB，内部编码了 7,497,435 个已判定为恶意、钓鱼或违反安全政策的 URL 指纹。

为了在网络请求关键路径上实现零毫秒级匹配，系统采用了有限状态转换器（Finite State Transducer, FST）数据结构。`mase_all_domains.fst`（13.6 MB）将海量被禁域名压缩为内存紧凑的图自动机，使得主进程在发起外部爬取或检索时，无需进行昂贵的网络往返或大型散列表查找，即可直接在内存中完成常数级复杂度的快速阻断。

---

## 2. CD-Channel OverlayFS 动态作用域揭示引擎

Muse 虚拟机具备独特的多渠道功能门控机制。系统在编译与打包镜像时，会将所有进阶、实验性或企业级专用工具和技能剔除出容器的基础视角，统一放置于宿主独占目录中。容器启动时，宿主会根据分配给该 VM 的持续交付渠道（CD Channel），通过动态挂载技术将特定功能“投影”进容器内部。

### 2.1 门控目录分层与不可见性原则

在宿主文件系统层面，受限资源被物理分割存放：
- 宿主独占受限二进制目录：`/opt/hatch/bin-scoped/`
- 宿主独占受限技能源码目录：`/opt/hatch/skills-scoped/`
- 容器只读挂载暴露基准源：`/opt/hatch/runtime-cell-exposed/`

在没有激活特定渠道时，容器看到的 `/opt/hatch/bin` 与 `/opt/hatch/skills` 仅为 `runtime-cell-exposed` 下的基础只读拷贝。由于宿主上的 `*-scoped/` 目录从未被加入容器命名空间的挂载点表，容器内部即便是拥有根权限的进程，在物理上也完全无法探测到未授权工具的存在。

```
宿主独占源 (Host-Only Sources)
  ├── /opt/hatch/skills-scoped/<skill> ──┐ (按 channel 筛选复制)
  └── /opt/hatch/bin-scoped/<binary>   ──┼────────────────┐
                                         ▼                ▼
上层写时复制缓存 (tmpfs Upper)        skills-scoped-upper  bin-scoped-upper
                                         │                │
基础只读层 (Lowerdir)                skills-base-lower   bin-base-lower
                                         │ (bind mount)   │ (bind mount)
                                         ▼                ▼
OverlayFS 合并挂载点                 /opt/hatch/runtime-cell-exposed/{skills, bin}
                                         │ (单向只读递归绑定)
                                         ▼
容器内部最终呈现                     /opt/hatch/{skills, bin} (基础项 + 动态揭示项)
```

### 2.2 启动时 OverlayFS 挂载流水线

宿主服务 `launch-daemon.sh` 在拉起 `systemd-nspawn` 之前以 root 特权执行。该脚本解析配置并实施挂载的核心工程步骤如下：

1. **环境与配置解析**：从宿主特权环境文件 `/etc/hatch/env` 中提取由基础平台注入的 `JARVIS_CD_CHANNEL` 环境变量。
2. **多渠道规则累加**：依次读取 `/opt/hatch/runtime-cell/skill-scopes.conf` 与 `bin-scopes.conf`。若同一渠道存在多行配置，脚本会进行全量集合求并（Union），提取当前渠道应当解锁的技能目录名与二进制可执行文件名。
3. **安全隔离构建**：在 `/run/hatch/` 内存文件系统（tmpfs）中创建专属的 `upper` 与 `work` 工作目录（如 `/run/hatch/skills-scoped-upper` 和 `/run/hatch/skills-scoped-work`）。
4. **选择性搬运**：仅将匹配到的受限目录或二进制文件复制至 `upper` 临时目录中，并严格校验文件权限为 `0755`。
5. **底层绑定与叠加挂载**：将基础暴露目录（如 `/opt/hatch/runtime-cell-exposed/skills`）绑定挂载为只读 `base_lower`，随后执行内核调用：
   ```bash
   mount -t overlay overlay \
     -o "lowerdir=$base_lower,upperdir=$scoped_upper,workdir=$scoped_work" \
     "$base_skills_dir"
   ```
6. **故障闭锁机制（Fail-Closed Contract）**：若在配置解析、临时空间分配或文件复制过程中发生任何非零退出，或当前 VM 的 `JARVIS_CD_CHANNEL` 未在规则表中定义，脚本会立即执行清理流程，卸载并删除所有临时挂载，确保容器无缝退回到未经任何扩展的基础镜像启动，杜绝因异常导致的配置泄露或智能体崩溃循环。

### 2.3 渠道与资源门控对照矩阵

通过解析 `bin-scopes.conf` 与 `skill-scopes.conf`，系统预设的交付渠道及其激活的受限资产对比如下表所示：

| 交付渠道 (Channel) | 揭示二进制 (Binaries) | 揭示技能 (Skills) | 面向场景 |
|---|---|---|---|
| `prod` / `canary` / `quail` | `meta-ads-cli`, `asana`, `box-cli`, `canva`, `dropbox`, `evernote`, `hatch_wai_cli`, `klaviyo`, `linear`, `lovable`, `quickbooks`, `replit`, `shopify`, `square`, `vercel`, `zapier` | `asana`, `box`, `canva`, `dropbox`, `evernote`, `klaviyo`, `linear`, `lovable`, `meta-ads`, `pickup-briefing`, `quickbooks`, `replit`, `shopify`, `social-competitor-analysis`, `social-content-performance`, `square`, `vercel`, `whatsapp`, `zapier` | 生产全量发布、金丝雀演进与员工全员通道 |
| `internal-test` | 上述全部，外加：`arlo`, `audio-notes-read`, `facebook-cli-internal`, `instacart`, `navigation`, `polymarket-api`, `ring-cli`, `slack`, `zoom` | 上述全部，外加：`arlo`, `audio_notes_read`, `documents`, `health`, `instacart`, `nutrition`, `polymarket`, `price-tracker`, `ring`, `slack`, `zoom` | 内部最全特性测试，包含家庭安防与敏感金融预测接口 |
| `hatch-pro-internal` | `meta-ads-cli`, `asana`, `box-cli`, `canva`, `dropbox`, `evernote`, `facebook-cli-internal`, `klaviyo`, `linear`, `lovable`, `quickbooks`, `replit`, `slack`, `vercel`, `zapier`, `zoom` | 同左侧集成技能，含内部 FB 调试工具 | 企业版内部测试通道 |
| `hatch-pro` | `meta-ads-cli`, `box-cli`, `canva`, `dropbox`, `klaviyo`, `quickbooks` | `box`, `canva`, `dropbox`, `klaviyo`, `meta-ads`, `quickbooks`, `social-competitor-analysis`, `social-content-performance` | 企业版生产渠道，专注办公与社媒营销 |
| `hatch-evals` / `hatch-e2e` | `meta-ads-cli`, `facebook-cli-internal` | `health`, `meta-ads`, `nutrition`, `social-competitor-analysis`, `social-content-performance` | 自动化评估与端到端系统回归测试 |
| `shoppify-test` | `shopify` | `shopify` | 电商专属集成测试分支 |
| `external-connectors-test` | `box-cli`, `canva`, `dropbox`, `klaviyo`, `quickbooks` | `box`, `canva`, `dropbox`, `klaviyo`, `quickbooks` | 第三方 SaaS 连接器单元集成验证 |

当前勘测的现场虚拟机中，`/etc/hatch/env` 明确标注 `JARVIS_CD_CHANNEL="alpha"`。由于 `alpha` 渠道未包含在门控配置清单的显式列表内，触发了默认的 Fail-Closed 机制，因此当前容器内部呈现的完全是未经叠加的基础组件集。

---

## 3. 多层纵深网络与特权安全防御体系

Muse 运行时采用多层纵深防御体系。从底层虚拟以太网接口、内核态流量分类器、cgroup eBPF 程序，直至应用层代理和加密证书管理，每一层均贯彻最小特权与不可变安全原则。

```
[ 容器环境 (htch-runtime, PID 1 空间, uid=131072) ]
  • 应用出网请求 (curl / Python / Node fetch / Git)
  • /etc/resolv.conf 仅指向 198.19.0.1 (静态死 DNS，不解析公网)
  • 环境变量强制锁定 HTTP_PROXY=http://hatch-egress-proxy:3128
               │
               ▼ (veth interface: host0 -> ve-htch-runtime)
[ 宿主内核与安全门闸 (Host Kernel & Network Layer) ]
  ├── 1. cgroup eBPF Hook: spawnd attach-cell-gate (BPF_F_ALLOW_MULTI 拦截 connect())
  ├── 2. Linux Traffic Control (tc): spawnd attach-veth-filter (宿主 veth 侧 ingress 分类器)
  └── 3. 内核模块锁定: modules_disabled=1 (一经启动不可加载任何新模块)
               │
               ▼ (转发至 127.0.0.1:3128)
[ 宿主安全代理与审计 (Sentinel Egress Proxy & MASE) ]
  ├── 4. Sentinel TLS MITM 校验 (持有 hatch-egress-ca.pem 私钥，动态签发)
  ├── 5. MASE 安全库比对 (750 万 URL 指纹 + 13.6 MB FST 自动机)
  └── 6. 外网安全出口 (通过认证后出网)
```

### 3.1 虚拟网络拓扑与双重内核门闸

容器通过一对虚拟以太网设备（veth pair）与宿主建立通信，接口命名为 `ve-htch-runtime`（宿主端）与 `host0`（容器端）。分配的网络地址为专用保留测试网段：
- 宿主端网关地址：`198.19.0.1/30`，IPv6 为 `fd8b:4f84:7d32:99::1/64`
- 容器端接口地址：`198.19.0.2/30`，IPv6 为 `fd8b:4f84:7d32:99::2/64`

系统通过两个完全独立的内核机制对网络出网流量实施双重拦截：

1. **cgroup 级 eBPF 强制门闸**：在 `pre-start.sh` 执行阶段，宿主调用 `/opt/hatch/bin/spawnd attach-cell-gate`，将 eBPF 程序挂载在容器所在的 cgroup 根节点。该程序使用 `BPF_F_ALLOW_MULTI` 标志与系统现有网络策略组合，强制拦截容器内任何进程发起的 `connect()` 系统调用。任何试图向非网关地址或未授权网段发起的直连尝试均会被内核直接丢弃。
2. **Traffic Control（tc）Ingress 分类器**：在 `post-start.sh` 执行阶段，宿主调用 `/opt/hatch/bin/spawnd attach-veth-filter`，在宿主侧的 `ve-htch-runtime` 网络设备上挂载 tc ingress 过滤器。该层设计的核心目的在于防范逃逸：即便容器内部恶意获得了根权限，通过绕过 cgroup 限制（例如创建原始套接字或构造嵌套网络命名空间），其流量到达宿主侧 veth 时依然会被 tc 分类器捕获并丢弃。

### 3.2 故意失效的内部 DNS 与强制透明代理

在 `/opt/hatch/runtime-cell/etc/resolv.conf` 中，配置仅指向网关 `198.19.0.1`。该网关上的 DNS 服务特意配置为不对公网域名进行实际解析（Deliberately dead DNS）。

容器内运行的所有工具和脚本必须无条件依赖代理出网。在 `guest.env` 中，系统导出了全套代理变量：
```bash
HTTP_PROXY=http://hatch-egress-proxy:3128
HTTPS_PROXY=http://hatch-egress-proxy:3128
ALL_PROXY=http://hatch-egress-proxy:3128
```
由于现代 Node.js 内置的 `fetch`（基于 `undici`）默认会忽略操作系统的 `HTTP_PROXY` 环境变量并直接发起 DNS 解析，系统特别配置了 `NODE_USE_ENV_PROXY=1`。如果不开启该项，Node 进程会直接因 DNS 解析超时而失败。

### 3.3 根证书注入与只读 NSS 数据库防提权

为配合宿主上的 Sentinel Egress Proxy 执行 TLS MITM 流量检测与合规审计，容器内必须安装对应的自签名根证书。然而，证书存储的设计遵循了极高的攻击面控制原则：

1. **PEM 证书分工**：宿主仅将生成的根证书分发至 `/run/hatch/egress-tls/ca-bundle.pem`，容器内的 `SSL_CERT_FILE`、`REQUESTS_CA_BUNDLE`、`CURL_CA_BUNDLE`、`NODE_EXTRA_CA_CERTS`、`GIT_SSL_CAINFO` 等所有主流运行时证书路径全部强制统一映射至该文件。
2. **NSS 数据库只读挂载**：许多基于 Chromium、Firefox 或特定网络库的工具使用 NSS 数据库存储凭证。在 `build-cell-trust-store.sh` 中明确揭示了一项重大安全决策：
   > NSS 数据库在打开时，会自动根据其内部 `pkcs11.txt` 文件中声明的模块名称执行 `dlopen()`。若允许容器对 NSS 数据库拥有写权限，容器内进程只需向 `pkcs11.txt` 写入恶意共享库路径，即可在任何具有更高权限的上下文读取该数据库时实现任意代码执行。

   因此，宿主在外部构建好两套只读的 NSS 数据库：`/run/hatch/cell-nssdb`（挂载至 `/etc/pki/nssdb`）与 `/run/hatch/cell-user-nssdb`（挂载至 `/home/hatch/.pki/nssdb`），以物理只读方式注入容器，彻底封堵了基于 PKCS#11 的动态库注入向量。

### 3.4 内核攻击面收敛与模块锁定

在虚拟机引导的极早期阶段，`/opt/hatch/runtime-cell/require-modules.sh` 会主动执行黑名单屏蔽：
- 彻底封死 `AF_ALG` 用户态密码学套接字接口（包括 `algif_aead`、`algif_hash`、`algif_skcipher`、`algif_rng`、`af_alg`），杜绝因历史内核漏洞（如 CVE-2023-21400 copy.fail）引发的特权提权。
- 禁用无用的网络协议族模块：`esp4`、`esp6`、`rxrpc`。
- 在预先加载好容器所需的 `veth`、`btrfs` 以及浏览器沙箱所需的 `nftables` 模块后，`post-start.sh` 会在完成网络握手的第一时间执行：
  ```bash
  echo 1 > /proc/sys/kernel/modules_disabled
  ```
  该操作为内核级单向熔断（One-way lock），执行后直至物理虚拟机重启，任何进程（包括宿主 root）均无法再加载任何内核模块。

### 3.5 authd 的 cgroup 归属校验

容器内部的核心认证凭证守护进程 `authd` 通过 Unix 套接字 `/run/hatch/auth/authd.sock` 暴露 HTTP 服务。`authd` 不仅基于操作系统的 `SO_PEERCRED` 检查调用者的有效 uid，更强制实施 cgroup 拓扑校验。

在 `runtime-cell-entry.sh` 中定义的 `rce_join_cell_cgroup` 函数展示了这一机制：常规通过 SSH 或终端直接登录宿主系统的进程，其归属在宿主的会话 cgroup 中；当此类进程尝试直接访问 `authd.sock` 时，`authd` 会检查该进程在 `/sys/fs/cgroup/.../cgroup.procs` 中的登记情况，由于其不在容器的单元 cgroup 下，调用会被直接返回 HTTP 403 拒绝。宿主入关运维脚本必须显式将自身 PID 写入容器 cgroup 之后，方可被识别为合法工具调用方。

---

## 4. 完整 78-Binary 全景分类学与核心工具逆向

在 `/opt/hatch/bin` 目录下共部署有 78 个可执行文件。对其 Inode 结构与二进制特征的深度分析显示，该目录呈现出高度工程化的“多调用核心（Multicall）+ 专属特化工具”架构。

### 4.1 Inode 拓扑：Multicall 集群 vs 独立可执行程序

78 个二进制条目在底层仅对应 62 个独特的 Inode 节点：

1. **Multicall 集群（1 个 Inode，17 个硬链接）**：
   文件 `hatch-multicall` 大小为 29,155,904 字节（约 29.1 MB），采用 Rust 编写。为了节省磁盘空间并共享公共网络与序列化运行时，该二进制在编译时打包了 17 个常见工具的执行逻辑，通过检查启动时的 `argv[0]` 进行分支分发。这 17 个硬链接包括：
   - `authdc`（认证命令行客户端）
   - `browser-service`（浏览器服务代理）
   - `device-data`（设备遥测数据读取）
   - `edits`（代码与文本编辑引擎）
   - `feature-request`（用户特性反馈上报）
   - `geocode`（地理编码与逆地理编码）
   - `hatch-multicall`（集群本体）
   - `image-search`（图像搜索）
   - `media-generation`（多媒体生成调用）
   - `media-library`（媒体资产库检索）
   - `muse-mail`（Muse 原生邮件处理）
   - `privsep-test-fully-isolated`（特权隔离沙箱基线测试工具）
   - `share`（跨设备内容分享桥梁）
   - `shopping`（原生购物会话交互）
   - `subscription-status`（用户订阅状态校验）
   - `tts`（文本转语音管道接口）
   - `web-search`（MASE 驱动的安全网页检索）

2. **独立专用二进制（61 个独立可执行程序）**：
   除 Multicall 集群外，其余 61 个程序均为独立编译的二进制可执行文件，涵盖了从 339 MB 的主守护进程 `hatch` 到数百 KB 的辅助脚本。

### 4.2 61 个独立二进制功能矩阵

下表对 61 个独立二进制程序按业务领域进行了系统性归类：

| 领域分类 | 程序名称 | 尺寸 | 核心功能与协议特征 |
|---|---|---|---|
| **主运行时与编排** | `hatch` | 339 MB | 核心智能体调度器、技能加载总线、上下文管理器 |
| | `spawnd` | 17.9 MB | 宿主容器编排、cgroup 门闸配置、veth 过滤器绑定 |
| | `hatch-execd` | 8.7 MB | 容器内部命令隔离执行守护进程（监听 `/run/hatch/execd/execd.sock`） |
| | `hatch-healthd` | 8.2 MB | 容器内健康探针、看门狗守护进程 |
| | `ingress-rev-proxy` | 12.6 MB | 监听 `:4431`，负责处理外部 Noise_XX 加密协议的接入反向代理 |
| **可穿戴与生成式 UI** | `genui-display-render` | 18.2 MB | 基于组件的生成式 UI 渲染器，面向智能眼镜及移动端生成富卡片 |
| | `wearables-display` | 15.3 MB | 可穿戴设备事件处理 Stop-hook，无命令行参数，完全由标准输入驱动 |
| | `hatch-slide-style` | 10.3 MB | 演示文稿（幻灯片）风格主题与原型解析器 |
| **电商、支付与金融** | `shopify-ucp-cli` | 16.2 MB | Shopify 统一商业平台（UCP）CLI，支持购物车、订单与检出 |
| | `shop-wallet-cli` | 12.2 MB | 独立 Shop 钱包凭证处理（依赖 Node.js 与 libatomic） |
| | `hatch-shopping-present` | 10.5 MB | 将商品目录或 FB Marketplace 搜索结果格式化为 Muse 原生展示卡片 |
| | `stripe-link` | 11.8 MB | Stripe Link 快捷支付绑定与调用 |
| | `plaid` | 13.9 MB | Plaid 银行账户连接与资产认证 |
| **Meta 1P 社交生态** | `hatch-zeitgeist` | 14.0 MB | Meta 一方全域社交搜索引擎（Instagram / Threads / Facebook） |
| | `facebook-cli` | 14.0 MB | Facebook 个人资料、主页、群组及 Marketplace 交互 CLI |
| | `instagram-cli` | 26.0 MB | Instagram 发帖、快拍、媒体流检索 CLI |
| | `instagram-messages-cli` | 13.2 MB | Instagram Direct 消息收发集成 |
| | `threads-cli` | 13.7 MB | Threads 发帖、回复及信息流操作 |
| | `threads-messages-cli` | 13.3 MB | Threads 内部私信传输 |
| | `hatch_messenger_cli` | 13.4 MB | Facebook Messenger 聊天与多媒体传输 |
| | `meta-catalog-search` | 11.7 MB | Meta 官方商品目录数据库搜索接口 |
| **健康、生活与设备** | `health-cli` | 23.4 MB | 综合健康数据聚合引擎 |
| | `healthkit-cli` | 14.8 MB | Apple HealthKit 格式健康数据解析 |
| | `healthex` | 13.0 MB | 锻炼与运动生理学数据扩展处理 |
| | `nutrition-cli` | 370 KB | 膳食营养与热量数据轻量级查询工具 |
| | `peloton` | 14.1 MB | Peloton 骑行/健身设备数据同步 |
| | `withings` | 13.3 MB | Withings 智能体重秤与健康硬件接口 |
| | `philips-hue` | 11.1 MB | 飞利浦 Hue 智能照明本地网络控制 |
| | `tessie-api` | 13.0 MB | 特斯拉（Tesla）车辆状态监测与指令调用 |
| **协同办公与云连接** | `hatch_gws_cli` | 15.6 MB | 谷歌工作区（Google Workspace: Gmail / Drive / Docs）集成 |
| | `hatch_gws_auth` | 10.8 MB | 谷歌工作区 OAuth 授权流与 Token 刷新处理 |
| | `outlook-calendar` | 13.3 MB | 微软 Office 365 / Outlook 日历管理 |
| | `outlook-contacts` | 11.2 MB | Outlook 通讯录同步 |
| | `outlook-mail` | 13.5 MB | Outlook 邮件收发与草稿管理 |
| | `notion-cli` | 13.3 MB | Notion 页面与数据库读写接口 |
| | `calendly` | 13.1 MB | Calendly 会议预约流编排 |
| | `granola-cli` | 11.3 MB | Granola AI 会议记录与转录同步 |
| | `printify` | 13.1 MB | Printify 按需定制电商供应链接口 |
| | `tailscale` | 10.7 MB | Tailscale 虚拟私有网格接入与节点打洞 |
| **出行、本地生活与通讯** | `native-comms-cli` | 10.4 MB | 原生短信（SMS）、多媒体彩信（MMS）与 RCS 富媒体通讯接口 |
| | `expedia` | 13.0 MB | Expedia 机票与酒店比价及预订 |
| | `duffel` | 13.3 MB | Duffel 航空 API 机票检索与订座 |
| | `flightaware` | 13.6 MB | FlightAware 实时全球航班状态追踪 |
| | `opentable` | 14.1 MB | OpenTable 餐厅订位与空席查询 |
| | `ticketmaster` | 13.0 MB | Ticketmaster 演艺与体育赛事门票查询 |
| | `etsy-cli` | 11.9 MB | Etsy 手工艺品交易平台检索 |
| | `places` | 10.7 MB | 地理兴趣点（POI）检索服务 |
| | `local-search` | 10.6 MB | 本地商户与生活服务搜索 |
| | `spotify-api` | 12.3 MB | Spotify 播放列表与曲库操控接口 |
| | `save-to-spotify` | 11.1 MB | 快速将发现的音乐保存至用户 Spotify 收藏夹 |
| **安全底层、救援与网络** | `hatch-vault` | 11.8 MB | 机密计算可靠卷（RV）LUKS 卷槽密钥管理与加密凭证托管 |
| | `hatch-ws-client` | 13.8 MB | 基于 Noise_XX 加密协议的双向 WebSocket 语音及媒体传输客户端 |
| | `hatch-browser-lease-helper` | 7.5 MB | Stefi-proxy 租约转发器，用于协调无头浏览器沙箱资源 |
| | `browser-broker` | 18.3 MB | 浏览器实例调度器，管理 Chromium 实例池 |
| | `hatch-doctor` | 11.2 MB | 确定性运行时状态一致性诊断程序 |
| | `function-health` | 13.2 MB | 工具函数执行健康度检测程序 |
| | `hatch-connector-output` | 521 KB | 连接器标准输出捕获与格式化小工具 |
| | `remote-storage` | 13.4 MB | 远程云存储持久化同步客户端 |
| | `hatch-rescue` | 12.4 MB | 虚拟机系统救援核心环境 |
| | `hatch-rescuectl` | 8.0 MB | 宿主救援与维护控制 CLI |
| | `hatch-rescue-systemctl` | 2.3 MB | 隔离态 systemd 服务管理代理 |

---

### 4.3 核心专属工具深度逆向剖析

#### 4.3.1 生成式 UI 渲染器：`genui-display-render` 与 `wearables-display`

`genui-display-render` 是智能体向可穿戴硬件输出界面的核心渲染引擎。其设计哲学是“服务端推理生成组件片段，客户端轻量化直接上屏”：
- **布局目标（Surfaces）**：原生支持 `--surface coop`（智能眼镜微显示投屏或伴随模式）与 `--surface mobile`（手机大屏呈现模式）。
- **主题渲染（Theme）**：支持 `auto`、`dark`、`light`，自动匹配眼镜环境光照或手机系统外观。
- **管线机制**：可指定 `--print-raw-fragment` 仅输出模型直出的 GenUI 语法片段，或由渲染器转换为无状态 HTML 页面；指定 `--no-present` 可仅生成内容而阻止调用系统层的 `present_widget` 广播事件。

与之配套的 `wearables-display` 则是一个典型的生命周期终止钩子（Stop lifecycle hook）。逆向显示其不接受任何命令行参数，完全在智能体回合结束时通过标准输入（stdin）读取一个 `HookEvent` JSON 结构。由于特权工作进程（privsep worker）没有独立的标准输入通道，容器内的准备逻辑会在序列化阶段将事件包装注入请求体，经由 Unix 套接字透传至宿主进行合规审查与可穿戴卡片投送。

#### 4.3.2 统一电商中枢：`shopify-ucp-cli` 与 `hatch-shopping-present`

为了支撑 43 个商业 Idea 中大量的电商带货、代购与自动下单场景，系统构建了名为 UCP（Unified Commerce Platform）的统一接入层：
- `shopify-ucp-cli` 封装了可信凭证与交易状态机，提供 `cart`（组装、修改、取消购物车）、`checkout`（发起结算、锁定库存）、`order`（查询订单与物流追踪）三大子命令。
- `hatch-shopping-present`（源码位于 `skills/crates/hatch-shopping-present/`）充当**原生商品呈现网关（Presentation Gateway）**。针对 Facebook Marketplace 与 1P Catalog 中带有严格时效与鉴权签名的 CDN 图片，系统采用“数据遮蔽 + 带外文件投送”设计，禁止 LLM 直接触碰真实图片链接以避免截断与幻觉失效。该程序直接解析磁盘私有文件，通过 UDS 向 Sandbox API 发起 `POST /shopping-results`，注入规范化的 `ShoppingResults` 卡片（含商品名、品牌、价格、保留 `fbclid` 商业归因的 `url` 及签名图片 `image_url`）。详见专题研究 [`shopping-present-gateway-deep-dive.md` 🔒](/roadmap#batch3)。

#### 4.3.3 Meta 一方社交检索：`hatch-zeitgeist`

`hatch-zeitgeist` 是 Meta 为 Muse 智能体量身打造的第一方社交网络穿透检索工具，其能力远超公开 API：
- **跨平台融合**：支持 `--platform instagram,threads,facebook`，单次查询可同时聚合三个平台的动态。
- **细粒度语义过滤**：提供 `--username`（特定账号）、`--group-name`（Facebook 群组名检索）、`--content-type image,video`，更支持 `--relation-to-author friend,followee,follower,all`，允许智能体优先检索用户真实好友圈的内容。
- **名人加权（Key Celebrity）**：支持 `--key-celebrity` 参数。不同于简单的账号硬过滤，该参数会在排序算法中主动提升指定公众人物创作动态的权重得分。
- **两阶段检索工作流（Recommended Workflow）**：
  1. 第一阶段：使用搜索模式获取候选帖子 URL 列表；
  2. 第二阶段：针对目标帖子使用 `--post-url <url>` 获取富详情。若原始帖子含有配文（caption），系统强制优先使用真实配文，避免过度依赖多模态视觉理解模型的主观推测。

#### 4.3.4 机密计算与可靠卷管理：`hatch-vault`

`hatch-vault` 是保障机密虚拟机（Confidential VM, CVM）持久化数据安全的核心程序。它通过 `/run/hatch/vault/cvm.sock` 等套接字向系统提供加密服务：
- **LUKS 卷槽密钥架构**：在 `/dev/mapper/rv` 可靠卷上，系统严格维护两个密钥槽：
  - **Slot 2（CVM Key）**：运行时的真实解密密钥。采用极低开销的 PBKDF 参数（`--pbkdf-force-iterations 4 --pbkdf-memory 32`）以保证在机密环境中毫秒级挂载。
  - **Slot 3（Placeholder Key）**：出厂预置的占位符密钥。在执行正式 CVM Enroll 时，系统强制校验 Slot 3 的存在，并在安全写入 Slot 2 后调用 `luksKillSlot 3` 永久销毁占位密钥。
- **热迁移与加密包装**：支持在 CVM 迁移时使用 `Noise_N_25519_AESGCM_SHA256` 协议执行 `hatch.vault.migration.rv_key_wrap.v1` 密钥包装与证明交换，确保加密数据在宿主不可信环境下的零泄露流转。

#### 4.3.5 端到端双向语音流：`hatch-ws-client`

`hatch-ws-client` 是智能体与 Meta 云端语音推理集群实时连接的管道：
- **协议栈**：在标准 WebSocket 协议之上封装了 `Noise_XX_25519_AESGCM_SHA256` 握手。客户端与服务端通过 4 次握手报文（`noise msg1` 至 `msg4`）完成双向身份证明，随后进入对称加密传输模式。
- **流式音频传输**：底层以 PCM16 格式双向流式传输音频切片。上行支持 `input_audio_buffer.append`，下行支持毫秒级首包延迟监测（`first_output_audio_ttft_s`），直接与系统本地的 TTS 服务管道打通，为智能眼镜提供几乎零延迟的双向语音对话体验。

#### 4.4 `hatch*` 核心二进制矩阵与 100% Rust 技术栈确证

对 `/opt/hatch/bin/` 目录下全部以 `hatch` 命名的二进制程序（`hatch*` 系列）进行深度逆向与反编译分析，**确证其 100% 均基于 Rust 语言开发**。

##### 4.4.1 Rust 技术栈的实证判据

1. **统一工作区源码路径留存**：
   在所有 `hatch*` 二进制的符号表、断言宏与 `tracing` 日志元数据中，无一例外地完整保留了指向 Meta 内部单体代码库的源码路径：
   `hatch-engine/crates/<crate-name>/src/...`（如 `hatch-server`、`hatch-ws-client`、`hatch-execd` 等）以及 `cargo-registry/index.crates.io-...` 的三方依赖构建缓存路径。
2. **底层公共 Rust 基础设施复用**：
   所有二进制均静态内嵌了现代 Rust 云原生生态的标准组件：
   - **异步运行时与 I/O 驱动**：`tokio`（多线程调度与时间驱动）、`mio`、`futures`。
   - **序列化与数据契约**：`serde`、`serde_json`、`prost`（Protobuf 3 编解码）。
   - **网络与密码学传输**：`rustls`（内存安全 TLS 引擎）、`ring`（底层加密基语）、`tungstenite`（WebSocket 协议栈）、`hyper`（HTTP/1.1 与 HTTP/2 通信）。

##### 4.4.2 `hatch*` 专属二进制矩阵与职能映射

| 二进制名称 | 文件尺寸 | 对应 Rust Crate / 模块 | 架构职能与关键技术栈 |
|---|---|---|---|
| `hatch` | 339 MB | `hatch-engine/crates/hatch-server`, `hatch-agent` 等 65 个 Crate | 核心智能体调度器、技能加载总线、上下文管理器（Tokio + Postgres + Serde） |
| `hatch-multicall` | 29.1 MB | `hatch-engine/crates/hatch-tools`, `hatch-multicall` | 多路复用器，打包 17 个高频工具执行体，通过 `argv[0]` 软链接分发以节省磁盘空间 |
| `hatch-execd` | 8.7 MB | `hatch-engine/crates/hatch-execd` | 容器内部受限命令隔离执行守护进程，监听本地 Unix 套接字捕获输出流 |
| `hatch-healthd` | 8.2 MB | `hatch-engine/crates/hatch-healthd` | 节点看门狗与运行时组件健康度探针，负责周期性状态巡检 |
| `hatch-vault` | 11.8 MB | `hatch-engine/crates/hatch-vault` | 机密计算可靠卷（RV）LUKS 卷槽密钥管理与加密凭据托管（Noise_N 协议） |
| `hatch-ws-client` | 13.8 MB | `hatch-engine/crates/hatch-ws-client` | 基于 `Noise_XX` 加密协议的双向 WebSocket 语音及媒体传输客户端，内建 Hen 密钥服务调用（`hen.rs`） |
| `hatch-zeitgeist` | 14.0 MB | `hatch-engine/crates/hatch-zeitgeist` | Meta 一方全域社交搜索引擎（Instagram / Threads / Facebook）及两阶段排序检索 |
| `hatch-shopping-present` | 10.5 MB | `skills/crates/hatch-shopping-present` | 原生商品呈现网关，负责带外安全投送签名图片防范 LLM 幻觉 |
| `hatch-slide-style` | 10.3 MB | `hatch-engine/crates/hatch-slide-style` | 演示文稿（幻灯片）风格主题与原型解析器 |
| `hatch-doctor` | 11.2 MB | `hatch-engine/crates/hatch-doctor` | 确定性运行时状态一致性诊断程序与环境修复基准 |
| `hatch-browser-lease-helper` | 7.5 MB | `hatch-engine/crates/hatch-browser-lease-helper` | Stefi-proxy 租约转发器，用于协调无头浏览器沙箱资源 |
| `hatch-connector-output` | 521 KB | `hatch-engine/crates/hatch-connector-output` | 连接器标准输出捕获与格式化轻量级小工具 |
| `hatch-rescue` | 12.4 MB | `hatch-engine/crates/hatch-rescue` | 虚拟机系统救援核心环境与单用户应急恢复系统 |
| `hatch-rescuectl` | 8.0 MB | `hatch-engine/crates/hatch-rescuectl` | 宿主救援与维护控制命令行管理工具 |
| `hatch-rescue-systemctl` | 2.3 MB | `hatch-engine/crates/hatch-rescue-systemctl` | 隔离态 systemd 服务管理代理，用于在无完整特权下协调单元 |
| `hatch_gws_cli` | 15.6 MB | `hatch-engine/crates/hatch-gws` | 谷歌工作区（Gmail / Drive / Docs）集成客户端 |
| `hatch_gws_auth` | 10.8 MB | `hatch-engine/crates/hatch-gws-auth` | 谷歌工作区 OAuth 授权流与 Token 刷新处理守护模块 |
| `hatch_messenger_cli` | 13.4 MB | `hatch-engine/crates/hatch-channel-provider-messenger` | Facebook Messenger 聊天与多媒体传输客户端 |

##### 4.4.3 全盘采用 Rust 的架构工程动机

1. **特权隔离与内存安全边界**：
   在 Privsep 架构中，容器内非特权进程需要频繁与宿主 Worker 交换文件描述符和结构化 JSON 报文。C/C++ 中易发的缓冲区溢出、Use-After-Free 等内存缺陷在此类特权边界极易沦为逃逸利用载荷。Rust 的静态内存所有权模型从语言层面消除了此类攻击面。
2. **静态单二进制与 SquashFS 镜像空间优化**：
   通过编译为静态链接的 ELF 二进制，避免了容器内复杂的动态链接库版本冲突；同时，通过 `hatch-multicall` 将 17 个高频工具打包为一个 29.1 MB 二进制，将镜像内的重复运行时开销削减了 80% 以上。
3. **高并发高可靠的异步 I/O 吞吐**：
   Muse VM 需要同时维护 86 个 Privsep Unix 域套接字、Noise 加密协议流式音频中继以及大量的后台定时调度任务。基于 Tokio 的异步调度引擎提供了低内存占用与确定的高吞吐性能保障。

---

## 5. 辅助运行时集群（Auxiliary Runtimes）

除了主调度体系外，`/opt` 目录下还预置了一整套庞大的异构运行环境，分别服务于自动化编码、实时多媒体分发、脚本执行与无头网页抓取。

```
/opt/hatch-image/bin/codex (258.3 MB, v0.149.0)
  ├── 模式: stdio MCP Server (mcp-server) / MCP 客户端 (mcp)
  ├── 架构: app-server 集中式会话守护进程 + remote-control 远程接入
  └── 沙箱: read-only | workspace-write | danger-full-access

/opt/hatch-image/bin/rtc-sidecar (34.2 MB)
  ├── 来源: Meta 内部 fbcode 单体仓编译
  ├── 框架: Apache Thrift + folly::StrandExecutor + Mcrouter
  ├── 遥测: Scuba 日志表 (logview_rtc_multiway_media)
  └── 职责: 为 Ray-Ban 智能眼镜提供低延迟音视频多路中继

/opt/meta-chromium/chrome (527.8 MB, Chromium 152.0.7977.82)
  ├── 光栅化: libvk_swiftshader.so (CPU 渲染 Vulkan/WebGL, 无需物理 GPU)
  ├── 崩溃监控: chrome_crashpad_handler
  └── 隔离模式: 受 Stefi Proxy 与 browser-broker 严格调度
```

### 5.1 OpenAI Codex 编码智能体体系

位于 `/opt/hatch-image/bin/codex` 的程序是一个体积达 258.3 MB 的全功能编码智能体系统，版本为 `codex-cli 0.149.0`。经提取二进制符号与网络配置确证，该二进制为 **OpenAI 官方发布的 Codex CLI 工具**，内置对 OpenAI 鉴权服务（`https://auth.openai.com/api/accounts`）、后端接口（`https://chatgpt.com/backend-api`）及 Codex Cloud 任务的支持，命令行示例显式绑定默认旗舰模型 `-c model="o3"`：
- **MCP 协议双向支持**：该工具不仅支持通过 `codex mcp` 挂载外部 Model Context Protocol 服务器，更能通过 `codex mcp-server` 命令将自身作为标准 stdio MCP 服务器运行，直接将代码审查、多会话管理与智能体执行能力暴露给上层宿主。
- **守护进程与远程控制模式**：支持以 `app-server` 模式在后台驻留运行，并通过 `remote-control` 或 WebSocket 地址（`ws://`、`wss://`、`unix://`）接入前端 TUI 会话。
- **伴生 Bubblewrap 沙箱**：同级目录 `/opt/hatch-image/bin/codex-resources/bwrap` 预置了独立的 Bubblewrap 沙箱可执行文件，用于在三级隔离策略（`read-only`、`workspace-write`、`danger-full-access`）下提供 Linux 用户命名空间级别的安全命令执行环境。

### 5.2 内部 RTC 侧车服务：`rtc-sidecar`

位于 `/opt/hatch-image/bin/rtc-sidecar` 的程序体积为 34.2 MB，是一个直接由 Meta 内部单体代码库（`fbcode`）编译生成的 C++ WebRTC MediaServer：
- **内部框架堆栈**：深度集成 Meta 内部核心库，包括 `folly` 异步执行框架（`folly::available_concurrency()`、`StrandExecutors`）、`Thrift` 二进制 RPC 协议编解码器、以及用于连接分布式缓存的 `Mcrouter`（启用 `useBigCache`）。
- **可穿戴媒体中继**：该服务专为智能眼镜等穿戴式设备（Wearables）提供高并发、低延迟的多路媒体流调度。它在宿主上开放静态媒体端口 `18185`，支持 QUIC 0-RTT 握手与 STUN 缓冲。
- **内部可观测性**：服务内建 Scuba 遥测导出器，直接向 Meta 内部的 `logview_rtc_multiway_media` 及 `logview_rtc_multiway_media_details` 数据表实时上报连接延迟与丢包指标。

### 5.3 专有无头浏览器：Meta Chromium 152

位于 `/opt/meta-chromium/` 的定制浏览器套件体积达 548 MB，核心程序为 `Chromium 152.0.7977.82`：
- **纯软件硬件加速替代**：虚拟机通常不配备物理独立显卡，为支持现代网页复杂的 WebGL 渲染与富交互动画，套件内置了 Google 开发的 SwiftShader 光栅化库（`libvk_swiftshader.so` 与 `vk_swiftshader_icd.json`）。该库将 Vulkan 图形指令直接翻译为高效的 CPU SIMD 指令执行，使浏览器能在纯无头虚拟机环境下实现 100% 还原度的屏幕截图与 DOM 树抓取。
- **崩溃弹性**：配备专用的 `chrome_crashpad_handler` 进程，确保在浏览器遭遇内存不足（OOM）或页面异常时，转储上下文数据并协助 `browser-broker` 快速复位实例。

### 5.4 声明式清单：`runtime-cell.kdl`

`/opt/hatch-image/bin/runtime-cell.kdl` 配合 `hatch-manifest` 工具，构成了运行时容器的声明式状态机：
- **APT 依赖固化**：声明了包括 headless LibreOffice（用于文档生成）、GraphicsMagick、FFmpeg、Poppler（PDF 渲染）、Xvfb 与 TigerVNC（虚拟图形缓冲区）在内的数十个系统级软件包。
- **安全反向移植（Backports）**：通过 APT Pinning 强制锁定核心库版本，以消除严重 CVE 隐患：
  - 锁定 Node.js 为 NodeSource 24 LTS。
  - 锁定 FFmpeg 及 `libav*` 依赖为 8.1.2 反向移植版，彻底修复 CVE-2026-8461 远程代码执行漏洞，将安全风险指数由 100 降至 19。
  - 锁定 libheif 为 1.23.3 反向移植版（结合 dav1d 与 ffmpegdec），消除全部 16 个历史 CVE。
  - 锁定 GraphicsMagick 为 1.3.46 反向移植版。
- **退役系统级无监督服务**：清单显式屏蔽了 Ubuntu 原生的定时更新服务（如 `apt-daily.timer`、`unattended-upgrades.service`、`motd-news.timer` 等），将其配置为 `RefuseManualStart=yes` 的空单元。这是为了防止系统自带的维护任务产生未受 Sentinel 审计的外网连接，彻底消除因外部网络轮询引发的告警风暴。

---

## 6. 65 个 Rust Crates 与环境变量全景映射

Muse 运行时的核心守护进程由 65 个内部 Rust Crate 紧密编译而成，并在启动时由外部注入的一系列严格受控的环境变量驱动。

### 6.1 65 个 Rust Crate 功能与架构拓扑

根据二进制符号表与依赖关系的系统性逆向，65 个 Crate 按模块职能划分如下：

1. **核心通信与多渠道提供者（Channel Providers）**：
   - `hatch-channel-provider-imessage`：苹果 iMessage 消息通道集成。
   - `hatch-channel-provider-instagram`：Instagram 消息通道桥梁。
   - `hatch-channel-provider-messenger`：Messenger 通讯接入。
   - `hatch-channel-provider-telegram`：Telegram 机器人及私信接入。
   - `hatch-channel-provider-whatsapp`：WhatsApp 业务通信提供者。
2. **安全引擎、凭证与网络策略**：
   - `hatch-mase-index`：MASE 750 万黑名单指纹的索引与 FST 匹配引擎。
   - `hatch-sentinel`：安全出网审计策略与规则解释器。
   - `hatch-vault`：LUKS 密钥槽流转与机密加密封装。
   - `hatch-auth` / `authd`：统一凭证存储、OAuth 与 cgroup 权限仲裁。
   - `hatch-noise`：Noise 协议握手、状态机与会话帧加解密。
3. **空间隔离与运行时容器管理**：
   - `hatch-spaces`：智能体执行环境与工作空间隔离构建器。
   - `hatch-compaction`：历史会话上下文压缩、状态清理与修剪引擎。
   - `hatch-daemon`：运行时守护进程主体调度循环。
   - `hatch-execd`：容器内安全命令执行与输出流捕获。
   - `hatch-spawnd`：生命周期控制与宿主资源协调。
4. **生成式 UI、可穿戴与商业交互**：
   - `hatch-genui`：声明式组件卡片语法解析与渲染。
   - `hatch-wearables`：针对 Ray-Ban 智能眼镜的视觉与语音协同协议。
   - `hatch-ucp`：Shopify 及多方电商平台的统一下单抽象层。
   - `hatch-zeitgeist`：一方社交全域检索与多模态加权排序。

### 6.2 核心环境变量全景映射字典

系统在运行过程中由 `guest.env` 与 `/etc/hatch/env` 提供环境支撑。下表整理了核心关键配置变量的作用与行为：

| 环境变量名称 | 典型值 / 格式 | 架构层级 | 功能说明与约束 |
|---|---|---|---|
| `JARVIS_CD_CHANNEL` | `alpha` / `canary` / `prod` | 特权编排 | 持续交付渠道标识符，直接决定 OverlayFS 挂载哪些受限工具 |
| `JARVIS_HOME` | `/home/hatch` | 容器文件系统 | 智能体持久化存储根目录（挂载于 Btrfs 子卷） |
| `JARVIS_BIN_DIR` | `/opt/hatch/bin` | 运行时路径 | 运行时核心二进制程序寻找路径 |
| `JARVIS_AUTHD_SOCK` | `/run/hatch/auth/authd.sock` | 特权通信 | 统一认证守护进程 HTTP Unix 套接字路径 |
| `JARVIS_STEFI_PROXY_SOCK` | `/run/hatch/proxy/stefi.sock` | 浏览器代理 | 无头浏览器专用隔离代理套接字 |
| `JARVIS_SANDBOX_API_SOCK` | `/run/hatch/sandbox/api.sock` | 隔离执行 | 沙箱 API 通信控制套接字 |
| `HTTP_PROXY` / `HTTPS_PROXY` | `http://hatch-egress-proxy:3128` | 网络安全 | 强制所有外网出站流量流经宿主 Sentinel 代理 |
| `NO_PROXY` | `localhost,127.0.0.1,198.19.0.1...` | 网络通信 | 白名单地址，仅限容器宿主互联保留 IP |
| `NODE_USE_ENV_PROXY` | `1` | 语言运行时 | 强制 Node.js 内置 `fetch` 继承环境变量代理，防范死 DNS 超时 |
| `SSL_CERT_FILE` | `/run/hatch/egress-tls/ca-bundle.pem` | 证书安全 | 统一拦截代理 MITM 自签名根证书路径 |
| `WGETRC` | `/opt/hatch/runtime-cell/etc/wgetrc` | 工具安全 | 针对 wget 工具锁定的证书配置文件路径 |
| `HATCH_SPACES_BUILD_DRIVER` | `overlay` / `btrfs` | 存储引擎 | 驱动空间隔离构建的底层文件系统驱动 |
| `JARVIS_IPNEXT_*` | 超参数键值对 | 模型推理 | 传递给下一代推理模型的生成温度、Token 限制及上下文超参数 |
| `JARVIS_IDEA_DOCTOR_*` | 调试布尔标志 | 业务监控 | 43 个商业 Idea 运行健康状态诊断与自愈开关 |

---

## 7. 总结与架构评估

对 `/opt/hatch` 及相关目录的深度勘察，勾勒出了一个高度成熟、面向生产级部署的智能体运行环境。Meta 在 Muse 系统中展现出了极强的工程约束力：

1. **绝对的不可变性与防御纵深**：核心可执行文件被固化于只读的 SquashFS 与只读 OverlayFS 之下，容器内即使获得 root 权限也无法篡改系统可执行文件。网络层采用“死 DNS + eBPF 强制门闸 + tc ingress 过滤器 + Sentinel MITM 代理 + MASE 指纹库”的五重过滤，实现了真正的 Fail-Closed 安全闭环。
2. **以硬件穿戴设备为第一公民**：从 `rtc-sidecar` 对 WebRTC 媒体流的高性能中继，到 `genui-display-render` 针对眼镜微屏（Co-op surface）的动态卡片生成，再到 `hatch-ws-client` 的端到端 Noise_XX 语音通道，Muse 运行时的底层协议完全围绕 Meta Ray-Ban 智能眼镜与移动端的多模态即时交互展开。
3. **优雅的商业集成与安全沙箱解耦**：通过 Multicall 模式聚合通用轻量工具，利用独立的 `shopify-ucp-cli`、`hatch-zeitgeist` 以及 43 个预置商业 Idea，辅以特权分离（Privsep）架构与只读 NSS 数据库设计，既赋予了智能体极强的社交穿透与商业履约能力，又将代码执行风险牢牢锁定在沙箱边界之内。
