# AGENTS.md

给在本仓库工作的 AI 编码助手的说明。面向用户的介绍见 [README.md](README.md)。

## 项目背景

- 仓库主人是 ICT 策略交易者，正在学习《Trade Psychology & Effective Journaling》，也在学自然交易理论、RSI 等。
- 仓库内容：**交易数据**（`journal/`）、**学习资料**（`notes/`，含导师资料 `notes/mentors/`）、**仪表盘代码**（`src/`）、**脚本**（`scripts/`）、**导师 skill**（`.claude/skills/keyshot-mentor/`）、**本地数据**（`data/`，gitignore）。
- 与用户交流、写文档和界面文案都用**中文**；ICT 术语保留英文原文（FVG、Order Block、Killzone、DOL、Silver Bullet 等）。

## 常用命令

```bash
pnpm dev             # 开发服务器
pnpm test            # vitest 单元测试（src/lib/*.test.ts、scripts/diagrams/*.test.ts）
pnpm typecheck       # tsc --noEmit
pnpm build           # 类型检查 + vite build
pnpm new:trade NQ    # 按模板新建交易
pnpm new:day         # 按模板新建当日日志
pnpm trade:chart <id># 用 Binance 公开 K 线生成交易复盘图到 journal/screenshots/
pnpm diagrams        # 由 scripts/diagrams/ict.ts 生成 notes/ict/img/*.svg
pnpm mentor:collect  # 生成 X 采集脚本（会覆盖用户剪贴板）
pnpm mentor:ingest   # 合并采集结果到 data/，生成 digest 清单
```

改动代码后至少跑 `pnpm typecheck && pnpm test`。

## 架构

- 没有后端也没有数据库。`src/lib/load.ts` 在构建时用 `import.meta.glob` 读取 `journal/**/*.md` 和 `notes/**/*.md`。
- 数据流：Markdown → `parse.ts`（解析 frontmatter，计算 `rMultiple`、`plannedRR`、`outcome`）→ `stats.ts`（纯函数统计）→ `pages/` 渲染。
- 路由是 `src/lib/router.ts` 里的极简 hash 路由（`#/trades/:id`、`#/notes/...`），不要引入 react-router。
- 图表用手写 SVG（`EquityChart`、`RHistogram`），不要引入图表库。
- 样式集中在 `src/styles.css`，颜色用 CSS 变量，同时支持浅色和深色模式。盈利 = 蓝色（`--pos`），亏损 = 红色（`--neg`），数字始终带 +/- 号。
- 部署：push 到 `main` 触发 `.github/workflows/deploy.yml`，测试 + 构建后发布到 GitHub Pages；`vite.config.ts` 的 `base` 由 CI 的 `BASE_PATH` 设为 `/trading-journal/`。

## 数据约定

- 数据模型以 `src/types.ts` 为准。新增字段时，要同步改 `types.ts`、`journal/templates/trade.md`（或 `day.md`）、`README.md` 的字段表；需要参与统计的，还要改 `stats.ts` / `Dashboard.tsx` 的 `DIMENSIONS`。
- **所有统计以 R 为单位**：`R = (exit - entry) / |entry - stop|`，空单取反；手填的 `r` 优先。`|R| < BREAKEVEN_THRESHOLD`（0.1）为保本。
- 胜率**不含保本单**；只有 `status: closed` 进入统计；`missed` 单独统计；`open` 忽略。
- 交易文件名：`journal/trades/YYYY/YYYY-MM-DD-<symbol小写>-NN.md`，文件名（不含扩展名）即交易 id。
- 新增或修改指标时，同步更新 `docs/STATS.md` 的公式和解读，并在 `stats.test.ts` 补测试。
- 交易复盘图：`scripts/trade-chart/build.ts` 复用 `scripts/diagrams/render.ts`（`step`、`xLabels`、`yAxis` 选项）。需要判断的标注写在 `journal/charts/<id>.json`，标注必须基于实际拉取的 K 线数据，不要凭印象画；生成的 SVG 不要手改。行情数据只用公开接口，不涉及任何账户或密钥。
- `mistakes` 标签和 `emotions` 情绪词以 `notes/psychology/05-mistakes.md`、`02-emotions.md` 为准，分析或补录日志时使用这些统一名称。

## 笔记约定

- `notes/<主题>/` 下用数字前缀控制顺序（`00-overview.md` 为目录页），第一行 `# 标题` 即导航名。
- 笔记之间用相对路径链接（`./02-liquidity.md`、`../ict/checklist.md`）；仪表盘会在站内跳转，指向仓库其他文件的链接会打开 GitHub。
- 笔记插图用相对路径引用（`![说明](./img/fvg.svg)`），仪表盘会自动解析。
- K 线示意图由 `scripts/diagrams/` 生成：在 `ict.ts` 里改 OHLC 和标注，然后运行 `pnpm diagrams`，不要手改生成的 SVG。`diagrams.test.ts` 会检查 OHLC 是否合法。
- 新主题目录需要在 `src/pages/Notes.tsx` 的 `CATEGORY_LABELS` 里加中文名。
- `notes/psychology/course-notes.md` 是用户自己的课程笔记，不要代写课程内容；其余通用笔记不是课程摘录，不要声称出自该课程。

## 导师 skill 与同步

- `.claude/skills/keyshot-mentor/`：以 `notes/mentors/keyshotvv/` 的规则为标准点评日志、分析行情、布置练习、更新导师资料。具体流程以 SKILL.md 为准。
- 导师资料只保存转述和原帖链接，不存档原文；新增的引用必须来自 `data/mentors/*/posts.json` 或 digest 中的真实链接，不要编造对方观点。
- 不以第一人称冒充被引用的交易员。
- 同步流程：`pnpm mentor:collect` → 用户在已登录 X 的浏览器的「帖子」页（`x.com/<handle>`）和「回复」页（`/with_replies`）分别运行脚本并下载 JSON（两页内容不重叠，只采回复页会漏掉全部原创推文） → `pnpm mentor:ingest` → 按 skill 的「更新导师资料」提炼，并在 `00-profile.md` 的「更新记录」追加一行。
- `scripts/mentor-sync/`：`collector.js` 是浏览器端模板（`__HANDLE__` 等占位符由 `collect.ts` 替换），依赖 X 的 DOM（`article[data-testid="tweet"]`、`time`、`tweetText`）；采集为 0 条时优先检查这些选择器。长帖在时间线上会被截断（`tweet-text-show-more-link`），脚本滚动结束后会用 `history.pushState` 站内跳到原帖页按开头文字匹配补全，失败的仍记为 `truncated`。`store.ts` 存储与 `nextSince`，`ingest.ts` 合并、去重并生成 `digest-YYYYMMDD-HHMM.md`。
- 用户已授权：说「更新导师资料」时，由 AI 用浏览器工具完成采集 + 下载 + 同步全流程，下载采集脚本生成的 `<handle>-posts/replies-YYYY-MM-DD.json` 不需要再询问。授权只覆盖这类采集结果文件，下载其他文件仍要先问。

## 边界

- `journal/` 下全部是用户的真实交易记录（示例数据已移除）。除非用户明确要求，**不要修改、删除或批量改写**交易和日志文件。
- 不要编造交易数据或统计结果。分析交易时只依据文件内容，缺失的字段如实说明。
- 不提供个性化投资建议，也不替用户下单。可以做的是：基于日志数据做统计、复盘，指出执行和纪律上的问题。
- 学习笔记（`notes/`）由用户整理，补充内容前先确认，不要覆盖用户原有笔记。
- 不要提交 `dist/`、`node_modules/`、`data/`；只有用户要求时才 commit。
