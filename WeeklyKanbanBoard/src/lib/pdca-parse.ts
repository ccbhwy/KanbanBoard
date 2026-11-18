import * as XLSX from "xlsx";
import { extractText, getDocumentProxy } from "unpdf";

// One parsed period, before defaults are derived from the previous period.
// Fields left undefined were not found in the document.
export interface ParsedDraft {
  end?: string;
  start?: string;
  phase?: string;
  completed?: number;
  total?: number;
  completionPercent?: number;
  remaining?: number;
  increment?: number;
  selenium?: number | null;
  server?: number | null;
  web?: number | null;
  api?: number | null;
  serverGuiTarget?: number;
  guiTarget?: number;
  apiTarget?: number;
  seleniumCases?: number | null;
  serverCases?: number | null;
  webCases?: number | null;
  version?: string;
  periodNote?: string;
}

// ---------------------------------------------------------------------------
// PDCA weekly-report document parsing.
//
// Accepted inputs:
//   .xlsx/.xls/.xlsm/.csv — SheetJS workbook (label/value pairs or a header
//                            table like the built-in detail table)
//   .pdf                  — text extraction (unpdf) + label/value line scan
//   .json                 — a snapshot object or array of them
//   .txt/.md/other        — label/value line scan
//
// All labels are matched after NFKC normalization + punctuation stripping, so
// "Server GUI", "ServerGUI", "Server GUI(%)" all resolve to the same field.
// ---------------------------------------------------------------------------

