// Shared chart helpers for the PDCA dashboards — kept out of the component
// files so react-refresh sees components only.
export const chartConfig = {
  completed: { label: "累计完成（件）", color: "var(--primary)" },
  increment: { label: "较上期新增（件）", color: "var(--primary)" },
  selenium: { label: "Selenium Server", color: "var(--chart-3)" },
  server: { label: "Playwright Server", color: "var(--primary)" },
  web: { label: "Playwright Web", color: "var(--chart-5)" },
  api: { label: "Playwright API", color: "var(--primary)" },
  serverGuiTarget: { label: "Server GUI目标", color: "var(--muted-foreground)" },
  guiTarget: { label: "Web GUI目标", color: "var(--muted-foreground)" },
};

export const fmtPct = (n: number | null) => n === null ? "未提供" : `${n.toFixed(1)}%`;
export const shortDate = (n: number) => new Date(n).toISOString().slice(5, 10).replace("-", "/");
export const chartAxis = { tickLine: false, axisLine: false, tickMargin: 10 };
