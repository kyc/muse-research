---
layout: home

hero:
  name: "Meta Muse 逆向与工程解密"
  text: "自治智能体运行时深度逆向报告"
  tagline: "88 份深度报告 · 36,800+ 行实测解密 · 56 个工具与 86 个 privsep 套接字协议破解 · 43 个商业化 Ideas 资产"
  actions:
    - theme: brand
      text: 🚀 开始阅读第一批 · 破局篇
      link: /content/batch1/overview
    - theme: alt
      text: 🗺️ 查阅五大分批发布路线图
      link: /roadmap

features:
  - icon: ⚡
    title: 运行时物理架构与真相
    details: 推翻物理封锁假设，实证出网机制为 DNS 劫持与强制代理；解剖 /opt/hatch/runtime-cell/，确立 visibility gating 门禁机制。
  - icon: 🔌
    title: privsep 套接字协议逆向
    details: 逆向破解 0x46 单字节握手与 SCM_RIGHTS 传输协议，实测 26 个未暴露 socket 直连可用，实现跨沙箱本地 API 与工具直通。
  - icon: 📰
    title: 原生五大 Tab 与主动式智能体
    details: 揭秘配有主编（EIC）的个人定制报纸 Feed 系统；突破被动模式，建立 Proactive Idea Agent 范式与 The Wall 双读者法典。
  - icon: 💰
    title: 交易抽成（Take Rate）变现
    details: 解构去广告化时代 Meta AI 商业支柱，贯穿 16 环全生命周期、Shopify UCP 跨域协议与 Stripe Link / Shop Pay 双钱包闭环。
  - icon: 🧬
    title: 自我进化机器（11 条管线）
    details: 写者不自评、确定性代码晋级、默认不作为；解密 Warm Dream 26 步夜间反思 DAG、Goals 双轨目标与 Bandit 数据底座。
  - icon: 🛡️
    title: 认知防御与否定性结论
    details: 完整记录 Postgres 全库被否与 cron 伪权威实证；公开 23 项事实审核台账与 10 类反模式防御规则。
---

<script setup>
import { withBase } from 'vitepress'
</script>

## 📅 分批发布计划（The 5 Release Drops）

本项目成果体量庞大，按知识逻辑解构为五大独立主题专栏，采用渐进式节奏公开发布：

<div class="custom-card-grid">

  <div class="batch-card">
    <div class="batch-header">
      <span class="batch-title">第一批 · 破局篇</span>
      <span class="vp-badge-published">已发布 · 首发</span>
    </div>
    <div class="batch-tagline">运行时架构真相与 Privsep 底层突破</div>
    <div class="batch-desc">
      推翻物理封锁假设，揭示 visibility gating 门禁与 0x46 套接字直通；实证 26 个未暴露 socket 协议细节与工程工具链路。
    </div>
    <div class="batch-meta">
      <span>收录 13 篇深度报告</span>
      <a :href="withBase('/content/batch1/overview')">立即阅读 →</a>
    </div>
  </div>

  <div class="batch-card locked">
    <div class="batch-header">
      <span class="batch-title">第二批 · 交互篇</span>
      <span class="vp-badge-upcoming">🔒 预告锁定</span>
    </div>
    <div class="batch-tagline">Muse 原生五大 Tab 与主动式 Idea Agent</div>
    <div class="batch-desc">
      告别瀑布流与问答框：揭密拥有主编（EIC）去重记忆的个人报纸 Feed 系统；解密 Proactive Proposal 智能体范式与 Library 门禁。
    </div>
    <div class="batch-meta">
      <span>计划公开 8 篇</span>
      <a :href="withBase('/roadmap#batch2')">查阅前瞻预告 →</a>
    </div>
  </div>

  <div class="batch-card locked">
    <div class="batch-header">
      <span class="batch-title">第三批 · 商业篇</span>
      <span class="vp-badge-upcoming">🔒 预告锁定</span>
    </div>
    <div class="batch-tagline">交易抽成（Take Rate 3%~25%）与 43 Ideas 库</div>
    <div class="batch-desc">
      去广告化商业内核：从注意力广告转向交易佣金；解密 16 环全生命周期、Shopify UCP、双钱包安全信封及 43 个商业 Ideas 卡片库。
    </div>
    <div class="batch-meta">
      <span>计划公开 15 篇 + 资产库</span>
      <a :href="withBase('/roadmap#batch3')">查阅前瞻预告 →</a>
    </div>
  </div>

  <div class="batch-card locked">
    <div class="batch-header">
      <span class="batch-title">第四批 · 进化篇</span>
      <span class="vp-badge-upcoming">🔒 预告锁定</span>
    </div>
    <div class="batch-tagline">11 条自进化管线、夜间反思与 Bandit 底座</div>
    <div class="batch-desc">
      写者不自评原则、确定性代码晋级、Warm Dream 夜间反思 26 步 DAG、Goals 双轨目标系统与 Bandit 强化学习统计测量。
    </div>
    <div class="batch-meta">
      <span>计划公开 13 篇</span>
      <a :href="withBase('/roadmap#batch4')">查阅前瞻预告 →</a>
    </div>
  </div>

  <div class="batch-card locked">
    <div class="batch-header">
      <span class="batch-title">第五批 · 防御篇</span>
      <span class="vp-badge-upcoming">🔒 预告锁定</span>
    </div>
    <div class="batch-tagline">攻防路线图、否定性结论与 10 类反模式防御</div>
    <div class="batch-desc">
      确认“走不通的路”同样宝贵：Postgres 全库被否说明、调度源实测探查、23 项事实审核台账与 Sentinel 490 键字典全景。
    </div>
    <div class="batch-meta">
      <span>计划公开 16 篇</span>
      <a :href="withBase('/roadmap#batch5')">查阅前瞻预告 →</a>
    </div>
  </div>

</div>
