import { defineConfig } from 'vitepress';
import { RELEASE_BATCHES } from './release-control';

export default defineConfig({
  title: 'Meta Muse 逆向与工程解密',
  description: '对 Meta Muse 自治智能体运行时的系统性逆向勘察、协议破解与工程落地全记录',
  base: process.env.BASE_URL || '/muse-research/',
  srcDir: 'src',
  lang: 'zh-CN',
  cleanUrls: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#0070f3' }]
  ],

  themeConfig: {
    siteTitle: 'Muse Reverse Lab',
    logo: '⚡',

    nav: [
      { text: '首页', link: '/' },
      { text: '发布路线图 (5 Drops)', link: '/roadmap' },
      {
        text: '第一批 · 破局篇',
        items: [
          { text: '速览：全局大地图', link: '/content/batch1/overview' },
          { text: '物理架构与容器边界', link: '/content/batch1/architecture-overview' },
          { text: '出网真相与 runtime-cell 解剖', link: '/content/batch1/runtime-cell-and-egress-truth' },
          { text: 'privsep 协议底层逆向突破', link: '/content/batch1/privsep-protocol-and-unexposed-sockets' },
          { text: '工程工具与 API 桥接网关', link: '/content/batch1/tools-readme' }
        ]
      },
      {
        text: '预告批次',
        items: [
          { text: '第二批 · 交互篇 (即将发布)', link: '/roadmap#batch2' },
          { text: '第三批 · 商业篇 (即将发布)', link: '/roadmap#batch3' },
          { text: '第四批 · 进化篇 (即将发布)', link: '/roadmap#batch4' },
          { text: '第五批 · 防御篇 (即将发布)', link: '/roadmap#batch5' }
        ]
      }
    ],

    sidebar: {
      '/content/batch1/': [
        {
          text: '⭐ 第一批 · 破局篇 (已发布)',
          items: [
            { text: '一页速览 (OVERVIEW)', link: '/content/batch1/overview' },
            { text: '系统总纲：给未来接手者的地图', link: '/content/batch1/research-summary' }
          ]
        },
        {
          text: '一、系统物理架构与边界',
          items: [
            { text: '容器拓扑与存储持久化', link: '/content/batch1/architecture-overview' },
            { text: '只读 squashfs 资产与二进制分类学', link: '/content/batch1/opt-hatch-deep-dive' },
            { text: 'authd 认证代理与 privsep 通路', link: '/content/batch1/architecture-deep-dive' },
            { text: '65 个 Rust Crate 与 Serde 协议', link: '/content/batch1/code-and-protocol' }
          ]
        },
        {
          text: '二、出网真相与运行时解密',
          items: [
            { text: '⭐ runtime-cell 解剖：推翻物理封锁', link: '/content/batch1/runtime-cell-and-egress-truth' },
            { text: '后台急切上下文压缩机制', link: '/content/batch1/context-compaction-deep-dive' },
            { text: '智能体中断恢复与自愈断言链', link: '/content/batch1/runtime-restart-and-recovery' },
            { text: 'Web Chat 三跳链路与 Noise 握手', link: '/content/batch1/web-chat' },
            { text: '能力边界与封锁机制分析', link: '/content/batch1/limits' }
          ]
        },
        {
          text: '三、套接字逆向与底层协议突破',
          items: [
            { text: '⭐ 0x46 协议逆向与 26 直连 Socket', link: '/content/batch1/privsep-protocol-and-unexposed-sockets' },
            { text: '工程工具与 API 桥接网关', link: '/content/batch1/tools-readme' }
          ]
        }
      ],
      '/roadmap': [
        {
          text: '发布路线图',
          items: [
            { text: '分批全景总览', link: '/roadmap' },
            { text: '第一批 · 破局篇 (已解锁)', link: '/roadmap#batch1' },
            { text: '第二批 · 交互篇 (预告)', link: '/roadmap#batch2' },
            { text: '第三批 · 商业篇 (预告)', link: '/roadmap#batch3' },
            { text: '第四批 · 进化篇 (预告)', link: '/roadmap#batch4' },
            { text: '第五批 · 防御篇 (预告)', link: '/roadmap#batch5' }
          ]
        }
      ]
    },

    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                noResultsText: '未找到相关结果',
                resetButtonTitle: '清除搜索条件',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭'
                }
              }
            }
          }
        }
      }
    },

    footer: {
      message: '基于实测数据与二进制分析 · 零废话硬核逆向',
      copyright: 'Copyright © 2026 Muse Reverse Research Lab'
    }
  }
});
