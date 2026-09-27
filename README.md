# Meta Muse 智能体运行时逆向研究与工程解密

> ⚡ 88 份深度研究报告 · 36,800+ 行实测解密 · 56 个工具与 86 个 privsep 套接字协议破解 · 43 个商业化 Ideas 资产

本项目采用现代 Web 形式（VitePress）分批公开发布 Meta Muse 自治智能体运行时的逆向勘察与工程落地全记录。

- 🌐 **在线专栏**：[https://kyc.github.io/muse-research/](https://kyc.github.io/muse-research/)
- 🗺️ **五大发布批次**：
  - **Batch 1（破局篇 · 已发布）**：运行时架构真相、推翻物理封锁、0x46 套接字底层逆向、常驻 Slack 桥接落地
  - **Batch 2（交互篇 · 预告中）**：Feed 个人定制报纸机制、Proactive Idea Agent 双读者架构
  - **Batch 3（商业篇 · 预告中）**：Take Rate 交易抽成变现模型（3%~25%）、16 环电商全生命周期、43 个商业 Ideas 卡片库
  - **Batch 4（进化篇 · 预告中）**：11 条自进化管线、Warm Dream 夜间反思 DAG、Goals 双轨系统、Bandit 强化学习底座
  - **Batch 5（防御篇 · 预告中）**：Postgres 全库被否说明、调度源探查、23 项审核台账与 10 类反模式防御指南

## 本地运行

```bash
# 安装依赖
pnpm approve-builds --all && pnpm install

# 本地实时预览
pnpm run dev

# 静态构建
pnpm run build
```

## 自动化部署

仓库已内置 `.github/workflows/deploy.yml`。每次推送到主分支时，GitHub Actions 将自动构建并发布至 GitHub Pages。