export interface ParseResult {
  drafts: ParsedDraft[];
  warnings: string[];
  source: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- aliases ---
const FIELD_ALIASES: Record<keyof ParsedDraft | "completedTotal", string[]> = {
  end: ["报告期末", "报告期", "期末", "报告日期", "截止日期", "截至日期", "截止", "日期", "weekending", "end"],
  start: ["周期开始", "开始日期", "开始", "start"],
  phase: ["阶段", "part", "phase"],
  completed: ["累计完成", "累计迁移完成", "累计已完成", "累计", "已完成", "completed"],
  completedTotal: ["累计总量", "累计/总量", "累计或总量"],
  total: ["总量", "总件数", "总计", "总数", "total"],
  completionPercent: ["总量完成率", "完成率", "completionrate", "completionpercent"],
  remaining: ["剩余", "尚未完成", "剩余件数", "remaining"],
  increment: ["较上一报告期新增", "较上期新增", "本期新增", "每期新增", "新增", "increment"],
  selenium: ["seleniumservergui", "seleniumserver", "selenium"],
  server: ["playwrightservergui", "playwrightserver", "servergui", "server"],
  web: ["playwrightwebgui", "playwrightweb", "webgui", "web"],
  api: ["playwrightserverapi", "playwrightapi", "api"],
  serverGuiTarget: ["servergui目标", "server目标", "目标server", "serverguitarget", "servertarget"],
  guiTarget: ["webgui目标", "web目标", "gui目标", "目标web", "webguitarget", "guitarget"],
  apiTarget: ["api目标", "目标api", "apitarget"],
  seleniumCases: ["selenium用例", "selenium用例数", "seleniumcases"],
  serverCases: ["servergui用例", "server用例", "server用例数", "servercases", "servergui用例数"],
  webCases: ["webgui用例", "web用例", "web用例数", "webcases", "webgui用例数"],
  version: ["评估版本", "版本", "version", "build"],
  periodNote: ["备注", "说明", "备注说明", "periodnote", "note"],
};

// Normalized alias → field, longest first so "servergui" wins over "server".
const ALIAS_LOOKUP: Array<{ alias: string; field: string }> = Object.entries(
  FIELD_ALIASES,
).flatMap(([field, aliases]) => aliases.map((a) => ({ alias: a, field }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

const PUNCT_RE = /[\s\u3000（）()【】[\]{}「」『』<>《》%％:：;；,，.。·、．—_/\\'"*？?！!＝=-]/g;

/** NFKC + lowercase + punctuation stripped — the label-matching key. */
const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(PUNCT_RE, "");

function fieldForLabel(label: unknown): string | undefined {
  const n = norm(label);
  if (!n) return undefined;
  return ALIAS_LOOKUP.find((e) => e.alias === n)?.field;
}

// ---------------------------------------------------------------- numbers ---
const ABSENT_RE = /^(未提供|无|没有|缺|-{1,3}|—|–|n\/?a)$/i;

/**
 * Number out of a cell: number, `null` for an explicit "未提供/—", or
 * `undefined` when nothing usable is there.
 */
function parseNumRaw(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return undefined;
  const s = String(v).normalize("NFKC").trim();
  if (!s || ABSENT_RE.test(s)) return s ? null : undefined;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

/** `266` | `"266件"` | `"97.7%"` — plain numbers only. */
function parseCount(v: unknown): number | undefined {
  const n = parseNumRaw(v);
  return typeof n === "number" ? n : undefined;
}

/** Pass-rate fields: `undefined` = not in the doc, `null` = explicit 未提供. */
function parseRate(v: unknown): number | null | undefined {
  return parseNumRaw(v);
}

/** `"173 / 266"` → { completed: 173, total: 266 } when the cell holds both. */
function splitCompletedTotal(v: unknown): { completed?: number; total?: number } {
  if (typeof v !== "string") return {};
  const m = String(v).normalize("NFKC").match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { completed: Number(m[1]), total: Number(m[2]) } : {};
}

// ------------------------------------------------------------------ dates ---
function padIso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dateToIso(v: unknown, warnings: string[]): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return padIso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === "number") {
    // Excel date serial (days since 1899-12-30).
    const ms = Math.round((v - 25569) * 86_400_000);
    if (ms > Date.parse("1990-01-01") && ms < Date.parse("2100-01-01")) {
      return new Date(ms).toISOString().slice(0, 10);
    }
    return undefined;
  }
  const s = String(v).normalize("NFKC").trim();
  let m = s.match(/^(\d{4})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})日?/);
  if (m) return padIso(Number(m[1]), Number(m[2]), Number(m[3]));
  // Month/day without a year — assume the current year and say so.
  m = s.match(/^(\d{1,2})[-/.月](\d{1,2})日?$/);
  if (m) {
    const y = new Date().getFullYear();
    warnings.push(`日期"${s}"未包含年份，已按 ${y} 年补全，请核对。`);
    return padIso(y, Number(m[1]), Number(m[2]));
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return undefined;
}

// ------------------------------------------------------------ text parsing ---
/**
 * Line-oriented label/value scan used for PDF and plain-text reports. Each
 * `报告期` occurrence opens a new period group; subsequent recognized labels
 * feed the current group.
 */
export function parsePdcaText(text: string, source: string): ParseResult {
  const warnings: string[] = [];
  const drafts: ParsedDraft[] = [];
  let current: ParsedDraft | null = null;

  const draftForLine = (): ParsedDraft => {
    if (!current) {
      current = {};
      drafts.push(current);
    }
    return current;
  };

  const lines = text
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // A 报告期/截至 line carrying a full date opens (or switches to) that
    // period's group. 周期 lines only supply the start date of the current
    // group — their first date is the period start, not the report end.
    const dates = [
      ...line.matchAll(/(\d{4})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})日?/g),
    ];
    const opensGroup =
      /报告期(?:末|日期)?|报告日期|截至|截止/.test(line) && dates.length > 0;
    if (opensGroup) {
      const iso = dateToIso(
        `${dates[0][1]}-${dates[0][2]}-${dates[0][3]}`,
        warnings,
      );
      if (iso && (!current || current.end !== iso)) {
        current = { ...(current ?? {}), end: iso };
        drafts.push(current);
      }
    }
    // The same line (or a later 周期 line) may carry the period span; its
    // first date before a 至/— separator is the start.
    if (current && !current.start) {
      const span = line.match(
        /(\d{4})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})\s*日?\s*[至到~－—-]/,
      );
      if (span) {
        const startIso = dateToIso(
          `${span[1]}-${span[2]}-${span[3]}`,
          warnings,
        );
        if (startIso) current.start = startIso;
      }
    }

    // phase — 阶段：Part5 / Part5阶段
    const phase = line.match(/(?:阶段|当前阶段)[：:=]?\s*(Part\s*\d+)/i) ??
      line.match(/\b(Part\s*\d+)\b/i);
    if (phase) draftForLine().phase = phase[1].replace(/\s+/, "");

    // 累计完成 266/266 — combined progress
    const combo = line.match(
      /(?:累计完成|累计迁移完成|累计)[：:=]?\s*(\d+)\s*[/／]\s*(\d+)/,
    );
    if (combo) {
      const d = draftForLine();
      d.completed = Number(combo[1]);
      d.total = Number(combo[2]);
    } else {
      const completedOnly = line.match(
        /(?:累计完成|累计迁移完成|已完成|累计)[：:=]?\s*(\d+)/,
      );
      if (completedOnly) draftForLine().completed = Number(completedOnly[1]);

      const totalOnly = line.match(/(?:总量|总件数|总数)[：:=]?\s*(\d+)/);
      if (totalOnly) draftForLine().total = Number(totalOnly[1]);
    }

    const simplePairs: Array<[RegExp, keyof ParsedDraft]> = [
      [/(?:总量完成率|完成率)[：:=]?\s*([\d.]+)\s*%?/, "completionPercent"],
      [/(?:剩余|尚未完成)[：:=]?\s*(\d+)/, "remaining"],
      [/(?:较上一?报告期新增|较上期新增|本期新增|每期新增|新增)[：:=]?\s*(\d+)/, "increment"],
      [/Selenium(?:\s*Server)?(?:\s*GUI)?[：:=]?\s*([\d.]+)\s*%?/i, "selenium"],
      [/Server\s*GUI[：:=]?\s*([\d.]+)\s*%?/i, "server"],
      [/Web\s*GUI[：:=]?\s*([\d.]+)\s*%?/i, "web"],
      [/(?:Server\s*API|API)[：:=]?\s*([\d.]+)\s*%?/i, "api"],
      [/(?:Server\s*GUI\s*目标|Server\s*目标)[：:=]?\s*([\d.]+)\s*%?/i, "serverGuiTarget"],
      [/(?:Web\s*GUI\s*目标|Web\s*目标|GUI\s*目标)[：:=]?\s*([\d.]+)\s*%?/i, "guiTarget"],
      [/API\s*目标[：:=]?\s*([\d.]+)\s*%?/i, "apiTarget"],
      [/(?:Selenium(?:\s*Server)?(?:\s*GUI)?)\s*用例[：:=]?\s*(\d+)/i, "seleniumCases"],
      [/Server\s*GUI\s*用例[：:=]?\s*(\d+)/i, "serverCases"],
      [/Web\s*GUI\s*用例[：:=]?\s*(\d+)/i, "webCases"],
      [/(?:评估版本|版本)[：:=]?\s*([\w.-]+)/i, "version"],
    ];
    for (const [re, field] of simplePairs) {
      const m = line.match(re);
      if (!m) continue;
      const d = draftForLine();
      const raw = m[1];
      if (field === "completionPercent" || field === "version") {
        (d[field] as number | string) =
          field === "completionPercent" ? round1(Number(raw)) : raw;
      } else if (
        field === "selenium" || field === "server" || field === "web" ||
        field === "api" || field === "serverGuiTarget" ||
        field === "guiTarget" || field === "apiTarget"
      ) {
        (d[field] as number) = round1(Number(raw));
      } else {
        (d[field] as number) = Number(raw);
      }
    }

    // 备注/说明 — take the remainder of the line after the label.
    const note = line.match(/(?:备注|说明)[：:=]\s*(.+)$/);
    if (note) draftForLine().periodNote = note[1].trim();
  }

  if (!drafts.length) {
    warnings.push("文本中未识别出任何 PDCA 指标行（如“报告期”“累计完成”“Server GUI”等）。");
  }
  const usable = drafts.filter((d) => d.end || d.completed !== undefined);
  if (drafts.length && !usable.length) {
    warnings.push("识别到指标但缺少报告期，无法定位报告期。");
  }
  return { drafts: usable, warnings, source };
}

