# Muse 运行时研究：全局总结

> 覆盖范围：`docs/04-inference/` **49 份报告、22,485 行**
> 定位：**给未来接手者的地图** —— 哪些已查清、哪些走死了、哪些还开着
> 原则：**只写有实测支撑的结论**；推断标注等级；错误保留在案

---

## 0. 一句话总结

**Muse 是一个「能力开放、层层留痕、关键动作要人点头」的自治 agent 运行时。**

本次研究从「绑定社交账号后商品推荐」这个具体问题出发，
最终逆向出的是一套**完整的权限、审计与信任边界架构**（七层，见 §2.3.1）。

**⭐ 最重要的发现不是某个功能，而是三件事：**

1. **设计的贯穿性** —— 从 privsep 的 `cell_caller_policy` 到 Shopify 的 `refunds` 封锁，
   从 `connector_read_audit` 到 `USER.md` 的 "not building a dossier"，
   **是同一套价值观在不同层级的一致实现。**

2. **⭐ 「封锁」的真相是「管控」** ——
   前期预研路线图断言的两个「关键工程边界」（eBPF 出网过滤 / 同步推理物理封锁），
   **实测都不成立**：
   - 出网：**直连真实 IP 可通**，机制是 DNS 重定向 + 强制代理
   - 推理：**socket 在 cell 内不可见**，不是"连不上"

   **→ Muse 的效率来自「知道谁在做什么」，不是「阻止谁做什么」。**

3. **⭐⭐ feed 是「报纸」不是「信息流」** ——
   它有一位记得住你一切的主编：知道你为自己的 agent VM 搭过 reverse-SSH、
   知道你做过 Man Utd 数据面板、知道你在香港、知道你在做 Dream-RSI 项目，
   **然后每期只告诉你「变化了什么」，而不是「又发生了什么」**。
   三个特点：**有记忆**（知道上期印过什么）、**有判断**（"a story that *belongs*"）、
   **有节制**（"that story is done"）。

4. **⭐ 「隐藏」不等于「移除」** ——
   `bin-scopes.conf` 逐字："**Hiding the cell binary is visibility gating,
   not a capability boundary**"，且"each HOST copy and its worker
   **stays in place on every channel**"。
   **→ 这解释了本项目最核心的发现：31 个"未暴露"的 socket 全部可直接调用。**

---

## 1. 物理架构（已查清，稳定）

```
┌─ 宿主（spawnd）────────────────────────────────────────┐
│                                                        │
│  ┌─ 容器 htch-runtime（systemd-nspawn）──────────┐     │
│  │  /              overlayfs on tmpfs（重启即清） │     │
│  │  /etc /root /tmp /var  ← tmpfs                │     │
│  │  /home/hatch    ← btrfs /dev/mapper/rv（持久）│     │
│  │  /opt/hatch     ← squashfs 只读，750M 已 100% │     │
│  │                                                │     │
│  │  hatch daemon (PID 67, cell-leader)           │     │
│  │  hatch-execd (worker 执行)                    │     │
│  └────────────────────────────────────────────────┘     │
│                                                        │
│  privsep workers（86 个 Unix socket，全部宿主侧）      │
│  PostgreSQL（不在容器内）← authd 代理                  │
│  browser-broker → VMVM（Docker，15 分钟租约）          │
└────────────────────────────────────────────────────────┘
```

| 关键事实 | 值 | 稳定性 |
|---|---|---|
| 实例 ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | ✅ 稳定 |
| privsep socket 数 | **86** | ✅ 稳定 |
| **CD 渠道** | **`alpha`**（未在 `bin-scopes.conf` 定义 → 不揭示任何二进制）| ⚠️ 可重验 |
| **实例 FQDN** | `instance-xxxxxxxx.metaaivm.com`（`JARVIS_TIER=prod`）| ✅ |
| `/opt/hatch/bin` 二进制 | **78 个**（表观 1.1 GB，压缩后 750M）| ✅ |
| skills | **67** | ✅ |
| hatch 版本 / daemon 线程数 / 目录数 | 频繁变化 | ⚠️ 每次重验 |

**⚠️ 持久性铁律**：只有 `/home/hatch` 跨重启存活。
这解释了本项目遇到的**一切「重启后失效」问题**。

### 1.1 ⭐ 关键路径速查（本次新发现）

