# 分批发布路线图（Editorial Release Roadmap）

对 Meta Muse 自治智能体运行时的逆向研究成果共涵盖 **88 份深度报告、36,800+ 行实测解密**。

为降低认知过载、形成递进深化的阅读体验，全站分为 **5 大发布批次（Release Drops）**。当前已完成 **Batch 1（破局篇）** 的完全首发，其余批次将按计划渐进式解锁。

---

## 批次概览与时间表

| 批次编号 | 专题代号 | 公开状态 | 报告规模 | 核心叙事焦点 |
|---|---|---|---|---|
| **Batch 1** | **破局篇**：运行时架构真相与 Privsep 底层突破 | 🟢 **已发布 · 完全开放** | 13 篇深度报告 | 物理架构、出网真相、0x46 协议逆向、工程网关打通 |
| **Batch 2** | **交互篇**：Muse 原生五大 Tab 与主动式 Idea Agent | 🔒 *即将发布 · 预告中* | 8 篇深度报告 | 个人定制报纸 Feed、Proactive Proposal 智能体范式、Library 门禁 |
| **Batch 3** | **商业篇**：交易抽成（Take Rate 3%~25%）与 43 Ideas 库 | 🔒 *即将发布 · 预告中* | 15 篇 + 资产库 | 商业变现模型、16 环电商生命周期、Shopify UCP、43 张卡片库 |
| **Batch 4** | **进化篇**：11 条自进化管线、夜间反思与 Bandit 底座 | 🔒 *即将发布 · 预告中* | 13 篇深度报告 | 写者不自评、Warm Dream 26 步 DAG、Goals 双轨调和、Bandit 测量 |
| **Batch 5** | **防御篇**：攻防路线图、否定性结论与 10 类反模式防御 | 🔒 *即将发布 · 预告中* | 16 篇深度报告 | Postgres 被否总结、调度源探查、23 项审核台账、Sentinel 490 键 |

---

<div id="batch1"></div>

## 第一批 · 破局篇（Core Runtime & Privsep Breach）

> 状态：🟢 **已正式上线 · 点击下方即可立即阅读**

系统性解密 Meta Muse 运行时的真实架构底座与物理边界，推翻早期的物理封锁假说，并全过程复盘从套接字底层协议逆向到工程工具链路打通。

### 核心解密亮点
- **推翻物理封锁**：证实容器内直连真实 IP 可达，流量阻断实质为 DNS 劫持与强制代理；
- **runtime-cell 解剖**：逆向 `/opt/hatch/runtime-cell/` 下全部 22 个启动脚本，确立隐藏二进制属于 visibility gating 可见性门禁；
- **0x46 协议破解**：实证 privsep 底层双层序列化协议（`0x46` 魔数握手 + `SCM_RIGHTS` 描述符传递）；
- **31 个未暴露 Socket 实测**：实证 26 个 socket 可直连穿透调用（含 Shopify 24 工具等企业指令集）；
- **跨沙箱网关落地**：研发 `bridge-client.py` 与 `muse-api.py`，打通本地与容器间 REST/CLI 交互。

### 已公开文档快速入口
- [一页速览 (OVERVIEW)](/content/batch1/overview)
- [系统总纲：给未来接手者的地图 (RESEARCH-SUMMARY)](/content/batch1/research-summary)
- [容器拓扑与存储持久化](/content/batch1/architecture-overview)
- [只读 squashfs 资产与二进制分类学](/content/batch1/opt-hatch-deep-dive)
- [authd 认证代理与 privsep 通路](/content/batch1/architecture-deep-dive)
- [65 个 Rust Crate 与 Serde 协议](/content/batch1/code-and-protocol)
- [⭐ runtime-cell 解剖：推翻物理封锁](/content/batch1/runtime-cell-and-egress-truth)
- [后台急切上下文压缩机制](/content/batch1/context-compaction-deep-dive)
- [智能体中断恢复与自愈断言链](/content/batch1/runtime-restart-and-recovery)
- [Web Chat 三跳链路与 Noise 握手](/content/batch1/web-chat)
- [能力边界与封锁机制分析](/content/batch1/limits)
- [⭐ 0x46 协议逆向与 26 直连 Socket](/content/batch1/privsep-protocol-and-unexposed-sockets)
- [工具与工程脚本说明](/content/batch1/tools-readme)

---

<div id="batch2"></div>

## 第二批 · 交互篇（Native Tabs & Proactive Ideas）

> 状态：🔒 **即将发布 · 预告中**

告别传统 AI 产品的聊天框与信息流模式，揭秘 Meta AI 如何重塑智能体交互体验：

### 前瞻要点
- **Feed 个人报纸机制**：有主编（EIC）、有记忆、知节制，每期仅交付差异化增量，彻底告别无脑信息瀑布流；
- **Proactive Proposal 智能体范式**：从被动等待用户唤醒（Passive Agent），跃升为机器主动发起提案（Proactive Idea Agent）；
- **The Wall 双读者隔离法典**：前台第一人称单信号表达（"I can..."）严禁破折号与空泛叙述；后台严格绑定物理世界可观察判据与瞬态执行器；
- **Library 制品与媒体双重门禁**：几何布局与视觉渲染双重校验，全栈交互动态制品安全投送。

---

<div id="batch3"></div>

## 第三批 · 商业篇（Ecommerce & Take Rate Monetization）

> 状态：🔒 **即将发布 · 预告中**

首次完整揭秘 Meta AI 在去广告化战略下的商业变现核心支柱：

### 前瞻要点
- **商业模式跃迁**：从注意力广告展示全面转向基于 Agent 自治履约的交易抽成（Take Rate 3%~25%）；
- **16 环节全生命周期大贯穿**：意图路由、议价、比价、双模履约追踪、11 步退货合规、售后追偿；
- **双钱包与支付安全信封**：Stripe Link / Shop Pay 双钱包闭环，智能体永不接触明文银行卡；
- **43 个商业化 Ideas 独立解密卡片库**：零售比价、差旅理赔、无主资产申报、DMV 代办等 8 大领域全景档案。

---

<div id="batch4"></div>

## 第四批 · 进化篇（Self-Improvement & Continuous Learning）

> 状态：🔒 **即将发布 · 预告中**

系统性解构 Meta Muse 智能体的持续自我进化引擎：

### 前瞻要点
- **四大自进化原则**：写者不自评、独立审查判定、确定性代码晋级、默认不作为是一等公民；
- **Warm Dream 夜间反思**：26 步 DAG 管线、Rust 持久化符号、四大写作法则与 646 会话拓扑扫描；
- **Bandit 强化学习数据底座**：三张核心表 SQL，双通道奖励回流与 384 维图标向量；
- **Goals 长期目标双轨系统**：`user_goal` vs `assistant_tracking`，21 个底层 RPC 工具与 6h 调和总线。

---

<div id="batch5"></div>

## 第五批 · 防御篇（Explorations & Negative Knowledge）

> 状态：🔒 **即将发布 · 预告中**

在安全与逆向工程中，**确认“走不通的路”与“可行之路”具备同等的核心价值**：

### 前瞻要点
- **方向三（PostgreSQL 全库解剖）被否详细说明**：无本地数据库实证、`muse.db` 四层硬性契约禁令与经验沉淀；
- **调度源探查与 cron 伪权威**：cron 只读投影事实，解密 `scheduler.*` 控制面真正调度链路；
- **23 项事实审核台账**：纠正 4 项高危论断（含 SEV-SNP 证明方向反转纠偏），沉淀 10 类防御规则；
- **参考字典全集**：Sentinel 490 键权限字典、PostgreSQL 17 个 Schema / 195 张数据表映射。
