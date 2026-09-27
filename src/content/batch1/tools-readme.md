# 工具与工程脚本（Tools & Operational Scripts）

> [← 返回文档根索引](/content/batch1/tools-readme) · [一页速览](/content/batch1/overview)

本目录包含用于与 Muse 运行时进行交互、底层协议桥接、公网暴露、常驻服务及管线监控的工程级脚本。

---

## 脚本清单

| 脚本文件 | 语言/环境 | 规模 | 运行形态 | 用途与操作说明 |
|---|---|---|---|---|
| ``bridge-client.py`` | Python 3.10+ (标准库) | 176 行 | CLI 命令行工具 | **privsep 协议底层通信客户端**：封装 `0x46` 魔数握手、Unix 套接字 `SCM_RIGHTS` 文件描述符传递与 JSON 数据流交互，支持直接命令行调用任意工具 |
| ``muse-api.py`` | Python 3.10+ (标准库) | 248 行 | HTTP 守护进程 | **HTTP REST API 桥接网关**：内置 Bearer Token 鉴权中间件，提供 `/health`、`/tools`、`/help/<tool>` 与 `/call` 路由端点 |
| ``watch-shopping-pipeline.sh`` | Bash | 182 行 | 监控工具 | **Shopping 自进化管线监控脚本**：实时捕获 ShoppingJudge 执行事件、会话文件变更并输出审计对账流水 |

---

## 使用范例



### 2. 本地直接调用 privsep 工具
```bash
python3 docs/tools/bridge-client.py web-search "Meta Muse" --max-results 3
```

### 3. 启动 HTTP API 桥
```bash
python3 docs/tools/muse-api.py --port 18080 --key "<YOUR_SECRET_KEY>"
```



### 5. 运行 Shopping 管线监控（单次扫描模式）
```bash
docs/tools/watch-shopping-pipeline.sh --once
```
