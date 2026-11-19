import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { applyDrafts, hasUserSnapshots } from "@/data/pdca-store";
import {
  draftGaps,
  parsePdcaFile,
  parsePdcaText,
  type ParseResult,
} from "@/lib/pdca-parse";
import { cn } from "@/lib/utils";

const fmtPct = (n: number | null | undefined) =>
  n === undefined || n === null ? "未提供" : `${n.toFixed(1)}%`;

type Phase = "pick" | "parsing" | "review";

// One "更新 PDCA" flow: pick a report document → parse → review → apply.
// The board subscribes to the snapshot store, so applying refreshes it live.
export function PdcaUpdateDialog() {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("pick");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [pasted, setPasted] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase("pick");
    setResult(null);
    setSelected(new Set());
    setDragOver(false);
    setPasted("");
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleParsed = useCallback((parsed: ParseResult) => {
    const validIdx = parsed.drafts
      .map((d, i) => (draftGaps(d).length === 0 ? i : -1))
      .filter((i) => i >= 0);
    setResult(parsed);
    setSelected(new Set(validIdx));
    setPhase("review");
  }, []);

  const parseFile = useCallback(
    async (file: File) => {
      setPhase("parsing");
      const parsed = await parsePdcaFile(file);
      if (!parsed.drafts.length) {
        setPhase("pick");
        toast.error(`未能从 ${file.name} 解析出 PDCA 数据`, {
          description: parsed.warnings[0] ?? "请检查文档格式或改用 Excel/CSV/JSON。",
        });
        return;
      }
      handleParsed(parsed);
    },
    [handleParsed],
  );

  const parseText = useCallback(() => {
    const text = pasted.trim();
    if (!text) return;
    const parsed = parsePdcaText(text, "粘贴文本");
    if (!parsed.drafts.length) {
      toast.error("未能从文本中解析出 PDCA 数据", {
        description: parsed.warnings[0],
      });
      return;
    }
    handleParsed(parsed);
  }, [pasted, handleParsed]);

  const apply = useCallback(() => {
    if (!result) return;
    const drafts = result.drafts.filter((_, i) => selected.has(i));
    if (!drafts.length) return;
    const { records, replacedIds } = applyDrafts(drafts);
    const latest = records[records.length - 1];
    // Headline metric follows the track: migration eras count 累计/总量,
    // new-task eras lead with Wave1 / screening progress.
    const parts: string[] = [];
    if (latest.wave1Completed !== null && latest.wave1Total !== null) {
      parts.push(`Wave1 ${latest.wave1Completed}/${latest.wave1Total}`);
    }
    if (latest.screenCompleted !== null && latest.screenTotal !== null) {
      parts.push(`筛选 ${latest.screenCompleted}/${latest.screenTotal}`);
    }
    const headline = parts.length
      ? parts.join(" · ")
      : `${latest.completed}/${latest.total} 件`;
    toast.success(`PDCA 已更新至 ${latest.end}（${headline}）`, {
      description: replacedIds.length
        ? `已替换既有报告期：${replacedIds.join("、")}`
        : `新增 ${records.length} 个报告期，看板已刷新。`,
    });
    setOpen(false);
  }, [result, selected]);

  const restoreBaseline = useCallback(async () => {
    const ok = await confirm({
      title: "恢复内置数据？",
      description: "将清除所有通过 PDCA 文档导入的报告期，看板回到出厂基线（截至内置最新一期）。该操作不可撤销。",
      confirmLabel: "恢复内置数据",
      cancelLabel: "取消",
      destructive: true,
    });
    if (!ok) return;
    const { clearUserSnapshots } = await import("@/data/pdca-store");
    clearUserSnapshots();
    toast.success("已恢复内置基线数据。");
    setOpen(false);
  }, [confirm]);

  const validSelected = result
    ? result.drafts.filter(
        (d, i) => selected.has(i) && draftGaps(d).length === 0,
      )
    : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileUp aria-hidden="true" className="size-4" />
          更新 PDCA
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>放入 PDCA 报告文档</DialogTitle>
          <DialogDescription>
            支持 Excel / CSV / PDF / JSON / 文本周报。解析后确认，看板即按“更新最新 PDCA”刷新。
          </DialogDescription>
        </DialogHeader>

        {phase === "pick" && (
          <div className="grid gap-4">
            <button
              type="button"
              aria-label="选择或拖入 PDCA 文档"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void parseFile(file);
              }}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:border-primary/60 hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                dragOver && "border-primary bg-primary/5",
              )}
            >
              <FileUp aria-hidden="true" className="size-8 text-muted-foreground" />
              <span className="block text-sm font-medium">拖入 PDCA 文档，或点击选择文件</span>
              <span className="block text-xs text-muted-foreground">
                识别“报告期 / 累计 / 总量 / 完成率 / 新增 / Selenium / Server GUI / Web GUI / API / 目标 / 评估版本”等指标
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv,.pdf,.json,.txt,.md"
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void parseFile(file);
                e.target.value = "";
              }}
            />
            <div className="grid gap-2">
              <label htmlFor="pdca-paste" className="text-sm font-medium">
                或粘贴报告文本
              </label>
              <textarea
                id="pdca-paste"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={4}
                placeholder={"例：\n报告期：2026-11-12\n累计完成 266/266，完成率 100.0%\nServer GUI 98.2%，Web GUI 91.0%，API 100%"}
                className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
              />
              <Button size="sm" variant="secondary" onClick={parseText} disabled={!pasted.trim()} className="justify-self-start">
                解析文本
              </Button>
            </div>
            {hasUserSnapshots() && (
              <Button size="sm" variant="ghost" className="justify-self-start text-muted-foreground" onClick={() => void restoreBaseline()}>
                <RefreshCw aria-hidden="true" className="size-3.5" />
                恢复内置数据
              </Button>
            )}
          </div>
        )}

        {phase === "parsing" && (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            正在解析文档…
          </div>
        )}

        {phase === "review" && result && (
          <div className="grid gap-4">
            <div className="text-sm">
              从 <span className="font-medium">{result.source}</span> 解析出{" "}
              <span className="font-medium">{result.drafts.length}</span> 个报告期。
              {selected.size > 0 && (
                <span className="text-muted-foreground">
                  确认后最新报告期将更新为 {validSelected[validSelected.length - 1]?.end ?? "—"}。
                </span>
              )}
            </div>
            {result.warnings.length > 0 && (
              <ul className="grid gap-1 rounded-md border border-amber-700/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="sticky top-0 bg-muted text-foreground">
                  <tr>
                    <th scope="col" className="w-8 px-2 py-2" aria-label="选择" />
                    <th scope="col" className="px-2 py-2 font-medium">报告期末</th>
                    <th scope="col" className="px-2 py-2 font-medium">阶段</th>
                    <th scope="col" className="px-2 py-2 font-medium">累计 / 总量</th>
                    <th scope="col" className="px-2 py-2 font-medium">新任务</th>
                    <th scope="col" className="px-2 py-2 font-medium">完成率</th>
                    <th scope="col" className="px-2 py-2 font-medium">Server</th>
                    <th scope="col" className="px-2 py-2 font-medium">Web</th>
                    <th scope="col" className="px-2 py-2 font-medium">API</th>
                    <th scope="col" className="px-2 py-2 font-medium">版本</th>
                  </tr>
                </thead>
                <tbody>
                  {result.drafts.map((d, i) => {
                    const gaps = draftGaps(d);
                    const checked = selected.has(i);
                    return (
                      <tr key={i} className={cn("border-t border-border", checked && "bg-primary/5")}>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={gaps.length > 0}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(i);
                              else next.delete(i);
                              setSelected(next);
                            }}
                            aria-label={`应用报告期 ${d.end ?? "未知"}`}
                            className="size-4 accent-[var(--primary)] disabled:opacity-30"
                          />
                        </td>
                        <td className="px-2 py-2 font-medium tabular-nums">
                          {d.end ?? <span className="text-destructive">未识别</span>}
                        </td>
                        <td className="px-2 py-2">{d.phase ?? "—"}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {d.completed ?? "?"} / {d.total ?? "?"}
                        </td>
                        <td className="px-2 py-2">
                          {d.wave1Completed !== undefined || d.screenCompleted !== undefined ? (
                            <span className="flex flex-wrap gap-1">
                              {d.wave1Completed !== undefined && (
                                <span className="whitespace-nowrap rounded border border-border bg-muted px-1.5 py-0.5 tabular-nums">
                                  Wave1 {d.wave1Completed}/{d.wave1Total ?? "?"}
                                </span>
                              )}
                              {d.screenCompleted !== undefined && (
                                <span className="whitespace-nowrap rounded border border-border bg-muted px-1.5 py-0.5 tabular-nums">
                                  筛选 {d.screenCompleted}/{d.screenTotal ?? "?"}{d.screenWeekNew !== undefined ? ` +${d.screenWeekNew}` : ""}
                                </span>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums">{fmtPct(d.completionPercent)}</td>
                        <td className="px-2 py-2 tabular-nums">{fmtPct(d.server)}</td>
                        <td className="px-2 py-2 tabular-nums">{fmtPct(d.web)}</td>
                        <td className="px-2 py-2 tabular-nums">{fmtPct(d.api)}</td>
                        <td className="px-2 py-2 font-mono">{d.version || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {result.drafts.some((d) => draftGaps(d).length > 0) && (
              <p className="text-xs text-muted-foreground">
                标记为“未识别”或缺少必需指标的报告期无法应用（迁移轨道：累计/总量；新任务轨道：Wave1或筛选进度），已排除在更新之外。
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "review" ? (
            <>
              <Button variant="ghost" onClick={reset}>重新选择</Button>
              <Button onClick={apply} disabled={!validSelected.length} aria-label="更新最新 PDCA">
                更新最新 PDCA
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PdcaUpdateDialog;
