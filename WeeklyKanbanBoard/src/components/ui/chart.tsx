import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<"light" | "dark", string> }
  );
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme !== undefined,
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${colorConfig
          .map(([themeId, itemConfig]) => {
            const color =
              itemConfig.theme?.[themeId as "light" | "dark"] ??
              itemConfig.color;
            return color ? `  --color-${themeId}: ${color};` : null;
          })
          .join("\n")}\n}`,
      }}
    />
  );
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        data-slot="chart"
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number | Array<string | number>;
  color?: string;
  fill?: string;
  payload?: Record<string, unknown>;
};

type ChartTooltipContentProps = React.ComponentProps<"div"> & {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "line" | "dot" | "dashed";
  nameKey?: string;
  labelKey?: string;
  labelClassName?: string;
  labelFormatter?: (
    label: unknown,
    payload?: TooltipPayloadItem[],
  ) => React.ReactNode;
  formatter?: (
    value: unknown,
    name: unknown,
    item: TooltipPayloadItem,
    index: number,
    payload: TooltipPayloadItem[],
  ) => React.ReactNode;
};

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = `${labelKey ?? ((item?.dataKey ?? item?.name) || "value")}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      (!labelKey && (typeof label === "string" || typeof label === "number"))
        ? (config[label as keyof typeof config]?.label ?? label)
        : (itemConfig?.label ?? label);

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }

    return (
      <div className={cn("font-medium", labelClassName)}>{value}</div>
    );
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ]);

  if (!active || !payload?.length) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div
      data-slot="chart-tooltip-content"
      className={cn(
        "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      {!hideLabel && tooltipLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.dataKey !== undefined || item.name !== undefined)
          .map((item, index) => {
            const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor = item.color ?? item.fill ?? "var(--primary)";

            return (
              <div
                key={item.dataKey ?? item.name ?? index}
                className={cn(
                  "[&>svg]:text-muted-foreground flex w-full items-center gap-1.5 leading-none [&>svg]:size-3",
                  indicator === "dot" && "items-center",
                )}
              >
                {formatter && item.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            },
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex min-w-32 items-center justify-between gap-4 leading-none",
                        nestLabel ? "items-end" : "items-center",
                      )}
                    >
                      <div className="text-muted-foreground">
                        {itemConfig?.label ?? item.name}
                      </div>
                      <div
                        className={cn(
                          "text-foreground font-mono font-medium tabular-nums",
                          nestLabel && "text-right",
                        )}
                      >
                        {typeof item.value === "number"
                          ? item.value.toLocaleString()
                          : Array.isArray(item.value)
                            ? item.value.toLocaleString()
                            : String(item.value ?? "")}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function getPayloadConfigFromPayload(
  config: ChartConfig,
  item: TooltipPayloadItem,
  key: string,
) {
  if (typeof key !== "string") {
    return undefined;
  }

  const payloadKey = key.replace(/\[(\d+)\]/g, ".$1").split(".");
  const itemPayload =
    typeof item.payload === "object" && item.payload !== null
      ? (item.payload as Record<string, unknown>)
      : undefined;

  let payloadField: unknown = itemPayload;
  for (const segment of payloadKey) {
    if (payloadField && typeof payloadField === "object") {
      payloadField = (payloadField as Record<string, unknown>)[segment];
    } else {
      payloadField = undefined;
    }
  }

  const dataKeyField =
    typeof item.dataKey === "string"
      ? item.dataKey.replace(/\[(\d+)\]/g, ".$1").split(".")
      : undefined;
  let dataField: unknown = itemPayload;
  if (dataKeyField) {
    for (const segment of dataKeyField) {
      if (dataField && typeof dataField === "object") {
        dataField = (dataField as Record<string, unknown>)[segment];
      } else {
        dataField = undefined;
      }
    }
  }

  return (
    config[key as keyof typeof config] ??
    (payloadField != null ? config[String(payloadField) as keyof typeof config] : undefined) ??
    (dataField != null ? config[String(dataField) as keyof typeof config] : undefined)
  );
}

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & {
  payload?: TooltipPayloadItem[];
  hideIcon?: boolean;
  nameKey?: string;
  verticalAlign?: "top" | "bottom";
}) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {payload
        .filter((item) => item.dataKey !== undefined || item.name !== undefined)
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div
              key={item.dataKey ?? item.name ?? index}
              className={cn(
                "[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:size-3 text-xs",
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color ?? item.fill,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  useChart,
};
