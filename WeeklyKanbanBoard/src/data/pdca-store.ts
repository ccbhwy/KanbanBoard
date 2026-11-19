import { useSyncExternalStore } from "react";
import { reportSnapshots } from "@/data/pdca";
import type { ParsedDraft, PdcaTrack } from "@/lib/pdca-parse";

export type { ParsedDraft, PdcaTrack };

// Mutable, application-level snapshot shape. `reportSnapshots` in
// data/pdca.ts is the shipped baseline (readonly literal); user snapshots
// imported from PDCA documents live in localStorage and are merged over it.
// (ParsedDraft itself lives in lib/pdca-parse.ts — the parsing layer owns it.)
export interface SnapshotRecord {
  /** Report period id — equals `end` (YYYY-MM-DD). */
  id: string;
  start: string;
  end: string;
  phase: string;
  /** Task track: "migration" = archived 266-case migration era (Part1–5),
   *  "wave1" = the current Expansion Wave1 / screening era. */
  track: PdcaTrack;
  completed: number;
  completionPercent: number;
  remaining: number;
  increment: number | null;
  selenium: number | null;
  server: number | null;
  web: number | null;
  api: number | null;
  guiTarget: number;
  apiTarget: number;
  total: number;
  serverDelta: number | null;
  seleniumCases: number | null;
  serverCases: number | null;
  webCases: number | null;
  version: string;
  periodNote: string;
  /** end as UTC epoch ms — the charts' time axis. */
  time: number;
  serverGuiTarget: number;
  /** ⑮ Expansion Wave1 — script creation for the selected cases. */
  wave1Completed: number | null;
  wave1Total: number | null;
  /** 予定 (planned) percent at report time, e.g. 42 for 42%. */
  wave1PlanPercent: number | null;
  /** ⑯ FluxServerGUI テストケース自動化スクリーニング統計. */
  screenCompleted: number | null;
  screenTotal: number | null;
  screenWeekNew: number | null;
  screenWeekPlan: number | null;
  screenDone: number | null;
  screenAutomatable: number | null;
  screenExcluded: number | null;
}

export const baselineSnapshots: SnapshotRecord[] = reportSnapshots.map(
  (r) => ({
    ...r,
    track: "track" in r ? r.track : "migration",
    wave1Completed: "wave1Completed" in r ? r.wave1Completed : null,
    wave1Total: "wave1Total" in r ? r.wave1Total : null,
    wave1PlanPercent: "wave1PlanPercent" in r ? r.wave1PlanPercent : null,
    screenCompleted: "screenCompleted" in r ? r.screenCompleted : null,
    screenTotal: "screenTotal" in r ? r.screenTotal : null,
    screenWeekNew: "screenWeekNew" in r ? r.screenWeekNew : null,
    screenWeekPlan: "screenWeekPlan" in r ? r.screenWeekPlan : null,
    screenDone: "screenDone" in r ? r.screenDone : null,
    screenAutomatable: "screenAutomatable" in r ? r.screenAutomatable : null,
    screenExcluded: "screenExcluded" in r ? r.screenExcluded : null,
  }),
);

const STORAGE_KEY = "flux-pdca-user-snapshots-v1";

// ---------------------------------------------------------------------------
// Tiny external store over localStorage. `useSyncExternalStore` requires a
// stable getSnapshot identity, so the parsed list is cached until the next
// write; cross-tab edits sync through the `storage` event.
// ---------------------------------------------------------------------------
let cache: SnapshotRecord[] | null = null;
const listeners = new Set<() => void>();