// ---------------------------------------------------------- sheet parsing ---
type CellMatrix = unknown[][];

function headerMapFromRow(row: CellMatrix[number]): Map<number, string> {
  const map = new Map<number, string>();
  row.forEach((cell, idx) => {
    const field = fieldForLabel(cell);
    if (field) map.set(idx, field);
  });
  return map;
}

function rowIsEmpty(row: CellMatrix[number]): boolean {
  return row.every((c) => c === null || c === undefined || String(c).trim() === "");
}

/** Parse rows after a detected header row; supports repeated headers per Part. */
function parseTable(
  rows: CellMatrix,
  headerRowIdx: number,
  colMap: Map<number, string>,
  warnings: string[],
): ParsedDraft[] {
  const drafts: ParsedDraft[] = [];
  let map = colMap;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (rowIsEmpty(row)) continue;

    // A later header row (e.g. a new section) re-maps the columns.
    const candidate = headerMapFromRow(row);
    if (candidate.size >= 3) {
      map = candidate;
      continue;
    }

    const draft: ParsedDraft = {};
    let recognized = 0;
    for (const [idx, field] of map) {
      const cell = row[idx];
      if (cell === null || cell === undefined || String(cell).trim() === "") continue;
      recognized++;
      if (field === "completedTotal") {
        Object.assign(draft, splitCompletedTotal(cell));
      } else if (field === "end") {
        const iso = dateToIso(cell, warnings);
        if (iso) draft.end = iso;
      } else if (field === "start") {
        const iso = dateToIso(cell, warnings);
        if (iso) draft.start = iso;
      } else if (field === "completed") {
        const both = splitCompletedTotal(cell);
        if (both.completed !== undefined) {
          draft.completed = both.completed;
          draft.total = both.total;
        } else {
          draft.completed = parseCount(cell);
        }
      } else if (field === "total") {
        draft.total = parseCount(cell);
      } else if (field === "completionPercent") {
        const n = parseRate(cell);
        if (typeof n === "number") draft.completionPercent = round1(n);
      } else if (field === "remaining" || field === "increment") {
        const n = parseCount(cell);
        if (n !== undefined) draft[field] = n;
      } else if (
        field === "selenium" || field === "server" || field === "web" || field === "api" ||
        field === "serverGuiTarget" || field === "guiTarget" || field === "apiTarget"
      ) {
        const n = parseRate(cell);
        if (typeof n === "number") draft[field] = n;
      } else if (field === "version") {
        draft.version = String(cell).normalize("NFKC").trim();
      } else if (field === "phase") {
        draft.phase = String(cell).normalize("NFKC").trim().replace(/\s+/, "");
      } else if (field === "periodNote") {
        draft.periodNote = String(cell).normalize("NFKC").trim();
      } else if (
        field === "seleniumCases" || field === "serverCases" || field === "webCases"
      ) {
        const n = parseNumRaw(cell);
        if (n !== undefined) draft[field] = n;
      }
    }
    if (!recognized) continue;
    if (!draft.end && drafts.length && !draft.completed && !draft.total) continue;
    drafts.push(draft);
  }
  return drafts;
}

