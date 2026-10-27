# AGENTS.md

给在本仓库工作的 AI 编码助手的说明。面向用户的介绍见 [README.md](README.md)。

## 项目背景

- 仓库主人是 ICT 策略交易者，正在学习《Trade Psychology & Effective Journaling》，也在学自然交易理论、RSI 等。
- 仓库有三种内容：**交易数据**（`journal/`）、**学习资料**（`notes/`）、**仪表盘代码**（`src/`）。
- 与用户交流、写文档和界面文案都用**中文**；ICT 术语保留英文原文（FVG、Order Block、Killzone、DOL、Silver Bullet 等）。

## 常用命令

```bash
pnpm dev          # 开发服务器
pnpm test         # vitest 单元测试（src/lib/*.test.ts）
pnpm typecheck    # tsc --noEmit
pnpm build        # 类型检查 + vite build
pnpm new:trade NQ # 按模板新建交易
pnpm new:day      # 按模板新建当日日志
```

改动代码后至少跑 `pnpm typecheck && pnpm test`。

## 架构

- 没有后端也没有数据库。`src/lib/load.ts` 在构建时用 `import.meta.glob` 读取 `journal/**/*.md` 和 `notes/**/*.md`。
- 数据流：Markdown → `parse.ts`（解析 frontmatter，计算 `rMultiple`、`plannedRR`、`outcome`）→ `stats.ts`（纯函数统计）→ `pages/` 渲染。
- 路由是 `src/lib/router.ts` 里的极简 hash 路由（`#/trades/:id`、`#/notes/...`），不要引入 react-router。
- 图表用手写 SVG（`EquityChart`、`RHistogram`），不要引入图表库。
- 样式集中在 `src/styles.css`，颜色用 CSS 变量，同时支持浅色和深色模式。盈利 = 蓝色（`--pos`），亏损 = 红色（`--neg`），数字始终带 +/- 号。

## 数据约定

- 数据模型以 `src/types.ts` 为准。新增字段时，要同步改 `types.ts`、`journal/templates/trade.md`（或 `day.md`）、`README.md` 的字段表；需要参与统计的，还要改 `stats.ts` / `Dashboard.tsx` 的 `DIMENSIONS`。
- **所有统计以 R 为单位**：`R = (exit - entry) / |entry - stop|`，空单取反；手填的 `r` 优先。`|R| < BREAKEVEN_THRESHOLD`（0.1）为保本。
- 胜率**不含保本单**；只有 `status: closed` 进入统计；`missed` 单独统计；`open` 忽略。
- 交易文件名：`journal/trades/YYYY/YYYY-MM-DD-<symbol小写>-NN.md`，文件名（不含扩展名）即交易 id。
- 新增或修改指标时，同步更新 `docs/STATS.md` 的公式和解读，并在 `stats.test.ts` 补测试。

## 边界

- `journal/` 下是用户的真实交易记录。除非用户明确要求，**不要修改、删除或批量改写**交易和日志文件；`_example/` 示例数据可以按需调整。
- 不要编造交易数据或统计结果。分析交易时只依据文件内容，缺失的字段如实说明。
- 不提供个性化投资建议，也不替用户下单。可以做的是：基于日志数据做统计、复盘，指出执行和纪律上的问题。
- 学习笔记（`notes/`）由用户整理，补充内容前先确认，不要覆盖用户原有笔记。
- 不要提交 `dist/`、`node_modules/`；只有用户要求时才 commit。