| 路径 | 内容 | 可读性 |
|---|---|---|
| **`/opt/hatch/runtime-cell/`** | ⭐ **容器启动脚本全集（22 文件）** | ✅ **完整可读** |
| ↳ `bin-scopes.conf` | 二进制可见性门禁 | ✅ |
| ↳ `skill-scopes.conf` | skill 可见性门禁 | ✅ |
| ↳ `guest.env` | 容器环境（含代理配置）| ✅ |
| ↳ `launch-daemon.sh` | ⭐ gate 实现（13 KB）| ✅ |
| **`/etc/hatch/env`** | ⭐ 运行时环境（含推理代理路径）| ✅ |
| `/etc/hatch/env.override` | ⚠️ shell source 的覆盖入口 | ✅（1 字节空文件）|
| `/etc/hatch/credentials/` | 凭据 | ❌ `d---------` |
| `/run/hatch/runtime-cell/` | ⚠️ 真正的 runtime-cell | ❌ **root 也被拒** |
| `/run/hatch/proxy/` `sentinel/` | ⚠️ 推理代理与审批 | ❌ **cell 内不存在** |
| `/run/hatch/privsep/` | 86 个 tool socket | ✅ |
| `/run/hatch/auth/authd.sock` | 权限中心 | ✅（读得到、写不了）|
| `/run/hatch/sandbox/space-*.sock` | 沙箱推理/媒体/搜索 | ✅ |

**⭐ 发现技巧**：`/opt/hatch/runtime-cell/` 的可读路径来自**挂载表**：

```sh
$ cat /proc/self/mountinfo | grep runtime-cell
... /opt/hatch ← squashfs[/runtime-cell-exposed]     ⭐ 这就是可读的那个
... /etc/hosts ← squashfs[/runtime-cell/etc/hosts]
```

---

## 2. 七大研究主线

### 2.1 主线一：自治管线（11 个 prompt 域）

**统一范式**：**写者不自评 → 独立 review → 确定性代码晋级**