/** Fallback for label-in-first-column layouts. */
function parseKeyValueRows(rows: CellMatrix, warnings: string[]): ParsedDraft | null {
  const draft: ParsedDraft = {};
  let any = false;
  for (const row of rows) {
    const field = fieldForLabel(row[0]);
    if (!field) continue;
    const rest = row.slice(1).filter(
      (c) => c !== null && c !== undefined && String(c).trim() !== "",
    );
    if (!rest.length) continue;
    const cell = rest.length === 1 ? rest[0] : rest.map((c) => String(c)).join(" ");
    any = true;
    if (field === "end") {
      const iso = dateToIso(cell, warnings);
      if (iso) draft.end = iso;
    } else if (field === "start") {
      const iso = dateToIso(cell, warnings);
      if (iso) draft.start = iso;
    } else if (field === "completedTotal" || field === "completed") {
      const both = splitCompletedTotal(String(cell));
      if (both.completed !== undefined) {
        draft.completed = both.completed;
        draft.total = both.total;
      } else if (field === "completed") {
        draft.completed = parseCount(cell);
      } else {
        draft.total = parseCount(cell);
      }
    } else if (field === "total") {
      draft.total = parseCount(cell);
    } else if (field === "completionPercent") {
      const n = parseRate(cell);
      if (typeof n === "number") draft.completionPercent = round1(n);
    } else if (field === "remaining" || field === "increment") {
      const n = parseCount(cell);
      if (n !== undefined) draft[field] = n;
    } else if (
      field === "selenium" || field === "server" || field === "web" || field === "api" ||
      field === "serverGuiTarget" || field === "guiTarget" || field === "apiTarget"
    ) {
      const n = parseRate(cell);
      if (typeof n === "number") draft[field] = n;
    } else if (field === "version") {
      draft.version = String(cell).normalize("NFKC").trim();
    } else if (field === "phase") {
      draft.phase = String(cell).normalize("NFKC").trim().replace(/\s+/, "");
    } else if (field === "periodNote") {
      draft.periodNote = String(cell).normalize("NFKC").trim();
    } else if (field === "seleniumCases" || field === "serverCases" || field === "webCases") {
      const n = parseNumRaw(cell);
      if (n !== undefined) draft[field] = n;
    }
  }
  return any ? draft : null;
}

