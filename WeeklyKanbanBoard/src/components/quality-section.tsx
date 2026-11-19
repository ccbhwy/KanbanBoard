import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { SnapshotRecord } from "@/data/pdca-store";
import { chartConfig, chartAxis, fmtPct, shortDate } from "@/lib/pdca-chart";

interface QualitySectionProps {
  report: SnapshotRecord;
  data: SnapshotRecord[];
}

export function QualitySection({ report, data }: QualitySectionProps) {
  const [qualityView, setQualityView] = useState<"gui" | "api">("gui");
  return (
    <section id="quality" aria-labelledby="quality-heading" className="mb-7 rounded-xl border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="quality-heading" className="text-base font-semibold">回归质量</h2>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="质量指标类型"><Button size="sm" variant={qualityView === "gui" ? "default" : "ghost"} aria-pressed={qualityView === "gui"} onClick={() => setQualityView("gui")}>GUI</Button><Button size="sm" variant={qualityView === "api" ? "default" : "ghost"} aria-pressed={qualityView === "api"} onClick={() => setQualityView("api")}>API</Button></div>
      </div>
      <div className="my-5 grid gap-5 border-b border-border pb-5 sm:grid-cols-3">
        {qualityView === "gui" ? <>
          <div><p className="text-xs text-muted-foreground">Playwright Server GUI · {report.serverCases} 用例</p><p className="mt-2 text-2xl font-semibold tabular-nums">{fmtPct(report.server)}</p><div className="mt-1 flex items-center gap-1 text-xs">{report.serverDelta !== null && (report.serverDelta < 0 ? <ArrowDownRight aria-hidden="true" className="size-4" /> : <ArrowUpRight aria-hidden="true" className="size-4" />)}{report.serverDelta === null ? "首期无环比" : `较上期 ${report.serverDelta > 0 ? "+" : ""}${report.serverDelta.toFixed(1)} 个百分点`}</div></div>
          <div><p className="text-xs text-muted-foreground">Playwright Web GUI · {report.webCases} 用例</p><p className="mt-2 text-2xl font-semibold tabular-nums">{fmtPct(report.web)}</p></div>
          <div><p className="text-xs text-muted-foreground">Selenium Server GUI{report.seleniumCases === null ? " · 本期未提供" : ` · ${report.seleniumCases} 用例`}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{fmtPct(report.selenium)}</p></div>
        </> : <><div><p className="text-xs text-muted-foreground">Playwright Server API</p><p className="mt-2 text-2xl font-semibold tabular-nums">{fmtPct(report.api)}</p></div><div><p className="text-xs text-muted-foreground">API目标</p><p className="mt-2 text-2xl font-semibold tabular-nums">{fmtPct(report.apiTarget)}</p></div><div><p className="text-xs text-muted-foreground">评估版本</p><p className="mt-2 font-mono text-sm">{report.version}</p></div></>}
      </div>
      <p id="quality-summary" className="mb-5 text-sm">{qualityView === "gui" ? `Server GUI ${fmtPct(report.server)}（目标 ${fmtPct(report.serverGuiTarget)}）；Web GUI ${fmtPct(report.web)}（目标 ${fmtPct(report.guiTarget)}）；Selenium ${fmtPct(report.selenium)}。` : `API通过率 ${fmtPct(report.api)}，目标 ${fmtPct(report.apiTarget)}。`}</p>
      <div className="mb-4 flex flex-wrap gap-5 text-xs" aria-label="图例">
        {qualityView === "gui" ? <><span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" />Playwright Server</span><span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-chart-5" />Playwright Web（虚线）</span><span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-chart-3" />Selenium（点线）</span></> : <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" />Playwright API</span>}
        <span>{qualityView === "gui" ? `目标线：Server ${fmtPct(report.serverGuiTarget)}（长虚线） / Web ${fmtPct(report.guiTarget)}（点线）` : "API目标线（灰色虚线）"}</span>
      </div>
      <div role="img" aria-labelledby="quality-heading" aria-describedby="quality-summary">
        <ChartContainer config={chartConfig} className="h-[260px] w-full aspect-auto">
          <LineChart data={data} margin={{ top: 18, right: 25, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
            <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate} {...chartAxis} minTickGap={35} />
            <YAxis domain={qualityView === "gui" ? [85, 100] : [98, 100]} tickFormatter={(v: number) => `${v}%`} {...chartAxis} width={48} />
            {qualityView === "gui" ? <><Line type="stepAfter" dataKey="serverGuiTarget" stroke="var(--muted-foreground)" strokeDasharray="9 5" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} /><Line type="stepAfter" dataKey="guiTarget" stroke="var(--muted-foreground)" strokeDasharray="2 5" strokeWidth={1.5} dot={false} isAnimationActive={false} /></> : <ReferenceLine y={report.apiTarget} stroke="var(--muted-foreground)" strokeDasharray="6 5" />}
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(Number(v))} formatter={(value, name) => <span>{chartConfig[name as keyof typeof chartConfig]?.label ?? name}：{Number(value).toFixed(1)}%</span>} />} />
            {qualityView === "gui" ? <><Line type="linear" dataKey="server" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} /><Line type="linear" dataKey="web" stroke="var(--chart-5)" strokeWidth={2} strokeDasharray="7 4" dot={{ r: 3 }} isAnimationActive={false} /><Line type="linear" dataKey="selenium" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="2 4" dot={{ r: 3 }} isAnimationActive={false} /></> : <Line type="linear" dataKey="api" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />}
          </LineChart>
        </ChartContainer>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">局部纵轴：{qualityView === "gui" ? "85%—100%" : "98%—100%"}。各期版本与用例范围可能不同，不按通过率变化推断改善措施的因果效果。缺失指标显示“未提供”，不补零或沿用上期值；GUI目标线按各期总括记录。</p>
    </section>
  );
}
