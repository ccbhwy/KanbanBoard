import { useSearchParams } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/states";
import { usePdcaSnapshots, type PdcaTrack } from "@/data/pdca-store";
import { DashboardCurrent } from "@/components/dashboard-current";
import { DashboardHistory } from "@/components/dashboard-history";

type DashboardView = "current" | "history";

const VIEW_TRACK: Record<DashboardView, PdcaTrack> = {
  current: "wave1",
  history: "migration",
};

export function HomePage() {
  const snapshots = usePdcaSnapshots();
  const [params, setParams] = useSearchParams();
  const view: DashboardView = params.get("view") === "history" ? "history" : "current";
  const track = VIEW_TRACK[view];

  // Each view operates on its own task track: the archived 266-case migration
  // (history) or the current Expansion Wave1 / screening era (default).
  const scoped = snapshots.filter((r) => r.track === track);
  const requested = params.get("period");
  const selectedIndex = scoped.findIndex((r) => r.id === requested);
  const index = selectedIndex >= 0 ? selectedIndex : scoped.length - 1;
  const report = scoped[index];
  const data = scoped.slice(0, index + 1);
  const latestId = scoped[scoped.length - 1]?.id;
  const choosePeriod = (id: string) => { const next = new URLSearchParams(params); next.set("period", id); setParams(next, { replace: true }); };
  const setView = (next: DashboardView) => {
    const params2 = new URLSearchParams(params);
    params2.delete("period"); // period ids are per-track; reset on switch
    if (next === "history") params2.set("view", "history");
    else params2.delete("view");
    setParams(params2, { replace: true });
  };

  return (
    <section id="dashboard-work" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-5 py-7 outline-none md:px-10 lg:py-9">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium tracking-widest text-muted-foreground"><span>FLUX AUTOMATION</span><span aria-hidden="true">/</span><span>PDCA</span></div>
          <h1 className="text-2xl font-semibold tracking-tight">{view === "history" ? "迁移进度与质量（已完结）" : "当前任务进展"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="任务视角">
            <Button size="sm" variant={view === "current" ? "default" : "ghost"} aria-pressed={view === "current"} onClick={() => setView("current")}>当前任务</Button>
            <Button size="sm" variant={view === "history" ? "default" : "ghost"} aria-pressed={view === "history"} onClick={() => setView("history")}>历史 · 266迁移</Button>
          </div>
          <label htmlFor="period-select" className="text-sm text-foreground">报告期</label>
          <Select value={report?.id ?? ""} onValueChange={choosePeriod}>
            <SelectTrigger id="period-select" className="w-[205px] bg-card" aria-label="选择报告期"><CalendarDays aria-hidden="true" className="size-4" /><SelectValue /></SelectTrigger>
            <SelectContent>{[...scoped].reverse().map((r) => <SelectItem key={r.id} value={r.id}>{r.end}{r.id === latestId ? " · 最新" : ""}</SelectItem>)}</SelectContent>
          </Select>
          {report && index !== scoped.length - 1 && <Button variant="outline" onClick={() => choosePeriod(latestId)}>返回最新一期</Button>}
        </div>
      </div>

      {!report || !latestId ? (
        <EmptyState title="暂无报告期数据" description={`「${view === "history" ? "历史 · 266迁移" : "当前任务"}」视角下没有已确认的报告期；可通过页头「更新 PDCA」导入周报文档。`} />
      ) : view === "history" ? (
        <DashboardHistory report={report} data={data} final={scoped[scoped.length - 1]} />
      ) : (
        <DashboardCurrent report={report} data={data} />
      )}
    </section>
  );
}