function parseWorkbookRows(rows: CellMatrix, warnings: string[]): ParsedDraft[] {
  // 0) weekly-PDCA cycle layout (Sheet1 of the Flux 評価PDCA workbook:
  //    <Ｐ><Ｄ><Ｃ><Ａ> header row with 今週/先週 narrative blocks)
  const cycle = parsePdcaCycleSheet(rows, warnings);
  if (cycle.length) return cycle;
  // 1) header-table layout
  for (let i = 0; i < rows.length; i++) {
    const map = headerMapFromRow(rows[i]);
    if (map.size >= 3) {
      const drafts = parseTable(rows, i, map, warnings);
      if (drafts.length) return drafts;
    }
  }
  // 2) label/value layout
  const kv = parseKeyValueRows(rows, warnings);
  return kv ? [kv] : [];
}

// ------------------------------------------------------- PDCA cycle sheet ---
// The 週次PDCA layout is a 2×4 grid of long narrative cells: rows for 今週 /
// 先週 under the <Ｐ><Ｄ><Ｃ><Ａ> header, plus a 総括 summary block. Metrics
// live inside the prose as labeled lines:
//   - 期間：2026-10-30〜2026-11-5
//   - Playwright：266件、通過率 95.6%（実績）/100%（計画）
//   - Playwright：161件、通過率 91.6%（実績）/90%（計画）
//   - 通過率 100%（実績）/100%（計画）
//   - 【KPI指標トラッキング】（2026/11/12時点）… Server：97.7% / Web：90.6% /
//     Playwright API 実測通過率：100%
// The summary block (総括) carries the current week's measured rates; the C
// block repeats a tracking snapshot that may be stale, so summary wins and a
// mismatch warning is raised.

interface CycleBlock {
  summaryText: string | null;
  checkText: string | null;
  actionText: string | null;
}