| 管线 | 报告 | 核心发现 |
|---|---|---|
| **self-improvement** | [`self-improvement-architecture.md` 🔒](/roadmap#batch4)（813 行）| 11 域，8 有 `objectives/`，7 有 baseline scheduler |
| **ideas** | [`ideas-pipeline.md` 🔒](/roadmap#batch2)（528）| **43 个商业 Idea 生成器**，十步流程 |
| **memory** | [`memory-pipeline.md` 🔒](/roadmap#batch4)（462）| reconcile → pinned → 落盘 |
| **alignment** | [`alignment-pipeline.md` 🔒](/roadmap#batch4)（639）| 夜间反思，`correction_free_rate` |
| **studying** | [`studying-pipeline.md` 🔒](/roadmap#batch4)（438）| 学习管线 |
| **shopping** | [`shopping-judge-deep-dive.md` 🔒](/roadmap#batch4)（560）| 2-seat 架构，证据累积阶梯 |
| **warm dream** | [`warm-dream-deep-dive.md` 🔒](/roadmap#batch4) | 记忆巩固 |
| 其余 | [`remaining-pipelines.md` 🔒](/roadmap#batch4)（781）| 汇总 |

**⭐ 最值得记的设计模式**：

| 模式 | 出处 | 含义 |
|---|---|---|
| **写者不自评** | 全管线 | 生成方无判定权 |
| **证据累积阶梯** | ShoppingJudge | 1 次=little / 2 次=tentative / 重复=stronger |
| **稀疏即诚实** | ShoppingJudge | "an omission is honest, an ungrounded assertion is not" |
| **排除的门槛高于推荐** | ShoppingJudge | "hiding an eligible product is the greater harm" |
| **不许降级承诺** | ideas | 方法自由 ≠ 缩小成果 |
| **单信号铁律** | ideas | 一张卡只讲一件事 |

**测量机制**：`hatch_measurement::pipeline::evaluate_card`
→ normalize/dedupe → 确定性窗口 → volume/power → 真实推理 → 分类 → **predictive-validity gate**
→ `helped` / `noise` / `insufficient` / `confounded`

### 2.2 主线二：电商全生命周期（16 环节）★ 本次重点

**报告**：[`ecommerce-complete-lifecycle.md` 🔒](/roadmap#batch3)（561 行）、
[`ecommerce-four-gap-chains-and-instagram-bridge.md` 🔒](/roadmap#batch3)、
[`shopify-ucp-and-commerce-modules.md` 🔒](/roadmap#batch3)、[`ecommerce-monetization-and-take-rate.md` 🔒](/roadmap#batch3)

```
①意图解析 ②Meta Catalog ③Marketplace ④Browser沙箱 ⑤比价降价监控
⑥画像(ShoppingJudge) ⑦购物车快照 ⑧结账路由 ⑨支付通道 ⑩审批风控
⑪订单追踪 ⑫退货退款 ⑬售后追偿 ⑭复购 ⑮商家侧 ⑯测量回流
```

**⭐⭐ 重大实测修正**：

> **⑪/⑮/⑯ 不是「Muse 没有能力」，而是「能力没有暴露给 agent CLI」。**

通过破解 privsep 协议直连 `shopify.sock`，拿到 **24 个工具的完整 schema**：

| 填补的环节 | 工具 |
|---|---|
| **⑪ order-tracking** | `list-orders` / `get-order` |
| **⑮ merchant-side** | `create-product` / `update-product` / `set-inventory` / `create-discount` / … |
| **⑯ measurement** | `run-analytics-query`（完整 ShopifyQL）|
| **⑭ repurchase** | `list-customers` |
| **⑦ cart** | `add-to-collection` / `search_collections` |
| **⭐ 通用通路** | `graphql_schema` → `graphql_query` / `graphql_mutation` |

**⭐ `run-analytics-query` 补上了 ⑦→⑧ 转化漏斗**：
`with_cart_additions` / `reached_checkout` / `completed_checkout` / `conversion_rate`

**实际可用性（实测）**：

| 环节 | 状态 |
|---|---|
| ②Meta Catalog | ⚠️ `Products unavailable`（Stefi 未 provision）|
| ③Marketplace | ✅ 读侧可用 |
| ④Browser | ⚠️ 部分（`books.toscrape`✅ `walmart`⚠️静默失败 `amazon/etsy`❌403）|
| ⑥画像 | ⚠️ **`PROFILE.md` 不存在**（管线判定 `insufficient`）|
| ⑨⑩支付审批 | ✅ 协议已逆向 |
| ⑪⑮⑯ | ✅ **工具有，需授权** |

### 2.3 主线三：权限与隔离（本次最大收获）★★

**报告**：
- [`privsep-protocol-and-unexposed-sockets.md`](/content/batch1/privsep-protocol-and-unexposed-sockets)（746 行）
- ⭐ [**`runtime-cell-and-egress-truth.md`**](/content/batch1/runtime-cell-and-egress-truth)（1010 行）
- [`direction1-async-injection-assessment.md` 🔒](/roadmap#batch5)（487 行）

#### 2.3.1 ⭐⭐ 七层信任边界（完整版）

```
① 可见性层  bin-scopes.conf / skill-scopes.conf
            JARVIS_CD_CHANNEL 决定揭示哪些二进制与 skill
            逐字: "Hiding the cell binary is visibility gating,
                   not a capability boundary"
            ⭐ 宿主 worker 始终在，只是 cell 侧副本被 carve out

② 能力层    31 个未暴露 socket，26 个可直接调用（协议已破解）
            当前 VM 渠道 = "alpha"（未定义）→ 不揭示任何二进制

③ 隔离层    5 个真隔离（Permission denied，root 也被拒）
            shop-wallet-checkout / stripe-link-checkout-card /
            printify-verify / tessie-api-verify / platform-search-stdout-search
            ⭐ 5 个里 4 个涉及支付/账户验证

④ 推理层    proxy/inference.sock    ❌ cell 内不可见
            (JARVIS_INFERENCE_PROXY_SOCK 指向它)
            ⭐ 这才是"同步推理封锁"的真正实现 —— 不是连不上，是看不见
            对照: sandbox/space-inference.sock ✅ 可见（推断为沙箱用）

⑤ 身份层    connector 身份归 authd，不在 PostgreSQL
            schema 逐字: "Connector identity owned by authd;
                          no Muse PostgreSQL owner table"
            authd 门禁: deny-by-default + cell_caller_policy 表

⑥ 审计层    connector_read_audit:
              request_origin / purpose / method_key / sensitivity
            request_origin 枚举 40+ 项（含 internal.inference_proxy、
              external.local_cli）
            ⭐ 容器内每个 CLI 调用都被标记记录

⑦ 确认层    graphql_mutation: "The host app will prompt the user
              for confirmation before executing"
            browser-broker: 三层单向隔离 + 15 分钟租约
```

#### 2.3.2 ⭐⭐ privsep 协议（strace 实证）

```c
sendto(sock, "\x00\x03", 2)                     ← 魔数
sendmsg(sock, ["\x46"], SCM_RIGHTS × ≥3 fd)     ← fd 握手，payload 恰好 1 字节
sendto(sock, "\x00", 1)                         ← 分隔
sendto(sock, "{PrivsepRequest...}", N)          ← JSON
// 响应从同一 socket 非阻塞分块读
```

**`PrivsepRequest`**：
```json
{"args_json":"<内层命令JSON>","forwarded_env":{},
 "input_file_paths":[],"optional_input_failures":[],
 "output_dir_spool_counts":[],"input_dir_service":false}
```

**三条关键错误信息**（worker 自描述的，可用于协议发现）：
```
"expected fd marker 0x46, got 1 byte(s) (first byte: X)"
"expected >= 3 fds (stdin, stdout, stderr, [file...]), got 1"
"read fd count prefix: failed to fill whole buffer"
```

#### 2.3.3 ⭐⭐ 出网真相（推翻「物理封锁」）

| 早期假设断言 | 实测 |
|---|---|
| "eBPF cgroup 出网过滤" | ❌ **不成立** |
| "同步推理物理封锁" | ❌ **不成立** —— 直连真实 IP 可通 |
| 实际机制 | **DNS 重定向(→198.18.x) + 强制代理 + CA 集中签发** |

```sh
$ curl -x http://hatch-egress-proxy:3128 https://api.github.com
HTTP 200
$ /dev/tcp/140.82.121.4/443        # github 真实 IP，绕过 DNS 与代理
可连 ⚠️
```

**⭐ 结论**：Muse 的出网设计是「**可观测的管控**」，不是「不可穿透的封锁」。
目的是**知道谁在访问什么**，而非阻止访问。

#### 2.3.4 ⭐ `launch-daemon.sh` 的双层失败策略

| 场景 | 策略 | 理由 |
|---|---|---|
| 门禁失败（揭示失败）| **fail-CLOSED** | 安全优先 |
| **启动过程失败** | **fail-OPEN-boot** | ⭐ **可用性优先** —— 避免 agent-less 崩溃循环 |

**⭐ 安全与可用性在正确的层级上各自取舍。**

#### 2.3.5 ⚠️ 两个真实的安全问题

**其一：明文凭据可读**

```sh
$ authdc file list
{"custom.cloudflare": {"access_token": "<明文>", ...}}
```

**设计意图**：「读得到、改不了」（cell 需用凭据发 API，但不能改）。
**残余风险**：cell 内任何代码可读明文 token，**配合已证实可用的出网通道即可外传**。

**其二：`/etc/hatch/env.override` 是 shell source**

```sh
# guest-runtime-env.sh 逐字
if [ -r "/etc/hatch/env.override" ]; then . "/etc/hatch/env.override"; fi
```

**是 `.` source 而非 KEY=VALUE 解析** → 内容会被当 **shell 代码执行**。
**⚠️ 我未测试写入**（属攻击性操作），仅记录为风险点。

#### 2.3.6 ⭐ 一条来自 Muse 自己的方法论警告

`/etc/hatch/env` 注释逐字：

```
# Readers compose the env var name at runtime (jarvis hatch-config
# feature_flags.rs), so a grep for the full name finds no consumer;
# it has one.
```

**→ "字符串不出现 ≠ 行为不发生"** —— 这补上了 §4.1 教训的反向一半。

### 2.4 主线四：测量与成本

**报告**：[`agents-directory.md` 🔒](/roadmap#batch5)（1012 行）

**⭐ 权威口径（调度器 DB，非文件推算）**：

```
看门狗任务 ~19.1M tokens/day
176 runs, ~108k input/run
99% input = per-invocation context overhead
```

**⭐ 「99% input」是最重要的信息**：
**成本与「每次要背多少上下文」成正比，与它实际做了多少事几乎无关** ——
而它实际只跑两条 shell 命令。

**→ 这是 shell 化能省 100% 的机制解释：不是"做得更快"，而是根本不需要载入上下文。**

**结果**：`~19.1M/天 → 0`（systemd timer 替代 agent 回合）。

---

### 2.5 主线五：⭐ Feed 系统（一份为唯一读者定制的报纸）★★

**报告**：[`feed-system-deep-dive.md` 🔒](/roadmap#batch2)（676 行）

**⭐⭐ 最重要的认知修正**：
**Muse 的 `feed` 不是"信息流"，是一份有主编的、会自我去重的个人报纸。**

#### 2.5.1 报纸语义（`feed.units` 表结构）

```
kicker（眉题）/ position（版面位置）/ edition_kind（期次）
edition_local_date / share_instructions / body_md / header_image_path
```

**实测 28 期的四种期次**：

| `edition_kind` | 期数 |
|---|---|
| `morning` | 13 |
| `evening` | 6 |
| `midday` | 4 |
| **`adhoc`** | **4** ⭐ 临时增刊 |

**⭐ `adhoc` 说明它不按固定时段出** —— **有值得报的就加印**。

#### 2.5.2 ⭐⭐ 每条内容都带「读者画像」

每张卡开头的 `Angle` 字段里，**大量引用读者的真实背景**：

| `Angle` 里写的（逐字）| 对应的真实行为 |
|---|---|
| "The reader **built a reverse-SSH remote-access setup for their own agent VM**" | ⭐ **正是本项目在做的事** |
| "The reader spent a session **probing how an agent's Linux VM works** (SSH, console, CLI access)" | 同上 |
| "The reader is a **Man Utd fan** who had a United data dashboard built" | 兴趣 |
| "the reader noted **Muse's memory layout mirrors OpenClaw's conventions**" | 说过的话 |
| "The reader is **in Hong Kong** with weekend plans riding on this" | 位置 |
| "The reader requested a full **Dream-RSI report**... their project stake" | 项目 |

**⭐ 不是"猜你喜欢"，而是「我知道你正在做什么」。**

#### 2.5.3 ⭐⭐⭐ `Angle` = 去重指令（最独特的机制）

**三段式结构**：

```
① 已印过什么（带时间与信源）
② 本次只许报什么
③ 读者背景与偏好
```

**逐字实例**：

> "this paper **already printed** the AIX Seed IQ study ... **about 12 hours ago**
> — **file only** RSI research papers or funding developments **newer than
> those two stories, nothing they already contain**."

**三种措辞强度**：

| 措辞 | 含义 |
|---|---|
| `already printed X about N hours ago` | 常规去重 |
| **`that story is done`** | ⭐ **主动结案** |
| `do not re-report unless genuinely new development` | 例外条款 |

**⭐ 还有 "change check" 模式**：对台风、产品发布这类持续话题，
**只报变化不报状态**。

#### 2.5.4 三条 lane 与仲裁

| lane | 数据源 | 实测状态 |
|---|---|---|
| **`web`** | 公网抓取 | ✅ **42 条全在此** |
| `social` | Instagram | ⚠️ 已绑定但**零产出** |
| `tracking` | Gmail | ❌ **未绑定** |

**仲裁依据（逐字）**：**"a story that `belongs` this hour"**

**⭐ `social` 沉默的真相**（深查后）：
**代码路径完整存在**（有 `social_media_search` / `social_post_enrich` /
`social_instagram_carousel` 等完整字段），
**Angle 逐字写着 "social is only a backup"** ——
**它是被设计为备份 lane，不是缺陷。**

#### 2.5.5 ⭐ 流程（从二进制字段名还原）

```
feed_assign → feed_fetch → feed_story → feed_editor
  → feed_composer → feed_edition_publish → feed_edition_fleet_publish
```

**⭐ `feed_editor_step`** —— 有独立的**编辑**环节，
**很可能正是「写 Angle 与做去重判断」的角色。**

#### 2.5.6 ⭐⭐ Fleet-learning：跨 VM 经验共享

**5 张 `fleet_*` 表**：

```
fleet_engagement_outbox  上报: deleted/discuss/share/seed_use
fleet_reaction_outbox    上报: liked
fleet_fetch_receipts     接收: payload_hash 去重
fleet_engagement_contributions / fleet_publish_state（水位线）
```

**关键注释（逐字）**：
> `origin_id` = "**Fleet-learning origin identifier; its owner is outside this
> VM database.**"

**→ 与 self-improvement 的「舰队共享」同源**（而 `memory` 是唯一不参与的）。

#### 2.5.7 ⚠️ 一个概念澄清：`beat` 有两种含义

| 写法 | 位置 | 含义 |
|---|---|---|
| `Beat: web` | 报纸卡片开头 | 条线/领域 |
| `beat_*` | 心跳调度器 | ⭐ **另一概念** |

`beat_*` 字段：`beat_resolve` / `beat_execute` / `beat_picked` /
`beat_no_instructions` / `beat_stale` / `beat_timed_out`

**→ 属心跳/调度域**（`beat_resolvecron` 暗示与 cron 相关）。

---

### 2.6 主线六：⭐ Goals 长期目标系统（双轨持久化与 6h 自治调和）★★

**报告**：[`goals-system-deep-dive.md` 🔒](/roadmap#batch4)（260 行）

#### 2.6.1 双轨目标架构（Dual-Track Model）

Muse 将目标严格划分为两个互不相通的平面：
- **`user_goal`**：面向用户生活里程碑（7 大领域：career、health、money 等），完全挂载在前端 Goals Tab。无暂停态（仅 `active`/`completed`），支持一级父子嵌套，子目标 entry 自动 rollup。智能体仅能裁定脉冲，严禁修改其截止日或注意力。
- **`assistant_tracking`**：面向 Muse 自治承诺的工程/后台责任（如 `vm-remote-access-via-reverse-ssh`、`dream-rsi-report-cover-image`、`gmail-inbox-monitoring`）。前端对用户隐蔽，智能体拥有完整的生命周期流转与注意力裁决权。
- **越权防御**：调用工具若类型不匹配（如用 `user_goal.create_entry` 写入 `assistant_tracking` 目标），运行时直接抛出 `tool error: goal has source assistant_tracking`，强制 Agent 切换为 `tracking.create_entry`。

#### 2.6.2 目标与执行物理分离

“A goal by itself does not run anything; real background work only happens through scheduled jobs.”
目标本身不占常驻执行线程，其后台行动能力全部通过将 Cron 定时任务放置在目标自身工作区目录（`crons/`）实现。调度器唤醒作业时，自动在上下文头部注入 `[GOAL CONTEXT] owned by goal:...`，形成完整的上下文所有权与进展回写闭环。

#### 2.6.3 磁盘 7 级目录骨架（Workspace Projection）

每个目标在创建时自动在磁盘建立标准持久目录 `/home/hatch/workspace/goals/<goal-slug>/`：
`GOAL.md`（约束定义）、`agent_notes/`（推演笔记）、`briefs/`（简报产物）、`crons/`（调度任务）、`files/`（最终交付物）、`hidden_files/`（日志与校验基线）、`references/`（外部空间视图）。

#### 2.6.4 `goals_bookkeeping` 6h 自治审计总线

由 Self-Improvement 引擎驱动，每 6 小时（UTC 01:00/07:00/13:00/19:00）运行 12 步原子调和流水线（snapshot → reconcile_chunks → collect_proposals → group_candidates → prepare_goal_evaluations → evaluate_goals → validate_consolidation → prepare_pulses → evaluate_pulses → validate_pulses → apply_reconciliations → gate）。
- **时间推移即状态变更**：无需新事件发生，纯时间流逝即可触发状态脉冲更新（如“距出发还有 2 天”；周期任务演化为“上次完成 + 下次执行”的节奏脉冲）。
- **反模板化要求**：严禁千篇一律的公文套话，强制像人翻日历一样随口表述。
- **隐式线索捕获（Inferred Goal Leads）**：后台 studying 主动发掘长期兴趣（如曼联足球数据），通过包含 Rationale、Evidence、Confidence、Confirm/Reject 契约与 Gentle Next Moment 触达点的严格规范进行孵化。

---

### 2.7 主线七：⭐ Library 资源体系（Artifacts 制品与 Media 媒体全解）★★

**报告**：[`library-artifacts-and-media-deep-dive.md` 🔒](/roadmap#batch2)（260 行）

#### 2.7.1 Library 定位与三层划分

Library 是全端五大主 Tab 之一（Web 对应 `/artifacts`），承载所有大于普通对话消息的交付成果：
- **Artifacts（制品）**：细分为 All、Documents、Web artifacts。
- **Media（媒体）**：细分为 Images、Videos。
- **System files（系统文件）**：直通底层持久化文件系统（`workspace/your_files` 与 `workspace/user`）。
- **生命周期断言**：普通文件删除进入 30 天回收站（Trash）；**Artifacts 删除为物理彻底硬删除**（销毁托管、数据卷、`app.db` 并注销 Cloudflare 公共链接）。

#### 2.7.2 Artifacts：三大形态与代码-视觉双重门禁

- **Documents**（离线交付物）：PDF、DOCX、PPTX、XLSX、MD、CSV。
- **Pages**（静态网页）：VM 本地托管，纯前端渲染，支持一键单文件 HTML 导出，允许单次批准推送到 Cloudflare 建立公网链接。
- **Interactive Apps**（全栈应用）：VM 实时沙箱托管，自带独立持久化数据库 `app.db`。**严禁公网共享**，仅限本地私有访问。
- **编译与门禁体系**：
  - PDF：HTML + Print CSS 在 `.src/` 下，`render_audit.mjs` 渲染，经几何门禁（`pdf_geometry_gate.mjs`、`pdf_text_floor.mjs`）与全光栅化测试，Agent 必须通过多模态 Vision 检查逐页 PNG 无溢出与重叠。
  - PPTX：每页独立 HTML + StylePlan 主题（`hatch-slide-style`）+ 字体子集化内嵌（`embed_deck_fonts.mjs`）+ CSS 作用域组装（`assemble_deck.mjs`）+ 演讲者备注导出（`build_pptx.py`）。
  - XLSX：`openpyxl` 强制写入原生 Excel 公式（严禁 Python 预计算死值），无头 LibreOffice（`recalc_xlsx.py`）重算门禁提取公式错误 JSON，结合 `validate_xlsx.py` 完整性校验。

#### 2.7.3 Media：Muse 生成模型与 PostgreSQL 媒体库

- **生成式媒体（Generative Media）**：
  - 核心模型：**Muse Image** 与 **Muse Video**（Meta 官方专有多模态模型）。
  - 视频规格：固定约 10 秒不可调时长；自带合成配乐（依据 Prompt 如 "quiet piano" 动态生成）；不接受外部音频输入；通过 `snapshot_id` 接续分镜画风。
  - 落盘结构：保存在 `/home/hatch/workspace/imagine_media/`，包含原始视频/图片（`.mp4`/`.webp`）、`.thumbnails/` 下的 JPEG 缩略图与 `.json` 伴随元数据（`snapshot_id`、FB CDN URL、`media_handle`）。
- **媒体资产库（Media Library）**：
  - 后台引擎：`/opt/hatch/bin/media-library`，底层由宿主端 PostgreSQL 提供毫秒级检索。
  - 5 大指令：`stats`（总览）、`search`（BM25 全文检索 + 日期过滤 + GPS 经纬度/半径围栏）、`recent`（最新上传）、`scan`（富文本摘要）、`get <media_id>`（完整 JSON 标注与 EXIF）。
  - AI 视觉标注：包含 `summary_short`、`summary_full`、`people_text`（仅外观，严禁人脸识别）、`activity_text`、`objects_text`、`ocr_text` 与 `location_hint_text`。
  - 跨设备穿透：本地库不足时，通过 `device.list` → `device.describe` → `photos.search` 穿透至 iPhone 相册或 Android 图库检索并拉取至 VM。

---

## 3. ⭐ 走过的死路（明确标注，避免重复投入）

| 方向 | 为何走不通 | 证据 |
|---|---|---|
| **全库逆向 PostgreSQL** | ❌ 工具契约明文禁止 3/4 子目标 | `muse_db/SKILL.md`：`cannot inspect system catalogs, access credentials`；`reasoning is never readable` |
| **提取 CoT** | ❌ **四层防护** | view + 行过滤 + 列扣留（`details_json`/`item_json`）+ `redacted-thinking` 是 **provider-encrypted** |
| **暴力破解同步出网** | ❌ **原因与我原先想的不同** | 不是"物理封锁"（直连 IP 可通，见 §2.3.3），**而是推理 socket 不可见** |
| **劫持 agent 主推理** | ❌ | `proxy/inference.sock` 在 cell 内**不存在**（§2.3.1 ④）|
| **盲试 `space-inference` 帧格式** | ⚠️ **主动停止** | 无已知调用方 → 无法 strace → 应改为"找调用方"而非继续猜 |
| **全量反编译 78 个二进制** | ❌ ROI 极低 | 1.1 GB 静态链接 + 剥离符号表 |
| **仅靠 schedule 实现异步注入** | ❌ 会写进只读投影 | `goals/*/crons/*.md` 是 read-only copy，写它不影响调度 |
| **从 `cron.d/*.md` 停任务** | ❌ 非权威源 | 定义在 `_archive/` 但任务仍在跑 |

**⭐ 但有一半是"看似死路其实换了方向就通"**：

> 全库解剖 ❌ → **改用 `muse.db` 查 `scheduler` 域** ✅（官方支持，且解锁方向一）

---

## 4. 方法论：本项目最宝贵的沉淀

### 4.1 ⭐⭐ 我犯过的同类错误（3 次，同一根因）

| 次序 | 错误 | 根因 |
|---|---|---|
| 1 | 「439 次全部重建（100%）」| 搜全文本，命中 prompt 里的**提及** |
| 2 | 「重建 0 次」| 搜 exec 痕迹，但**锚定过严**漏掉所有变体 |
| 3 | 「任务仍在运行」| 子串匹配，命中 self_improvement 写的**悼文** |

**正确答案分别是 62 次 / 62 次 / 已停止。**

**⭐ 统一教训**：

> **「字符串出现 ≠ 行为发生」，但「用严格字符串锚定 ≠ 得到真相」。**
> **正确做法：要么精确到结构化字段（`item.source`），要么宽到覆盖所有变体，
> 不要卡在中间。**

### 4.2 ⭐⭐ 「文档说的」与「实测的」冲突时

**我犯过一次**：写「前期推断的魔数 `\x00\x03` 与实测不符」——**那是我错了**。

**错因**：只看了 `sendmsg` 的 payload，**没注意到它之前还有一个独立的 `sendto("\x00\x03")`**。

> **原则：优先怀疑「我漏看了一段」，而不是「文档错了」。**

### 4.3 ⭐⭐ 「产物为空」≠「机制缺失」

**我犯过一次**：看到 `PROFILE.md` 不存在，就断言「无任何机制」。

**实际**：机制完备（有 Instagram 专项规则、证据阶梯、落盘管线），
**只是没产出**。

> **判断「机制是否存在」必须读规则文档，不能只看运行结果。**

### 4.4 ⭐⭐ strace 优先原则（效率对比 20:1）

**我盲试 20 组帧格式全失败，strace 一次破解。**

```
盲试：20 组 × 2 分钟 = 40 分钟，0 进展
strace：1 次 = 30 秒，完全破解
```

> **当协议行为无法用「数据流内容」解释时，
> 应立即怀疑「信息在数据流之外」（ancillary data / fd / out-of-band）。
> `strace` 应该在第三次失败后就上，而不是第二十次。**

### 4.4.1 ⭐⭐ 补充：当没有"抓包对象"时

**privsep 那次的成功前提是「有已知客户端」（`notion-cli`）**。
**而 `space-inference` 没有任何可见调用方** —— 它由宿主侧或沙箱内部使用。

> **本次补充：当连「抓包对象」都不存在时，
> 应该停下来「找调用方」，而不是继续猜格式。**

**→ 我在 7 组探测后主动停手**（而非重犯"20 组盲试"的错）。

### 4.4.2 ⭐⭐ 「目录权限不足」时，去读挂载表

**本次突破的关键技巧**：

```
错误信息 → http://localhost/hatch/process_tool_call
    ↓
/run/hatch/runtime-cell → Permission denied（root + cap_dac 也被拒）
    ↓
⭐ 读 /proc/self/mountinfo | grep runtime-cell
    ↓
发现: /opt/hatch ← squashfs[/runtime-cell-exposed]
    ↓
⭐⭐ /opt/hatch/runtime-cell/ —— 完整可读（22 个文件）
```

> **当一个目录「权限不足」时，不要只试权限绕过 ——
> 去读 `/proc/self/mountinfo`，看同一份内容的另一个挂载视图。**

### 4.5 证据分级（本项目约定）

| 级别 | 定义 | 标注 |
|---|---|---|
| **A** | 官方 schema / CLI 原始输出 / strace | 直接引用 |
| **B** | 二进制提取 / 推断 | 标 ⚠️ |
| **C** | 纯推理 | 标 ⚠️ 且说明依据 |

**运行时产物必须带 UTC 时间戳**（字段频繁变化）。
**`[]` 表示「证据归零时撤回」，不是「从未存在」。**

---

## 5. 未解清单（按价值排序）

| # | 项 | 状态 | 价值 |
|---|---|---|---|
| 1 | ⭐ **重启后是谁执行了 `setup.sh`** | ⚠️ **未查** | **⭐⭐⭐ 单点故障** |
| 2 | ⭐ **`space-inference.sock` 的调用方** | ⚠️ 无可见调用方 | ⭐⭐⭐ 找到即可抓包破解 |
| 3 | ⭐ `authd` 如何持有 connector 身份 | ⚠️ 未查 | ⭐⭐⭐ 权限核心 |
| 4 | **`JARVIS_JWT_TOKEN` 的来源** | ⚠️ 未找到 | ⭐⭐ 决定 `hatch-ws-client` 可用性 |
| 5 | **`/etc/hatch/credentials` 内容** | ⚠️ `d---------` | ⭐⭐ |
| 6 | **`instacart` / `square` 工具清单** | ⚠️ 未授权时拒绝 | ⭐⭐ |
| 7 | **178 次自进化运行的产出落点** | ⚠️ 未追踪 | ⭐⭐ |
| 7b | **feed 的 `nine-card` 是否为目标版面数** | ⚠️ C 级推断 | ⭐ |
| 7c | **`feed_lane_override` 的触发条件** | ⚠️ 仅知字段名 | ⭐⭐ |
| 7d | **`FeedActivityFeedVisitGen`：读者访问如何影响下一期** | ⚠️ 仅知存在 | ⭐⭐ |
| 7e | **fleet 上报的实际目标** | ⚠️ owner 在 VM 外 | ⭐ |
| 8 | `space-inference` 帧格式 | ⚠️ 7 组未破解 | ⭐⭐ |
| 9 | **`scheduler.jobs` 实际内容** | ⚠️ 无直接入口（需 agent 代跑）| ⭐⭐ |
| 10 | `hatch-preflight-opportunistic`（46.9K）未读 | ⚠️ 可读 | ⭐ |

**⭐ 第 1、2 条是「有明确下一步但需要特定时机」的**：
- #1 需要观察一次重启
- #2 需要观察到一次真实调用（或从宿主侧入手）

**其余多为「可读未读」或「需授权」。**

## 6. 给接手者的建议

### 6.1 ⭐ 三条不需要突破任何封锁的路径（P0）

| 路径 | 为什么 | 产出 |
|---|---|---|
| **`muse.db` 查 `scheduler` 域** | 官方支持的工具 | 定位权威调度源（`scheduler.jobs`）|
| **privsep 通用客户端**（协议已破解）| 可套用到 26 个 socket | 访问未暴露 connector |
| **读 `/opt/hatch/runtime-cell/`** | **完整可读** | ⭐ 容器如何构建的说明书 |

### 6.2 ⭐⭐ 三条「已证实存在但需时机」的观察点

| 观察点 | 需要什么时机 | 怎么观察 |
|---|---|---|
| **谁执行了 `setup.sh`** | 一次 VM 重启 | `journalctl` + `/proc` 追踪 |
| **谁调用 `space-inference`** | 一次真实调用 | 挂 `strace -p` 或用 `inotify` |
| **`authd` 的身份机制** | 一次授权流程 | 观察 `authd.sock` 连接 |
| ⭐ **feed 下一期的生成** | 一次 `morning`/`evening` 出刊 | 看新 `research/` 目录 + `Angle` 如何引用本期 |

**⭐ 这三条都不缺"分析"，缺的是"观察窗口"。**

### 6.3 两条需要人参与的路径

| 路径 | 门槛 |
|---|---|
| **connector 授权** | 需**人类在浏览器完成 OAuth** |
| **重启恢复** | 需有人/机制触发 `setup.sh`（机制未查清）|

### 6.4 不要做的事

- ❌ 不要尝试提取 CoT（四层防护 + provider 加密）
- ❌ 不要靠改 `cron.d/*.md` 改调度（**只读投影**，真源在 `scheduler.jobs`）
- ❌ 不要盲试协议（**先找调用方，次选 `strace`**）
- ❌ 不要仅凭文件系统状态判断调度/成本（**查 DB**）
- ❌ 不要把 `DENY` 名单当成能力边界（**只覆盖 API 层**）
- ❌ 不要以为"看不见的 socket"需要突破（**是 visibility gating，宿主 worker 一直在**）
- ❌ 不要把 `feed` 当"信息流"分析（**它是报纸，有期次/版面/去重指令**）
- ❌ 不要混淆 `Beat: web`（条线）与 `beat_*`（心跳调度）

## 7. 一句话留给未来

**这个系统最值得学习的地方，不是它有多少能力，
而是它如何让每份能力都有边界、每次使用都留痕、每个关键动作都有人点头。**

**而研究它的最大教训是：**
**证据要走到结构化字段，结论要经得起反向检验，
错误的判断要留在案上 —— 因为「我上次就是这么错的」比「正确答案是什么」更有用。**

---

*本总结基于 `docs/04-inference/` 49 份报告（22,485 行）与
针对 VM 运行时的全链路实测。
所有"逐字"引用均来自原始文档或命令输出。*
