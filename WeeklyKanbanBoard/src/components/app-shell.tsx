import { Outlet } from "react-router-dom";
import { ChartNoAxesCombined } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { PdcaUpdateDialog } from "@/components/pdca-update-dialog";

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#dashboard-work" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-2 focus:outline-ring">跳到看板内容</a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-10">
          <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ChartNoAxesCombined aria-hidden="true" className="size-5" /></span><div className="text-base font-semibold tracking-tight">Flux PDCA <span className="ml-1 font-normal text-muted-foreground">周度看板</span></div></div>
          <nav aria-label="看板章节" className="flex items-center gap-5 text-sm"><a href="#progress" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">迁移推进</a><a href="#quality" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">回归质量</a><PdcaUpdateDialog /><span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">只读</span></nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col"><Outlet /></main>
      <Toaster />
    </div>
  );
}

export default AppShell;
