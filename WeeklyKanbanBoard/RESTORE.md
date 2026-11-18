# Flux PDCA 周度看板 · 复原说明

从 Copilot Studio（Aether App Builder）项目复原的本地版本。还原了原看板的全部视图，并把
「放入 PDCA → 更新最新 PDCA → 看板刷新」流程内置到了页面里（原版中由 Copilot 会话代劳的部分）。

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
- 完成率分母沿用看板口径：Server 移行 266 件为总量；Selenium 仅在文档有明确指标时提取。

派生规则与内置数据一致：`increment`、`完成率`、`剩余`、`serverDelta` 自动计算；
目标线 / 用例数 / 版本缺省时沿用上一报告期；「未提供」的指标不补零。
同一报告期末（`end`）再次导入会**替换**该期；其余为新增。

「恢复内置数据」一键清除导入记录，回到出厂基线（截至 2026-11-05，13 期）。

## 代码结构（本次复原涉及）

- `src/data/pdca.ts` — 内置基线数据（13 期，未改动）
- `src/data/pdca-store.ts` — 快照存储：基线 + localStorage 导入合并、`usePdcaSnapshots()` 订阅
- `src/lib/pdca-parse.ts` — 文档解析（xlsx/csv/pdf/文本/JSON → ParsedDraft）
- `src/components/pdca-update-dialog.tsx` — 上传/粘贴 → 解析预览 → 确认更新
- `src/components/ui/*` — 复原缺失的 shadcn 组件（button/select/chart/collapsible/alert-dialog/dialog/skeleton/sonner）
- `src/pages/home.tsx` — 看板页（改为从 store 读取，视图逻辑与原版一致）

测试样例在 `../samples/`（xlsx + 文本各一份），`dev-samples/` 供开发期解析实测。
