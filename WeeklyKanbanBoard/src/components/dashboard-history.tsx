import { useState } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { SnapshotRecord } from "@/data/pdca-store";
import { chartConfig, chartAxis, fmtPct, shortDate } from "@/lib/pdca-chart";
import { QualitySection } from "@/components/quality-section";

interface DashboardHistoryProps {
  /** Selected migration-era period. */
  report: SnapshotRecord;
  /** All migration-era periods up to the selected one — the chart series. */
  data: SnapshotRecord[];
  /** Latest migration period — the archive badge's closing numbers. */
  final: SnapshotRecord;
}

export function DashboardHistory({ report, data, final }: DashboardHistoryProps) {
  const [progressView, setProgressView] = useState<"completed" | "increment">("completed");
  const [detailOpen, setDetailOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const axis = chartAxis;

  return (
    <>
      <div aria-live="polite" className="mb-7">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="rounded-md border border-border bg-muted px-2.5 py-1 font-medium">{report.phase}</span>
          <span>数据截至 <time dateTime={report.end}>{report.end}</time></span>
          <span className="text-muted-foreground">周期 {report.start} — {report.end}</span>
          {report.periodNote.includes("假期") && <span className="rounded-md border border-amber-700/30 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">含假期 · 非单周报告</span>}
          <span className="rounded-md border border-emerald-700/30 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950 dark:text-emerald-100">已完结 · {final.completed}/{final.total} 件 · {final.end} 结案</span>
        </div>
        {report.periodNote && !report.periodNote.includes("假期") && <p className="mb-4 text-sm leading-6 text-foreground">{report.periodNote}</p>}
        <div className="grid gap-0 rounded-xl border border-border bg-card sm:grid-cols-3">
          <div className="p-5 md:p-6">
            <div className="text-sm text-muted-foreground">累计迁移完成</div>
            <div className="mt-3 flex items-baseline gap-2"><strong className="text-4xl font-semibold tabular-nums tracking-tight">{report.completed}</strong><span className="text-base text-muted-foreground">/ {report.total} 件</span></div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="迁移完成进度" aria-valuenow={report.completed} aria-valuemin={0} aria-valuemax={report.total}><div className="h-full rounded-full bg-primary" style={{ width: `${report.completionPercent}%` }} /></div>
            <div className="mt-2 text-sm">总量完成率 <span className="font-semibold tabular-nums">{fmtPct(report.completionPercent)}</span></div>
          </div>
          <div className="border-t border-border p-5 sm:border-l sm:border-t-0 md:p-6">
            <div className="text-sm text-muted-foreground">较上一报告期新增</div>
            <div className="mt-3 flex items-baseline gap-2"><strong className="text-4xl font-semibold tabular-nums tracking-tight">{report.increment === null ? "—" : `+${report.increment}`}</strong><span className="text-base text-muted-foreground">件</span></div>
            <div className="mt-5 text-sm text-foreground">{report.increment === null ? "首期无可比的上一期数据" : "按已提供的相邻报告期比较"}</div>
          </div>
          <div className="border-t border-border p-5 sm:border-l sm:border-t-0 md:p-6">
            <div className="text-sm text-muted-foreground">尚未完成</div>
            <div className="mt-3 flex items-baseline gap-2"><strong className="text-4xl font-semibold tabular-nums tracking-tight">{report.remaining}</strong><span className="text-base text-muted-foreground">件</span></div>
            <div className="mt-5 text-sm text-foreground">跨 Part 累计，统一以 {report.total} 件为总量</div>
          </div>
        </div>
      </div>

      <section id="progress" aria-labelledby="progress-heading" className="mb-8 rounded-xl border border-border bg-card p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
          <h2 id="progress-heading" className="text-base font-semibold">迁移推进</h2>
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="迁移趋势图类型">
            <Button size="sm" variant={progressView === "completed" ? "default" : "ghost"} aria-pressed={progressView === "completed"} onClick={() => setProgressView("completed")}>累计完成</Button>
            <Button size="sm" variant={progressView === "increment" ? "default" : "ghost"} aria-pressed={progressView === "increment"} onClick={() => setProgressView("increment")}>每期新增</Button>
          </div>
        </div>
        <p id="progress-summary" className="mb-6 text-sm text-foreground">{progressView === "completed" ? `截至 ${report.end} 累计完成 ${report.completed} 件，完成率 ${fmtPct(report.completionPercent)}。` : `截至 ${report.end}，较上一报告期新增 ${report.increment === null ? "暂无可比数据" : `${report.increment} 件`}；跨期增量不等同于单周产能。`}</p>
        <div role="img" aria-labelledby="progress-heading" aria-describedby="progress-summary" className="w-full">
          <ChartContainer config={chartConfig} className="h-[330px] w-full aspect-auto">
            {progressView === "completed" ? (
              <AreaChart data={data} margin={{ top: 20, right: 25, bottom: 5, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate} {...axis} minTickGap={35} />
                <YAxis domain={[0, report.total]} tickCount={5} {...axis} width={42} />
                <ReferenceLine y={report.total} stroke="var(--muted-foreground)" strokeDasharray="5 5" label={{ value: `总量 ${report.total} 件`, position: "insideTopRight", fill: "var(--foreground)", fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(Number(v))} />} />
                <Area dataKey="completed" type="linear" stroke="var(--primary)" strokeWidth={3} fill="var(--primary)" fillOpacity={0.08} dot={{ r: 4, fill: "var(--primary)", strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ top: 12, right: 20, bottom: 5, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="end" tickFormatter={(v: string) => v.slice(5)} {...axis} minTickGap={16} />
                <YAxis allowDecimals={false} {...axis} width={42} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="increment" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={45} isAnimationActive={false} />
              </BarChart>
            )}
          </ChartContainer>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><span>{data.length} 个已确认报告期 · 日期间隔不等</span><span>{progressView === "completed" ? "按实际日期分布；连线不代表缺失周已有数据" : "首期无上一期比较；柱形各代表一个报告期"}</span></div>
      </section>

      <QualitySection report={report} data={data} />

      <Collapsible open={detailOpen} onOpenChange={setDetailOpen} className="mb-5 rounded-xl border border-border bg-card">
        <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between p-5 text-foreground"><span className="font-semibold">报告数据明细 · {data.length} 期</span><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${detailOpen ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger>
        <CollapsibleContent><div className="overflow-x-auto border-t border-border"><table className="w-full min-w-[1100px] text-left text-xs tabular-nums"><caption className="px-5 py-3 text-left text-muted-foreground">迁移与质量图表的完整数值；新增为相邻报告期差值，单位为件，通过率单位为%。</caption><thead className="bg-muted text-foreground"><tr>{["报告期末", "阶段", "累计 / 总量", "完成率", "剩余", "新增", "Selenium", "Server GUI", "Web GUI", "API", "Server目标", "Web目标", "评估版本"].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.map((r) => <tr key={r.id} className="border-t border-border"><th scope="row" className="whitespace-nowrap px-4 py-3 font-medium">{r.end}</th><td className="px-4 py-3">{r.phase}</td><td className="px-4 py-3">{r.completed} / {r.total}</td><td className="px-4 py-3">{fmtPct(r.completionPercent)}</td><td className="px-4 py-3">{r.remaining}</td><td className="px-4 py-3">{r.increment ?? "—"}</td><td className="px-4 py-3">{fmtPct(r.selenium)}</td><td className="px-4 py-3">{fmtPct(r.server)}</td><td className="px-4 py-3">{fmtPct(r.web)}</td><td className="px-4 py-3">{fmtPct(r.api)}</td><td className="px-4 py-3">{fmtPct(r.serverGuiTarget)}</td><td className="px-4 py-3">{fmtPct(r.guiTarget)}</td><td className="whitespace-nowrap px-4 py-3 font-mono">{r.version}</td></tr>)}</tbody></table></div></CollapsibleContent>
      </Collapsible>

      <Collapsible id="methodology" open={rulesOpen} onOpenChange={setRulesOpen} className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between p-5 text-foreground"><span className="flex items-center gap-2 font-semibold"><CircleHelp aria-hidden="true" className="size-4" />口径与报告边界</span><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${rulesOpen ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger>
        <CollapsibleContent><dl className="grid gap-5 border-t border-border p-5 text-sm md:grid-cols-2">
          <div><dt className="mb-2 font-semibold">任务轨道</dt><dd className="leading-7">本视角为已归档的 266 件迁移任务（Part1–Part5，{final.end} 结案）。当前任务的统计在「当前任务」视角下进行；回归质量两条轨道均持续记录，互不混算。</dd></div>
          <div><dt className="mb-2 font-semibold">统一比较</dt><dd className="leading-7">采用各期已确认总括。累计完成件数包含之前 Part，总量以最新报告期为准（当前 {final.total} 件），完成率为累计完成÷总量；新任务扩容时随文档更新。原文阶段百分比不混入总量曲线。</dd></div>
          <div><dt className="mb-2 font-semibold">报告周期</dt><dd className="leading-7">9月18日至10月8日包含假期。未提供的报告期不补零；首份文件日期为7月9日，原文周期截至7月8日。</dd></div>
          <div><dt className="mb-2 font-semibold">计划与逾期</dt><dd className="leading-7">尚未确认266件总量对应的计划件数与期限。本看板不据阶段计划百分比推算逾期率或延期天数。</dd></div>
          <div><dt className="mb-2 font-semibold">数据版本</dt><dd className="leading-7">内置基线包含截至{final.end}的迁移汇总。通过页头「更新 PDCA」放入周报文档（Excel / CSV / PDF / 文本 / JSON）并确认，即可新增或替换报告期；导入数据保存在本机浏览器，可随时一键恢复内置基线。页面本身不提供数值手改。</dd></div>
        </dl></CollapsibleContent>
      </Collapsible>
    </>
  );
}