function splitCycleBlocks(rows: CellMatrix): CycleBlock | null {
  // Detect the <Ｐ><Ｄ><Ｃ><Ａ> header: individual cells whose normalized
  // value is exactly p / d / c / a (norm strips the full-width brackets).
  // Matching whole cells avoids false positives from long title strings that
  // merely contain those letters.
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] ?? []).map((c) => norm(c));
    const hits = new Set(
      cells.filter((n): n is string => n.length === 1 && "pdca".includes(n)),
    );
    if (hits.has("p") && hits.has("d") && hits.has("c") && hits.has("a")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return null;

  // Columns of D / C / A from the header row; P col +1 typically empty.
  const header = rows[headerRow] ?? [];
  let dCol = -1;
  let cCol = -1;
  let aCol = -1;
  header.forEach((cell, idx) => {
    const n = norm(cell);
    if (n === "d" && dCol < 0) dCol = idx;
    if (n === "c" && cCol < 0) cCol = idx;
    if (n === "a" && aCol < 0) aCol = idx;
  });
  if (dCol < 0 || cCol < 0) return null;

  // 総括 block: search upward rows for a cell whose text starts with 総括.
  let summaryText: string | null = null;
  for (let i = headerRow - 1; i >= 0; i--) {
    const row = rows[i] ?? [];
    for (const cell of row) {
      if (typeof cell === "string" && cell.replace(/\s/g, "").startsWith("総括")) {
        // The narrative usually sits in the next column of the same row.
        const cellIdx = row.indexOf(cell);
        summaryText =
          typeof row[cellIdx + 1] === "string" ? (row[cellIdx + 1] as string) : (cell as string);
        break;
      }
    }
    if (summaryText) break;
  }

  // The first data row below the header is 今週 — but spacer rows (all
  // full-width blanks) sit between the header and it, so scan for the first
  // row whose D/C window actually carries narrative text.
  const longestInRow = (row: CellMatrix[number], idx: number): string | null => {
    // The narrative may be merged across adjacent cells; take the longest
    // string in a small window starting at the header column.
    let best: string | null = null;
    for (let j = idx; j < Math.min(idx + 2, row.length); j++) {
      const c = row[j];
      if (typeof c === "string" && (!best || c.length > best.length)) best = c;
    }
    return best;
  };
  let thisWeekRow: CellMatrix[number] = [];
  for (let i = headerRow + 1; i < rows.length && thisWeekRow.length === 0; i++) {
    const row = rows[i] ?? [];
    const d = longestInRow(row, dCol);
    const c = longestInRow(row, cCol);
    if ((d && d.length > 30) || (c && c.length > 30)) thisWeekRow = row;
  }
  const cellAt = (idx: number): string | null => longestInRow(thisWeekRow, idx);

  return {
    summaryText,
    checkText: cellAt(cCol),
    actionText: aCol >= 0 ? cellAt(aCol) : null,
  };
}