function coerceRecord(raw: unknown): SnapshotRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const end = typeof r.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.end) ? r.end : null;
  const total = typeof r.total === "number" && r.total > 0 ? r.total : null;
  const completed = typeof r.completed === "number" && r.completed >= 0 ? r.completed : null;
  if (!end || total === null || completed === null) return null;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const numOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    id: typeof r.id === "string" ? r.id : end,
    start: typeof r.start === "string" ? r.start : end,
    end,
    phase: typeof r.phase === "string" ? r.phase : "",
    track: r.track === "wave1" ? "wave1" : "migration",
    completed,
    completionPercent: num(r.completionPercent, (completed / total) * 100),
    remaining: num(r.remaining, total - completed),
    increment: numOrNull(r.increment),
    selenium: numOrNull(r.selenium),
    server: numOrNull(r.server),
    web: numOrNull(r.web),
    api: numOrNull(r.api),
    guiTarget: num(r.guiTarget, 90),
    apiTarget: num(r.apiTarget, 100),
    total,
    serverDelta: numOrNull(r.serverDelta),
    seleniumCases: numOrNull(r.seleniumCases),
    serverCases: numOrNull(r.serverCases),
    webCases: numOrNull(r.webCases),
    version: typeof r.version === "string" ? r.version : "",
    periodNote: typeof r.periodNote === "string" ? r.periodNote : "",
    time: num(r.time, Date.parse(end)),
    serverGuiTarget: num(r.serverGuiTarget, 90),
    wave1Completed: numOrNull(r.wave1Completed),
    wave1Total: numOrNull(r.wave1Total),
    wave1PlanPercent: numOrNull(r.wave1PlanPercent),
    screenCompleted: numOrNull(r.screenCompleted),
    screenTotal: numOrNull(r.screenTotal),
    screenWeekNew: numOrNull(r.screenWeekNew),
    screenWeekPlan: numOrNull(r.screenWeekPlan),
    screenDone: numOrNull(r.screenDone),
    screenAutomatable: numOrNull(r.screenAutomatable),
    screenExcluded: numOrNull(r.screenExcluded),
  };
}

function readStorage(): SnapshotRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerceRecord).filter((r): r is SnapshotRecord => r !== null);
  } catch {
    return [];
  }
}

function writeStorage(list: SnapshotRecord[]) {
  cache = list;
  mergedCache = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full / disabled: keep the in-memory copy so the session still
    // reflects the update; persistence resumes when storage frees up.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      mergedCache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getUserSnapshots(): SnapshotRecord[] {
  if (cache === null) cache = readStorage();
  return cache;
}

export function setUserSnapshots(list: SnapshotRecord[]) {
  writeStorage(list);
}

export function clearUserSnapshots() {
  writeStorage([]);
}

export function hasUserSnapshots(): boolean {
  return getUserSnapshots().length > 0;
}

// useSyncExternalStore requires a referentially stable getSnapshot: cache the
// merged list until the next write (or cross-tab storage event).
let mergedCache: SnapshotRecord[] | null = null;

/** Baseline + user overrides, sorted chronologically (user entries win on the
 *  same period id). */
export function mergeSnapshots(): SnapshotRecord[] {
  if (mergedCache !== null) return mergedCache;
  const map = new Map<string, SnapshotRecord>();
  for (const r of baselineSnapshots) map.set(r.id, r);
  for (const r of getUserSnapshots()) map.set(r.id, { ...r });
  mergedCache = [...map.values()].sort((a, b) => a.time - b.time);
  return mergedCache;
}

export function usePdcaSnapshots(): SnapshotRecord[] {
  return useSyncExternalStore(subscribe, mergeSnapshots);
}

// ---------------------------------------------------------------------------
// Draft → record completion. Fields the document does not carry are derived
// from the previous period (targets/case counts/version) or computed
// (increment, remaining, completion percent, start), mirroring how the
// baseline was assembled.
// ---------------------------------------------------------------------------
const round1 = (n: number) => Math.round(n * 10) / 10;
const nextDay = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};

/** Which task track a parsed period belongs to — the parser sets it once any
 *  Wave1/screening number is found; older callers may omit it. */
const draftTrack = (draft: ParsedDraft): PdcaTrack =>
  draft.track ??
  (draft.wave1Completed !== undefined || draft.screenCompleted !== undefined
    ? "wave1"
    : "migration");

