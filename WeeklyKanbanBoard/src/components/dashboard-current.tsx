import { useState } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { SnapshotRecord } from "@/data/pdca-store";
import { chartConfig, chartAxis, fmtPct, shortDate } from "@/lib/pdca-chart";
import { QualitySection } from "@/components/quality-section";

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtInt = (n: number) => n.toLocaleString("en-US");

const currentChartConfig = {
  ...chartConfig,
  wave1Percent: { label: "実績", color: "var(--primary)" },
  wave1PlanPercent: { label: "予定", color: "var(--muted-foreground)" },
  screenCompleted: { label: "累计已筛选（件）", color: "var(--primary)" },
  screenDone: { label: "已有自动化", color: "var(--chart-3)" },
  screenAutomatable: { label: "可自动化", color: "var(--chart-5)" },
  screenExcluded: { label: "排除", color: "var(--muted-foreground)" },
};

interface DashboardCurrentProps {
  /** Selected current-task (wave1 track) period. */
  report: SnapshotRecord;
  /** All current-task periods up to the selected one — the chart series. */
  data: SnapshotRecord[];
}

export function DashboardCurrent({ report, data }: DashboardCurrentProps) {
  const [screenView, setScreenView] = useState<"cumulative" | "breakdown">("cumulative");
  const [detailOpen, setDetailOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Wave1 progress: percent done vs percent planned; screening: cumulative vs
  // the 1989-case universe. Numbers absent from a period stay null — charts
  // skip them instead of filling zeros.
  const series = data.map((r) => ({
    ...r,
    wave1Percent: r.wave1Total ? round1((r.wave1Completed ?? 0) / r.wave1Total * 100) : null,
    screenPercent: r.screenTotal ? round1((r.screenCompleted ?? 0) / r.screenTotal * 100) : null,
  }));
  const wave1Percent = series[series.length - 1]?.wave1Percent ?? null;
  const wave1Lead =
    wave1Percent !== null && report.wave1PlanPercent !== null
      ? round1(wave1Percent - report.wave1PlanPercent)
      : null;
  const screenPercent =
    report.screenTotal && report.screenCompleted !== null
      ? round1(report.screenCompleted / report.screenTotal * 100)
      : null;
  const screenRemaining =
    report.screenTotal && report.screenCompleted !== null
      ? report.screenTotal - report.screenCompleted
      : null;
  const weekAchievement =
    report.screenWeekPlan && report.screenWeekNew !== null
      ? round1(report.screenWeekNew / report.screenWeekPlan * 100)
      : null;
  const axis = chartAxis;

  return (
    <>
      <div aria-live="polite" className="mb-7">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="rounded-md border border-border bg-muted px-2.5 py-1 font-medium">{report.phase}</span>
          <span>数据截至 <time dateTime={report.end}>{report.end}</time></span>
          <span className="text-muted-foreground">周期 {report.start} — {report.end}</span>
        </div>
        {report.periodNote && <p className="mb-4 text-sm leading-6 text-foreground">{report.periodNote}</p>}
        <div className="grid gap-0 rounded-xl border border-border bg-card sm:grid-cols-3">
          <div className="p-5 md:p-6">
            <div className="text-sm text-muted-foreground">Expansion Wave1 脚本作成</div>
            <div className="mt-3 flex items-baseline gap-2"><strong className="text-4xl font-semibold tabular-nums tracking-tight">{report.wave1Completed ?? "—"}</strong><span className="text-base text-muted-foreground">/ {report.wave1Total ?? "?"} 件</span></div>
            <div className="relative mt-4" aria-hidden={report.wave1PlanPercent === null}>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Wave1脚本作成进度" aria-valuenow={report.wave1Completed ?? undefined} aria-valuemin={0} aria-valuemax={report.wave1Total ?? undefined}>
                {wave1Percent !== null && <div className="h-full rounded-full bg-primary" style={{ width: `${wave1Percent}%` }} />}
              </div>
              {report.wave1PlanPercent !== null && <div className="absolute -top-1 h-3.5 w-px bg-foreground/60" style={{ left: `${report.wave1PlanPercent}%` }} />}
            </div>
            <div className="mt-2 text-sm">
              {wave1Percent !== null && <span>実績 <span className="font-semibold tabular-nums">{wave1Percent.toFixed(1)}%</span></span>}
              {report.wave1PlanPercent !== null && <span className="text-muted-foreground"> · 予定 {report.wave1PlanPercent}%（刻线）</span>}
              {wave1Lead !== null && <span> · {wave1Lead >= 0 ? `超前 +${wave1Lead}` : `落后 ${wave1Lead}`}pt</span>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">日程 11/10 — 12/4 · 17件选定Case的Playwright脚本作成</div>
          </div>
          <div className="border-t border-border p-5 sm:border-l sm:border-t-0 md:p-6">
            <div className="text-sm text-muted-foreground">用例自动化筛选</div>
            <div className="mt-3 flex items-baseline gap-2"><strong className="text-4xl font-semibold tabular-nums tracking-tight">{report.screenCompleted ?? "—"}</strong><span className="text-base text-muted-foreground">/ {report.screenTotal !== null ? fmtInt(report.screenTotal) : "?"} 件</span></div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="用例筛选进度" aria-valuenow={report.screenCompleted ?? undefined} aria-valuemin={0} aria-valuemax={report.screenTotal ?? undefined}>{screenPercent !== null && <div className="h-full rounded-full bg-primary" style={{ width: `${screenPercent}%` }} />}</div>
            <div className="mt-2 text-sm">
              {screenPercent !== null && <>筛选进度 <span className="font-semibold tabular-nums">{screenPercent.toFixed(1)}%</span></>}
              {report.screenWeekNew !== null && <span> · 本周 +{report.screenWeekNew}{report.screenWeekPlan !== null ? ` / 计划 ${report.screenWeekPlan}` : ""} 件</span>}
              {weekAchievement !== null && <span className="text-muted-foreground">（达成 {weekAchievement}%）</span>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{screenRemaining !== null ? `待筛选 ${fmtInt(screenRemaining)} 件 · ` : ""}总量 {report.screenTotal !== null ? fmtInt(report.screenTotal) : "—"} 件</div>
          </div>
          <div className="border-t border-border p-5 sm:border-l sm:border-t-0 md:p-6">
            <div className="text-sm text-muted-foreground">回归质量（{report.version || "本期"}）</div>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-baseline justify-between gap-2"><span className="text-sm text-muted-foreground">Playwright Server</span><span className="text-lg font-semibold tabular-nums">{fmtPct(report.server)}{report.serverDelta !== null && <span className="ml-1 text-xs font-normal text-muted-foreground">较上期 {report.serverDelta > 0 ? "+" : ""}{report.serverDelta.toFixed(1)}pt</span>}</span></div>
              <div className="flex items-baseline justify-between gap-2"><span className="text-sm text-muted-foreground">Playwright Web</span><span className="text-lg font-semibold tabular-nums">{fmtPct(report.web)}</span></div>
              <div className="flex items-baseline justify-between gap-2"><span className="text-sm text-muted-foreground">Playwright API</span><span className="text-lg font-semibold tabular-nums">{fmtPct(report.api)}</span></div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">迁移任务完结后继续按周记录</div>
          </div>
        </div>
      </div>

      <section id="wave1-progress" aria-labelledby="wave1-progress-heading" className="mb-8 rounded-xl border border-border bg-card p-5 md:p-6">
        <h2 id="wave1-progress-heading" className="mb-3 text-base font-semibold">Wave1 推进</h2>
        <p id="wave1-progress-summary" className="mb-6 text-sm text-foreground">{report.wave1Completed !== null && report.wave1Total ? `截至 ${report.end} 完成 ${report.wave1Completed}/${report.wave1Total} 件（${wave1Percent !== null ? `${wave1Percent.toFixed(1)}%` : "—"}），同刻予定 ${report.wave1PlanPercent !== null ? `${report.wave1PlanPercent}%` : "未提供"}。` : "本期未提供 Wave1 进度数值。"}</p>
        <div role="img" aria-labelledby="wave1-progress-heading" aria-describedby="wave1-progress-summary" className="w-full">
          <ChartContainer config={currentChartConfig} className="h-[280px] w-full aspect-auto">
            <AreaChart data={series} margin={{ top: 20, right: 25, bottom: 5, left: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate} {...axis} minTickGap={35} />
              <YAxis domain={[0, 100]} tickCount={6} tickFormatter={(v: number) => `${v}%`} {...axis} width={44} />
              <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeDasharray="5 5" label={{ value: "完成 100%", position: "insideTopRight", fill: "var(--foreground)", fontSize: 12 }} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(Number(v))} formatter={(value, name) => <span>{currentChartConfig[name as keyof typeof currentChartConfig]?.label ?? name}：{Number(value).toFixed(1)}%</span>} />} />
              <Area dataKey="wave1PlanPercent" type="stepAfter" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="7 5" fill="var(--muted-foreground)" fillOpacity={0.05} dot={{ r: 2 }} isAnimationActive={false} />
              <Area dataKey="wave1Percent" type="linear" stroke="var(--primary)" strokeWidth={3} fill="var(--primary)" fillOpacity={0.08} dot={{ r: 4, fill: "var(--primary)", strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-4"><span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" />実績</span><span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-muted-foreground" />予定（虚线）</span></span><span>{data.length} 个报告期 · 缺失期不补零</span></div>
      </section>

      <section id="screening" aria-labelledby="screening-heading" className="mb-8 rounded-xl border border-border bg-card p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
          <h2 id="screening-heading" className="text-base font-semibold">用例筛选推进</h2>
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="筛选图表类型">
            <Button size="sm" variant={screenView === "cumulative" ? "default" : "ghost"} aria-pressed={screenView === "cumulative"} onClick={() => setScreenView("cumulative")}>累计进度</Button>
            <Button size="sm" variant={screenView === "breakdown" ? "default" : "ghost"} aria-pressed={screenView === "breakdown"} onClick={() => setScreenView("breakdown")}>分类内訳</Button>
          </div>
        </div>
        <p id="screening-summary" className="mb-6 text-sm text-foreground">{screenView === "cumulative" ? `截至 ${report.end} 已筛选 ${report.screenCompleted ?? "—"} / ${report.screenTotal !== null ? fmtInt(report.screenTotal) : "—"} 件（${screenPercent !== null ? `${screenPercent.toFixed(1)}%` : "—"}）${report.screenWeekNew !== null ? `，本周新增 ${report.screenWeekNew} 件。` : "。"}` : `已筛选 ${report.screenCompleted ?? "—"} 件内訳：已有自动化 ${report.screenDone ?? "—"}、可自动化 ${report.screenAutomatable ?? "—"}、排除 ${report.screenExcluded ?? "—"}。`}</p>
        <div role="img" aria-labelledby="screening-heading" aria-describedby="screening-summary" className="w-full">
          <ChartContainer config={currentChartConfig} className="h-[280px] w-full aspect-auto">
            {screenView === "cumulative" ? (
              <AreaChart data={series} margin={{ top: 20, right: 25, bottom: 5, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate} {...axis} minTickGap={35} />
                <YAxis domain={[0, report.screenTotal ?? "auto"]} tickCount={5} {...axis} width={46} />
                <ReferenceLine y={report.screenTotal ?? 0} stroke="var(--muted-foreground)" strokeDasharray="5 5" label={{ value: `总量 ${report.screenTotal !== null ? fmtInt(report.screenTotal) : ""} 件`, position: "insideTopRight", fill: "var(--foreground)", fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(Number(v))} />} />
                <Area dataKey="screenCompleted" type="linear" stroke="var(--primary)" strokeWidth={3} fill="var(--primary)" fillOpacity={0.08} dot={{ r: 4, fill: "var(--primary)", strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
              </AreaChart>
            ) : (
              <BarChart data={series} margin={{ top: 12, right: 20, bottom: 5, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="end" tickFormatter={(v: string) => v.slice(5)} {...axis} minTickGap={16} />
                <YAxis allowDecimals={false} {...axis} width={42} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="screenDone" stackId="a" fill="var(--chart-3)" maxBarSize={45} isAnimationActive={false} />
                <Bar dataKey="screenAutomatable" stackId="a" fill="var(--chart-5)" maxBarSize={45} isAnimationActive={false} />
                <Bar dataKey="screenExcluded" stackId="a" fill="var(--muted-foreground)" maxBarSize={45} isAnimationActive={false} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ChartContainer>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          {screenView === "breakdown" ? <span className="flex items-center gap-4"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-chart-3" />已有自动化</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-chart-5" />可自动化</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-muted-foreground" />排除（不可自动化）</span></span> : <span aria-hidden="true" />}
          <span>用例总量 {report.screenTotal !== null ? fmtInt(report.screenTotal) : "—"} 件 · 优先采用「自动化筛选进度」表数值</span>
        </div>
      </section>

      <QualitySection report={report} data={data} />

      <Collapsible open={detailOpen} onOpenChange={setDetailOpen} className="mb-5 rounded-xl border border-border bg-card">
        <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between p-5 text-foreground"><span className="font-semibold">报告数据明细 · {data.length} 期</span><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${detailOpen ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger>
        <CollapsibleContent><div className="overflow-x-auto border-t border-border"><table className="w-full min-w-[1050px] text-left text-xs tabular-nums"><caption className="px-5 py-3 text-left text-muted-foreground">当前任务与质量图表的完整数值；Wave1单位为件，筛选累计/本周单位为件，通过率单位为%。</caption><thead className="bg-muted text-foreground"><tr>{["报告期末", "阶段", "Wave1", "Wave1予定", "筛选累计", "本周筛选", "Server GUI", "Web GUI", "API", "评估版本"].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.map((r) => <tr key={r.id} className="border-t border-border"><th scope="row" className="whitespace-nowrap px-4 py-3 font-medium">{r.end}</th><td className="px-4 py-3">{r.phase}</td><td className="px-4 py-3">{r.wave1Completed !== null && r.wave1Total !== null ? `${r.wave1Completed} / ${r.wave1Total}` : "—"}</td><td className="px-4 py-3">{r.wave1PlanPercent !== null ? `${r.wave1PlanPercent}%` : "—"}</td><td className="px-4 py-3">{r.screenCompleted !== null && r.screenTotal !== null ? `${r.screenCompleted} / ${fmtInt(r.screenTotal)}` : "—"}</td><td className="px-4 py-3">{r.screenWeekNew !== null ? `+${r.screenWeekNew}${r.screenWeekPlan !== null ? ` / ${r.screenWeekPlan}` : ""}` : "—"}</td><td className="px-4 py-3">{fmtPct(r.server)}</td><td className="px-4 py-3">{fmtPct(r.web)}</td><td className="px-4 py-3">{fmtPct(r.api)}</td><td className="whitespace-nowrap px-4 py-3 font-mono">{r.version}</td></tr>)}</tbody></table></div></CollapsibleContent>
      </Collapsible>

      <Collapsible id="methodology" open={rulesOpen} onOpenChange={setRulesOpen} className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between p-5 text-foreground"><span className="flex items-center gap-2 font-semibold"><CircleHelp aria-hidden="true" className="size-4" />口径与说明</span><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${rulesOpen ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger>
        <CollapsibleContent><dl className="grid gap-5 border-t border-border p-5 text-sm md:grid-cols-2">
          <div><dt className="mb-2 font-semibold">任务轨道</dt><dd className="leading-7">266件迁移任务已完结并归档至「历史 · 266迁移」视角（点击页头切换查看）。本视角统计进行中的 Expansion Wave1 与用例筛选两条任务；回归质量两条轨道均按周记录，互不混算。</dd></div>
          <div><dt className="mb-2 font-semibold">Wave1口径</dt><dd className="leading-7">17件为已选定的「未自动化且可实现自动化」Case；完成口径为Playwright脚本作成完成件数。予定%取各期文档「実績/予定」标注，进度条刻线画在该期予定位置；超前/落后为実績与予定之差。</dd></div>
          <div><dt className="mb-2 font-semibold">筛选口径</dt><dd className="leading-7">用例总量 {report.screenTotal !== null ? fmtInt(report.screenTotal) : "—"} 件为用户提供的全体用例数；「已有自动化」单列，「可自动化」为新增自动化候选，「排除」为不可自动化。数值优先采用文档「自动化筛选进度」表，与正文冲突时以表为准并提示。</dd></div>
          <div><dt className="mb-2 font-semibold">K6与备注</dt><dd className="leading-7">K6性能テスト暂无周度数值指标，不做统计卡；进度随各期报告备注更新（本期：Case10追加与テスト実行UI改善实施中）。</dd></div>
          <div><dt className="mb-2 font-semibold">数据版本</dt><dd className="leading-7">内置基线含迁移全史与Wave1各确认期。通过页头「更新 PDCA」放入周报文档（Excel / CSV / PDF / 文本 / JSON）并确认，即可新增或替换报告期；导入数据保存在本机浏览器，可随时一键恢复内置基线。</dd></div>
        </dl></CollapsibleContent>
      </Collapsible>
    </>
  );
}