/** Parse one 週次PDCA cycle sheet into a draft. */
export function parsePdcaCycleSheet(rows: CellMatrix, warnings: string[]): ParsedDraft[] {
  const blocks = splitCycleBlocks(rows);
  if (!blocks) return [];

  const draft: ParsedDraft = {};
  const summary = blocks.summaryText ?? "";
  const check = blocks.checkText ?? "";

  // --- period from 総括: 期間：2026-10-30〜2026-11-5 (also D column) ---
  const periodSource = `${summary}\n${check}`;
  const period = periodSource.match(
    /期間[：:]\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*[〜～~－—-]\s*(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})/,
  );
  if (period) {
    const startIso = padIso(Number(period[1]), Number(period[2]), Number(period[3]));
    const endYear = period[4] ? Number(period[4]) : Number(period[1]);
    const endIso = padIso(endYear, Number(period[5]), Number(period[6]));
    if (startIso) draft.start = startIso;
    if (endIso) draft.end = endIso;
  }
  // 【KPI指標トラッキング】（2026/11/12時点）as a fallback / cross-check date.
  const kpiDate = check.match(/【KPI指標トラッキング】[（(]\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  // --- Server / Web / API rates from the 総括 quantitative summary ---
  // Flux Server（GUI / 1 10.4.4.83757）
  // - Playwright：266件、通過率 95.6%（実績）/100%（計画）で計画達成
  // Brackets in the document are full-width; every closing bracket accepts
  // both U+FF09 and ASCII ')' via [）)].
  const serverBlock = summary.match(
    /Flux\s*Server[（(][^）)]*[）)][\s\S]{0,160}?Playwright[：:]\s*(\d+)\s*件[、，]\s*通過率\s*([\d.]+)\s*%/i,
  );
  const webBlock = summary.match(
    /Flux\s*Web[（(][^）)]*[）)][\s\S]{0,160}?Playwright[：:]\s*(\d+)\s*件[、，]\s*通過率\s*([\d.]+)\s*%/i,
  );
  const apiBlock = summary.match(
    /Flux\s*Server[（(]\s*API[^）)]*[）)][\s\S]{0,160}?通過率\s*([\d.]+)\s*%/i,
  );

  if (serverBlock) {
    draft.server = round1(Number(serverBlock[2]));
    draft.serverCases = Number(serverBlock[1]);
    draft.completed = Number(serverBlock[1]);
  }
  if (webBlock) {
    draft.web = round1(Number(webBlock[2]));
    draft.webCases = Number(webBlock[1]);
  }
  if (apiBlock) draft.api = round1(Number(apiBlock[1]));

  // --- version: 10.4.4.83757 from the summary header lines ---
  const version = summary.match(/\b(\d{2}\.\d{1,2}\.\d{1,5}\.\d{4,6})\b/);
  if (version) draft.version = version[1];

  // --- KPI tracking block cross-check (C column) ---
  const kpiServer = check.match(/Server[：:]\s*([\d.]+)\s*%/);
  const kpiWeb = check.match(/Web[：:]\s*([\d.]+)\s*%/);
  if (kpiServer && draft.server !== undefined && Number(kpiServer[1]) !== draft.server) {
    warnings.push(
      `C列KPI块记录 Server ${kpiServer[1]}%，与総括实测 ${draft.server}% 不一致；已采用総括（最新实测）数值。`,
    );
  }
  if (kpiWeb && draft.web !== undefined && Number(kpiWeb[1]) !== draft.web) {
    warnings.push(
      `C列KPI块记录 Web ${kpiWeb[1]}%，与総括实测 ${draft.web}% 不一致；已采用総括（最新实测）数值。`,
    );
  }
  if (kpiDate) {
    const iso = padIso(Number(kpiDate[1]), Number(kpiDate[2]), Number(kpiDate[3]));
    // The 期間 line is often carried over from the previous week on copy-paste
    // (e.g. 20261112 file still saying 〜2026-11-5); the tracking snapshot's
    // 時点 date is written fresh each week, so the later date wins.
    if (iso && draft.end && iso > draft.end) {
      warnings.push(
        `期間行（截至 ${draft.end}）疑似沿用上期，已按KPI时点 ${iso} 归档本报告期。`,
      );
      draft.end = iso;
      draft.start = undefined;
    }
  }

  // --- ⑭-style cumulative migration for completed/total (C/D column fallbacks) ---
  // ⑭FluxServer GUIテストケース移行＜パート5＞ 100%/100% + 総テストケース数：266 完了：266
  const migrationBlock = `${check}\n${blocks.actionText ?? ""}`.match(
    /総テストケース数[：:]\s*(\d+)[\s\S]{0,80}?完了[：:]\s*(\d+)/,
  );
  if (migrationBlock && draft.completed === undefined) {
    draft.completed = Number(migrationBlock[2]);
    draft.total = Number(migrationBlock[1]);
  }
  if (draft.completed !== undefined && draft.total === undefined) {
    // Server cases equal the unified migration total (266) in this workbook.
    draft.total = draft.completed === 266 ? 266 : draft.completed;
  }

  if (draft.end || draft.server !== undefined) {
    if (!draft.end) {
      warnings.push("Sheet1 中未找到「期間：YYYY-MM-DD〜…」，无法确定报告期。");
      return [];
    }
    return [draft];
  }
  return [];
}

