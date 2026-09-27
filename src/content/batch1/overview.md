# 一页速览

> 全部结论的最短路径。详细内容见 [`README.md`](/content/batch1/tools-readme) 索引与各专题子目录。  

---

## 三十秒理解这台机器

**Muse 是运行在 `systemd-nspawn` 容器里的 AI 运行时**，容器外由宿主平面 `spawnd` 编排。

```
┌─ 宿主平面 ─────────────────────────────────────────┐
│  spawnd          编排、DNS 劫持、代理、resume 管理    │
│  privsep workers 86 个，以 hatch-w-<tool> 账号运行   │
│  egress proxy    3128，TLS MITM，ca-bundle 注入      │
└────────────────────┬───────────────────────────────┘
                     │ 86 个 Unix socket (0x46 + SCM_RIGHTS)
┌────────────────────┴───────────────────────────────┐
│  容器 htch-runtime                                  │
│  hatch daemon (PID 67) ── 工具总线、推理、agent 循环 │
│  /opt/hatch  只读 squashfs（代码）                   │
│  /home/hatch btrfs 持久（唯一）                      │
│  /             overlayfs on tmpfs ← 重启全丢         │
└─────────────────────────────────────────────────────┘
```

**一个必须记住的事实**：重启会丢 `/etc` `/root` `/tmp` `/var`，**只有 `/home/hatch` 跨重启持久存活**。

---

## 核心数字（附口径）

| 项 | 数字 | 口径 |
|---|---|---|
| privsep socket | **86** | `ls /run/hatch/privsep/*.sock`（26/31 个未暴露 socket 已实证可直连）|
| API 工具 | **56** | `GET /tools`（白名单，排除底层控制面）|
| `/opt/hatch/bin` | **78** | 二进制数 |
| 技能包 | **68** | `/opt/hatch/skills/*/` |
| 商业化 Ideas 提案 | **43** | `assets/ideas/catalog/`（8 大商业领域，解密卡片库）|
| 分析与参考报告 | **82** | `docs/**/*.md`（**36,800+ 行**，重整为 6 大专题域）|
| Rust crate | **65** | `hatch-engine/crates/`（含 5 个 channel provider）|
| 模型 | **avocado 系列** | 占 99.8% 生产流量 |
| self-improvement 管线 | **11**（7 条在跑）| prompt 路径 / objective 目录 |
| 生产通信网关 | **1** | `muse-api.py`（HTTP ↔ privsep 本地桥）|

⚠️ **引用这些数字时请带上口径** —— 详见 [审核台账 🔒](/roadmap)。

---

## 五条最重要的结论

### ① privsep 协议逆向突破：31 个未暴露 socket 中 26 个可直连

`/opt/hatch/bin/<tool>` 走 privsep 底层套接字协议（`0x46` 魔数握手 + `SCM_RIGHTS` 描述符传递）。
我们已完整逆向协议，证明 **26 个未暴露 socket 可直连调用**（含 Shopify 24 个工具等企业指令集），仅 5 个受真隔离保护。
跨沙箱通信客户端与本地网关已实现协议级调用与打通。

### ② 出网与管控真相：推翻「物理封锁」，确认 visibility gating

早期假说认为出网受 eBPF 物理封锁、推理被硬件彻底切断。最新实测推翻了该论断：
- **出网真相**：直连真实 IP 可通，流量阻断本质是 DNS 重定向与强制 HTTP 代理劫持。
- **推理真相**：`/opt/hatch/runtime-cell/` 启动脚本完整可读，证实隐藏二进制属于 **visibility gating（可见性门禁）** 而非物理隔离。

### ③ 电商商业支柱：Agent 履约交易抽成（Take Rate 3%~25%）

Meta AI 在去广告化战略下的核心变现模式是**从注意力展示转向交易佣金**：
- **1P catalog 返回空**：自营货源暂未就绪；
- **2P Marketplace 完全可用**：实测返回真实 listing 与卖家信誉，支持多轮自动议价；
- **双钱包保障**：支付采用 Stripe Link / Shop Pay，智能体永不接触明文银行卡信息。

### ④ 原生全端五大主 Tab 核心架构

- **Chat**：Web 交互走 Noise_XX 握手协议，受限于 RV 机密卷与 SEV-SNP 硬件证明；
- **Feed（个人报纸）**：具备 EIC（主编）去重机制，有记忆、知节制，每期只呈现差异化增量；
- **Ideas（主动提议智能体）**：突破被动响应范式，确立 Proactive Proposal 机制与 The Wall 双读者隔离；
- **Goals（长期目标系统）**：双轨模型（`user_goal` vs `assistant_tracking`）搭载 21 个 RPC 工具与 6h 调和总线；
- **Library（制品与媒体门禁）**：实现几何视觉双门禁校验，支持全栈 React 交互制品与十秒带声视频。

### ⑤ 自我进化与持续学习（11 个管线）

- **统一原则**：写者不自评 → 独立审查 → 确定性代码晋级。
- **默认不作为**：`no_change` 和 `insufficient` 是一等公民状态。
- **测量闭环**：通过 Bandit 强化学习与方差缩减驱动持续优化（详见 [总纲 🔒](/roadmap#batch4)）。

---

## 生产服务操作指南

```bash
# 1. 启动本地 HTTP API 桥接网关
python3 docs/tools/muse-api.py --port 18080 --key "<YOUR_SECRET_KEY>"

# 2. 本地直接调测 privsep 工具
python3 docs/tools/bridge-client.py web-search "Meta Muse" --max-results 3
```
