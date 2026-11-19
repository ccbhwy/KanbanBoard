# Flux PDCA 周度看板 · 复原说明

从 Copilot Studio（Aether App Builder）项目复原的本地版本。还原了原看板的全部视图，并把
「放入 PDCA → 更新最新 PDCA → 看板刷新」流程内置到了页面里（原版中由 Copilot 会话代劳的部分）。

## 任务视角（轨道）

266 件迁移任务已于 Part5 完结（2026-11-05 结案），看板按任务轨道分为两个视角，页头切换
（URL 参数 `?view=history`，默认当前任务）：

| 视角 | 轨道 `track` | 内容 |
| --- | --- | --- |
| **当前任务**（默认） | `wave1` | Expansion Wave1 脚本作成（実績 vs 予定）、用例自动化筛选（累计/分类内訳）、回归质量（Server/Web/API，两轨道均持续记录） |
| **历史 · 266迁移** | `migration` | 原迁移仪表盘全部内容 + 「已完结」徽章；点击才显示 |

每期报告按内容自动归轨：解析出 Wave1 / 筛选数值即归 `wave1`，否则归 `migration`。
增量（`increment`）等迁移口径只在同轨道内推导；K6 无周度数值，仅进报告备注。

## 启动

```bash
npm install     # 首次
npm run dev     # http://127.0.0.1:5173/
```

生产构建：`npm run build`（产物在 `dist/`），类型检查：`npm run typecheck`。

## 更新 PDCA 数据

页头「**更新 PDCA**」按钮：

1. 拖入 / 选择周报文档，或直接粘贴报告文本
2. 系统解析出报告期字段（可多期勾选）
3. 点「**更新最新 PDCA**」确认，看板立即刷新，数据保存在浏览器 localStorage

支持格式与识别字段：

| 格式 | 说明 |
| --- | --- |
| `.xlsx` `.xls` `.csv` | 表头表格式（报告期末/阶段/累计/总量/完成率/剩余/新增/Selenium/Server GUI/Web GUI/API/目标/评估版本/备注）、“标签：值”键值式，或**「週次PDCA」版式**（见下） |
| `.pdf` `.txt` `.md` | 按“报告期：… / 累计完成 272/280 / Server GUI 98.9%”等指标行扫描 |
| `.json` | 快照对象或数组（字段名可用中文或 `end/completed/total/server/...`） |

**「週次PDCA」版式**（Flux 自動化評価PDCA 周报的 Sheet1）：识别 `<Ｐ><Ｄ><Ｃ><Ａ>` 表头、
総括定量サマリー（`Flux Server（GUI…）Playwright：266件、通過率 95.6%（実績）/100%（計画）`）、
C 列 KPI 跟踪块与 `Server移行完了率：266/266`。规则：

- Server/Web/API 与用例数取**総括实测值**；C 列 KPI 块若与総括不一致（常为复制残留），
  采用総括并给出警告，供预览时核对。
- 报告期取 期間行終日 与【KPI指標トラッキング】（…時点）中**较晚者**——期間行沿用上期时自动纠正。
- 只取 `<Ｐ><Ｄ><Ｃ><Ａ>` 表头下第一个数据行（今週）；先週及以下旧数据不解析。
- 完成率分母沿用看板口径：Server 移行件数为总量（取 `Server移行完了率` 的分母），新任务扩容时总量随之更新；Selenium 仅在文档有明确指标时提取。
- **阶段与新任务（结构化）**：阶段徽章取本週行中最大编号的 `パートN / PartN`；新任务期无
  パート时显示 `Wave1`。⑮Wave1（`対象ケース総数` / `完了` / `実績%／予定%`）与⑯スクリーニング
  （`実績／全体：506/1989`、`今週新規スクリーニング：120件（計画120件）`、
  `自動化済み／自動化可能／除外` 内訳）提取为**结构化字段**，同时拼入报告备注。
- **D 列优先**：Wave1 数值取 D 列（今週実績）；C 列確認块与其不一致（常为复制残留，
  如 2026-11-19 文件 C 列「完了3件」实为上期值）时采用 D 列并警告，供预览时核对。
- **「自动化筛选进度」表优先**：workbook 内该 sheet 的 KPI 块（累计已筛选/总量、本周新增）
  与分类表（已有自动化/可自动化/排除）为生成源，数值与正文冲突时以表为准并警告；
  筛选数值会合并进同 workbook 的最新一期。

派生规则与内置数据一致：`increment`（仅迁移轨道）、`完成率`、`剩余`、`serverDelta` 自动计算；
目标线 / 用例数 / 版本缺省时沿用上一报告期；「未提供」的指标不补零。
同一报告期末（`end`）再次导入会**替换**该期；其余为新增。

「恢复内置数据」一键清除导入记录，回到出厂基线（迁移 13 期截至 2026-11-05 + Wave1 首期
2026-11-19，共 14 期）。

## 代码结构（本次复原涉及）

- `src/data/pdca.ts` — 内置基线数据（迁移 13 期 + Wave1 首期，共 14 期）
- `src/data/pdca-store.ts` — 快照存储：基线 + localStorage 导入合并、`track` 归轨、同轨道 prev 推导、`usePdcaSnapshots()` 订阅
- `src/lib/pdca-parse.ts` — 文档解析（xlsx/csv/pdf/文本/JSON → ParsedDraft；含 Wave1/筛选提取与「自动化筛选进度」表解析）
- `src/components/pdca-update-dialog.tsx` — 上传/粘贴 → 解析预览（含新任务 chip）→ 确认更新
- `src/components/dashboard-current.tsx` — 当前任务视角（Wave1/筛选/回归质量）
- `src/components/dashboard-history.tsx` — 历史归档视角（迁移仪表盘 + 完结徽章）
- `src/components/quality-section.tsx` — 两视角共享的回归质量段
- `src/lib/pdca-chart.ts` — 两视角共享的图表常量
- `src/components/ui/*` — 复原缺失的 shadcn 组件（button/select/chart/collapsible/alert-dialog/dialog/skeleton/sonner）
- `src/pages/home.tsx` — 看板页容器（视角切换 + 按 track 过滤报告期）

测试样例在 `../samples/`（xlsx + 文本各一份），`dev-samples/` 供开发期解析实测。
解析回归验证：`node node_modules/jiti/lib/jiti-cli.mjs ../scripts/test-wave1-parse.ts`
（直跑真实 TS 解析器，断言 20261119/20261112 两期 Wave1/筛选数值与旧样例归轨）。