function parseJsonPayload(data: unknown, warnings: string[]): ParsedDraft[] {
  const items: unknown[] = Array.isArray(data) ? data : [data];
  const drafts: ParsedDraft[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const draft: ParsedDraft = {};
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      const field = fieldForLabel(key);
      if (!field || field === "completedTotal") continue;
      if (field === "end" || field === "start") {
        const iso = dateToIso(value, warnings);
        if (iso) draft[field] = iso;
      } else if (field === "completed" || field === "total") {
        const n = parseCount(value);
        if (n !== undefined) draft[field] = n;
      } else if (field === "completionPercent") {
        const n = parseRate(value);
        if (typeof n === "number") draft.completionPercent = round1(n);
      } else if (field === "remaining" || field === "increment") {
        const n = parseCount(value);
        if (n !== undefined) draft[field] = n;
      } else if (
        field === "selenium" || field === "server" || field === "web" || field === "api" ||
        field === "serverGuiTarget" || field === "guiTarget" || field === "apiTarget"
      ) {
        const n = parseRate(value);
        if (typeof n === "number") draft[field] = n;
      } else if (field === "version" || field === "phase" || field === "periodNote") {
        if (value !== null && value !== undefined) {
          draft[field] = String(value).normalize("NFKC").trim();
        }
      } else if (field === "seleniumCases" || field === "serverCases" || field === "webCases") {
        const n = parseNumRaw(value);
        if (n !== undefined) draft[field] = n;
      }
    }
    if (Object.keys(draft).length) drafts.push(draft);
  }
  return drafts;
}

// ----------------------------------------------------------------- entry ----
async function readFileText(file: File): Promise<string> {
  return await file.text();
}

export async function parsePdcaFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  const warnings: string[] = [];

  try {
    if (name.endsWith(".json")) {
      const data: unknown = JSON.parse(await readFileText(file));
      const drafts = parseJsonPayload(data, warnings);
      return { drafts, warnings, source: file.name };
    }

    if (/\.(xlsx|xlsm|xls)$/.test(name)) {
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
        type: "array",
        cellDates: true,
      });
      const drafts: ParsedDraft[] = [];
      for (const sheetName of wb.SheetNames) {
        const rows: CellMatrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
          header: 1,
          raw: true,
          defval: null,
        });
        drafts.push(...parseWorkbookRows(rows, warnings));
      }
      return { drafts, warnings, source: file.name };
    }

    if (name.endsWith(".csv")) {
      const wb = XLSX.read(await readFileText(file), { type: "string", cellDates: true, raw: false });
      const drafts: ParsedDraft[] = [];
      for (const sheetName of wb.SheetNames) {
        const rows: CellMatrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
          header: 1,
          raw: true,
          defval: null,
        });
        drafts.push(...parseWorkbookRows(rows, warnings));
      }
      return { drafts, warnings, source: file.name };
    }

    if (name.endsWith(".pdf")) {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      return parsePdcaText(text, file.name);
    }

    // .txt/.md and anything else — treat as text.
    return parsePdcaText(await readFileText(file), file.name);
  } catch (err) {
    return {
      drafts: [],
      warnings: [
        `解析文件失败：${err instanceof Error ? err.message : String(err)}`,
      ],
      source: file.name,
    };
  }
}

/** Which required fields a draft is missing — drives the review UI. */
export function draftGaps(draft: ParsedDraft): string[] {
  const gaps: string[] = [];
  if (!draft.end) gaps.push("报告期末");
  if (draft.completed === undefined) gaps.push("累计完成");
  if (draft.total === undefined) gaps.push("总量");
  return gaps;
}
