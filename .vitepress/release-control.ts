export interface BatchDefinition {
  id: number;
  key: string;
  name: string;
  title: string;
  tagline: string;
  status: 'published' | 'upcoming';
  releaseDate: string;
  summary: string;
  highlights: string[];
  docsCount: number;
}

export const RELEASE_BATCHES: Record<string, BatchDefinition> = {
  batch1: {
    id: 1,
    key: 'batch1',
    name: '第一批 · 破局篇',
    title: '运行时架构真相与 Privsep 底层突破',
    tagline: '推翻物理封锁假设，直面 visibility gating 门禁与 0x46 套接字全双工穿透',
    status: 'published', // ⭐ 首发完全公开
    releaseDate: '2026-09-27',
    summary: '系统性解密 Meta Muse 运行时的真实架构底座：证明容器内直连公网真实 IP 可通、出网受控于 DNS 劫持与强制代理；全面解剖 /opt/hatch/runtime-cell/，确立隐藏二进制为可见性门禁；通过底层逆向攻破 privsep 套接字协议（0x46 单字节 + SCM_RIGHTS 描述符传递），实测 26 个未暴露 socket 直连可用，并成功落地生产常驻 Slack ↔ privsep 全双工桥接服务。',
    highlights: [
      '推翻物理封锁：证实网络直连真实 IP 可达，封锁机制为 DNS 劫持 + 强制代理',
      'runtime-cell 解剖：/opt/hatch/runtime-cell/ 22 个启动脚本全景逆向，定性 visibility gating 门禁',
      '0x46 协议破解：privsep 底层双层 JSON + SCM_RIGHTS 传输序列实证',
      '31 个未暴露 Socket：实测 26 个可直接穿透调用（含 Shopify 24 工具与 Slack MCP 指令集）',
      '生产级工程闭环：常驻守护进程 slack-bridge-daemon.py 与 systemd 服务落地'
    ],
    docsCount: 15
  },
  batch2: {
    id: 2,
    key: 'batch2',
    name: '第二批 · 交互篇',
    title: '突破被动响应：Muse 原生五大 Tab 与主动式 Idea Agent',
    tagline: '告别问答框与信息流：个人定制报纸 Feed 与 Proactive Proposal 智能体范式',
    status: 'upcoming', // 🔒 预告锁定
    releaseDate: '2026-10-04 (计划中)',
    summary: '解密 Meta AI 如何重塑智能体交互形态：告别无脑瀑布流，推出具备主编（EIC）去重记忆的专属个人定制报纸（Feed）；突破传统被动响应模式，确立机器主动发起提案的 Proactive Idea Agent 范式与 The Wall 双读者隔离法典；解密 Library 资产制品文档、动态网页与全栈应用的几何视觉双重门禁机制。',
    highlights: [
      'Feed 报纸哲学：28 期历史实机报纸逆向，主编去重模型，有记忆、知节制',
      'Proactive Proposal 智能体范式：从被动等待用户唤醒，演进为主动作出承诺提议',
      'The Wall 双读者法典：前台第一人称单信号能力表达 vs 后台物理判据与瞬态 Worker',
      'Library 双重门禁：几何布局与视觉渲染双重校验，全栈交互制品带外投送'
    ],
    docsCount: 8
  },
  batch3: {
    id: 3,
    key: 'batch3',
    name: '第三批 · 商业篇',
    title: '去广告化商业内核：交易抽成（Take Rate 3%~25%）与 43 个商业 Ideas',
    tagline: '从注意力流量变现向 Agent 自治履约交易佣金范式跃迁',
    status: 'upcoming', // 🔒 预告锁定
    releaseDate: '2026-10-11 (计划中)',
    summary: '首次完整揭密 Meta AI 在无广告愿景下的核心变现支柱：依靠智能体自治履约的交易抽成（Take Rate 3%~25%）取代传统广告流量；穿透 16 环节全生命周期（议价、全到手价比价、双模履约追踪、11 步退货合规与售后追偿）；解密 Shopify UCP 跨域协议与 Stripe Link / Shop Pay 双钱包支付安全体系；全量公开 43 个商业化 Ideas 独立解密卡片库。',
    highlights: [
      '商业支柱总纲：五大工程线索复盘，去广告化时代 Meta AI 商业内核',
      '16 环全生命周期大贯穿：意图路由、议价、双模履约追踪、退货合规状态机、售后追偿',
      '双钱包与支付信封：Stripe Link / Shop Pay，Agent 永不接触银行卡明文信息',
      '43 个商业 Ideas 规范卡片库：涵盖零售、差旅、无主资产申报、DMV 跑腿等 8 大领域'
    ],
    docsCount: 15
  },
  batch4: {
    id: 4,
    key: 'batch4',
    name: '第四批 · 进化篇',
    title: '自我进化的灵魂：11 条进化管线、夜间反思 Warm Dream 与强化学习底座',
    tagline: '写者不自评、确定性代码晋级与 Bandit 统计测量驱动的自主演化闭环',
    status: 'upcoming', // 🔒 预告锁定
    releaseDate: '2026-10-18 (计划中)',
    summary: '系统性还原 Meta Muse 智能体的持续自我演化引擎：深度解密 11 条自进化管线；阐明“写者不自评、独立审查判定、确定性代码晋级、默认不作为”四大工程原则；解构夜间反思机制 Warm Dream 26 步 DAG 管线；剖析基于多臂老虎机（Bandit）的强化学习数据底座与方差缩减；揭示 Goals 长期目标系统（user_goal vs assistant_tracking）与 6h 调和总线。',
    highlights: [
      '自进化总纲与四大原则：写者不自评，确定性代码晋级，默认不作为是一等公民',
      'Warm Dream 夜间反思：26 步 DAG 管线，四大写作法则与 646 会话拓扑扫描',
      'Bandit 数据底座：三张核心表 SQL，双通道奖励回流与 384 维图标向量',
      'Goals 长期目标系统：双轨目标模型，21 个底层 RPC 工具与 6h 脉冲调和'
    ],
    docsCount: 13
  },
  batch5: {
    id: 5,
    key: 'batch5',
    name: '第五批 · 防御篇',
    title: '安全攻防路线图、否定性结论与 10 类反模式防御指南',
    tagline: '在安全与逆向工程中，确认“什么路走不通”与“什么路可行”具有同等的核心价值',
    status: 'upcoming', // 🔒 预告锁定
    releaseDate: '2026-10-25 (计划中)',
    summary: '公开全部攻防探索复盘与防御性成果：深度剖析方向三（PostgreSQL 全库解剖）被否定的技术成因与防御意义；揭露 cron 表的只读伪权威与调度源真相；发布 23 项事实审核台账与 10 类认知防御规则；公开 Sentinel 490 键权限字典与 PostgreSQL 17 个 Schema / 195 张数据表映射。',
    highlights: [
      '方向三被否详细说明：无本地数据库实证，muse.db 四层硬防护与经验沉淀',
      '调度源实证探查：cron 伪权威定性，scheduler.* 控制面持久链路',
      '23 项报告审核台账：纠正 4 项高危论断（含 SEV-SNP 证明方向反转），沉淀 10 类防御规则',
      '参考字典全景：Sentinel 490 键权限字典与 Postgres Schema 字典'
    ],
    docsCount: 16
  }
};