export function draftToRecord(
  draft: ParsedDraft,
  prev: SnapshotRecord | null,
): SnapshotRecord | null {
  const end = draft.end;
  const total = draft.total ?? prev?.total;
  const completed = draft.completed;
  if (!end || total === undefined || completed === undefined) return null;

  const track = draftTrack(draft);
  const time = Date.parse(end);
  const start = draft.start ?? (prev ? nextDay(prev.end) : end);
  const completionPercent =
    draft.completionPercent ?? round1((completed / total) * 100);
  const remaining = draft.remaining ?? Math.max(total - completed, 0);
  // 迁移增量 only makes sense within the archived migration track.
  const increment =
    track === "wave1"
      ? null
      : (draft.increment ?? (prev ? Math.max(completed - prev.completed, 0) : null));
  const server = draft.server ?? null;
  const serverDelta =
    server !== null && prev?.server !== undefined && prev.server !== null
      ? round1(server - prev.server)
      : null;
  const periodNoteParts: string[] = [];
  if (draft.periodNote) periodNoteParts.push(draft.periodNote);
  if (draft.phase && prev?.phase && draft.phase !== prev.phase) {
    periodNoteParts.push(`阶段进入${draft.phase}`);
  }

  return {
    id: end,
    start,
    end,
    phase: draft.phase ?? prev?.phase ?? "",
    track,
    completed,
    completionPercent,
    remaining,
    increment,
    selenium: draft.selenium ?? null,
    server,
    web: draft.web ?? null,
    api: draft.api ?? null,
    guiTarget: draft.guiTarget ?? prev?.guiTarget ?? 90,
    apiTarget: draft.apiTarget ?? prev?.apiTarget ?? 100,
    total,
    serverDelta,
    seleniumCases: draft.seleniumCases ?? null,
    serverCases: draft.serverCases ?? completed,
    webCases: draft.webCases ?? prev?.webCases ?? null,
    version: draft.version ?? prev?.version ?? "",
    periodNote: periodNoteParts.join("；"),
    time,
    serverGuiTarget: draft.serverGuiTarget ?? prev?.serverGuiTarget ?? 90,
    wave1Completed: draft.wave1Completed ?? null,
    wave1Total: draft.wave1Total ?? null,
    wave1PlanPercent: draft.wave1PlanPercent ?? null,
    screenCompleted: draft.screenCompleted ?? null,
    screenTotal: draft.screenTotal ?? null,
    screenWeekNew: draft.screenWeekNew ?? null,
    screenWeekPlan: draft.screenWeekPlan ?? null,
    screenDone: draft.screenDone ?? null,
    screenAutomatable: draft.screenAutomatable ?? null,
    screenExcluded: draft.screenExcluded ?? null,
  };
}

/** Merge one or more parsed drafts into the user snapshot store. Drafts are
 *  applied chronologically so each derives its deltas from the period before
 *  it. Returns the records written and which period ids were replaced. */
export function applyDrafts(drafts: ParsedDraft[]): {
  records: SnapshotRecord[];
  replacedIds: string[];
} {
  const merged = mergeSnapshots();
  const overridden = new Map(
    getUserSnapshots().map((r) => [r.id, r] as const),
  );
  const records: SnapshotRecord[] = [];
  const replacedIds: string[] = [];

  const sorted = [...drafts].sort((a, b) =>
    (a.end ?? "").localeCompare(b.end ?? ""),
  );
  for (const draft of sorted) {
    const id = draft.end;
    if (!id) continue;
    // Previous period = the latest merged record of the SAME track strictly
    // before this one (taking earlier drafts of this run into account) —
    // archived migration totals must not leak into the new-task track.
    const track = draftTrack(draft);
    const priorRecords = [
      ...merged,
      ...records,
    ]
      .filter((r) => r.end < id && r.track === track)
      .sort((a, b) => a.time - b.time);
    const prev = priorRecords[priorRecords.length - 1] ?? null;
    const record = draftToRecord(draft, prev);
    if (!record) continue;
    if (merged.some((r) => r.id === id) || overridden.has(id)) {
      replacedIds.push(id);
    }
    overridden.set(id, record);
    records.push(record);
  }

  setUserSnapshots([...overridden.values()].sort((a, b) => a.time - b.time));
  return { records, replacedIds };
}
