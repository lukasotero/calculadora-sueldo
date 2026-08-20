"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  buildSalaryHistory,
  type HistoryCurrency,
} from "@/lib/scenario-history";
import type { SalaryScenario } from "@/lib/types";
import { cn, money, usdMoney } from "@/lib/utils";

const periodFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

function shortPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  return periodFormatter
    .format(new Date(Date.UTC(year, month - 1)))
    .replace(" ", " ’");
}

function formatValue(value: number, currency: HistoryCurrency) {
  return currency === "ARS" ? money.format(value) : usdMoney.format(value);
}

type SalaryHistoryPoints = ReturnType<typeof buildSalaryHistory>;

function changeTone(change: number | undefined) {
  if (change == null || change === 0) return "text-muted-foreground";
  return change > 0 ? "text-primary" : "text-destructive";
}

function renderHistoryDot({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: SalaryHistoryPoints[number];
}) {
  if (cx == null || cy == null) return <></>;

  return payload?.hasSac || payload?.hasVacation ? (
    <g aria-hidden="true">
      <circle
        cx={cx}
        cy={cy}
        r={7}
        fill="var(--background)"
        stroke="var(--color-value)"
        strokeWidth={2}
      />
      <circle cx={cx} cy={cy} r={3.5} fill="var(--color-value)" />
    </g>
  ) : (
    <circle
      aria-hidden="true"
      cx={cx}
      cy={cy}
      r={5}
      fill="var(--background)"
      stroke="var(--color-value)"
      strokeWidth={3}
    />
  );
}

const SalaryAreaVisualization = dynamic(
  async () => {
    const {
      Area,
      AreaChart,
      CartesianGrid,
      ResponsiveContainer,
      Tooltip,
      XAxis,
      YAxis,
    } = await import("recharts");

    function Visualization({
      points,
      currency,
      chartConfig,
    }: {
      points: SalaryHistoryPoints;
      currency: HistoryCurrency;
      chartConfig: ChartConfig;
    }) {
      return (
        <ChartContainer
          config={chartConfig}
          className="h-[280px] min-h-[280px] w-full"
          aria-label={`Evolución mensual del sueldo neto en ${currency}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              accessibilityLayer
              data={points}
              margin={{ top: 16, right: 16, bottom: 8, left: 8 }}
            >
              <defs>
                <linearGradient id="salary-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-value)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-value)"
                    stopOpacity={0.03}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 8" />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                tickFormatter={shortPeriod}
              />
              <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) => {
                      const period = payload[0]?.payload?.period as
                        string | undefined;
                      return period ? shortPeriod(period) : "";
                    }}
                    formatter={(value, _name, item) => {
                      const change = item.payload.change as number | undefined;
                      const changePercent = item.payload.changePercent as
                        number | undefined;
                      const scenarioCount = item.payload.scenarioCount as
                        number | undefined;
                      const hasSac = item.payload.hasSac as boolean | undefined;
                      const sacScenarioCount = item.payload.sacScenarioCount as
                        number | undefined;
                      const hasVacation = item.payload.hasVacation as
                        boolean | undefined;
                      const aggregation = item.payload.aggregation as
                        "sum" | "average" | undefined;
                      const receiptCount = item.payload.receiptCount as
                        number | undefined;
                      return (
                        <div className="flex min-w-40 flex-col gap-1">
                          <span className="font-mono font-semibold tabular-nums text-foreground">
                            {formatValue(Number(value), currency)}
                          </span>
                          {changePercent == null ? (
                            <span className="text-muted-foreground">
                              Primer período
                            </span>
                          ) : (
                            <span>
                              <span
                                className={cn(
                                  "font-mono font-medium tabular-nums",
                                  changeTone(change),
                                )}
                              >
                                {change && change > 0 ? "+" : ""}
                                {formatValue(change ?? 0, currency)} ·{" "}
                                {changePercent > 0 ? "+" : ""}
                                {changePercent}%
                              </span>{" "}
                              <span className="text-muted-foreground">
                                vs. período anterior
                              </span>
                            </span>
                          )}
                          {hasSac ? (
                            <span className="font-medium text-foreground">
                              Incluye SAC
                              {scenarioCount && scenarioCount > 1
                                ? ` en ${sacScenarioCount} de ${scenarioCount} escenarios`
                                : ""}
                            </span>
                          ) : null}
                          {hasVacation ? (
                            <span className="font-medium text-foreground">
                              Incluye vacaciones
                            </span>
                          ) : null}
                          {aggregation === "sum" ? (
                            <span className="text-muted-foreground">
                              Total de {receiptCount}{" "}
                              {receiptCount === 1 ? "recibo" : "recibos"}
                            </span>
                          ) : scenarioCount && scenarioCount > 1 ? (
                            <span className="text-muted-foreground">
                              Promedio de {scenarioCount} escenarios
                            </span>
                          ) : null}
                        </div>
                      );
                    }}
                  />
                }
              />
              <Area
                type="linear"
                dataKey="value"
                stroke="var(--color-value)"
                fill="url(#salary-fill)"
                strokeWidth={3}
                dot={renderHistoryDot}
                activeDot={{ r: 7 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      );
    }

    return { default: Visualization };
  },
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] w-full animate-pulse rounded-xl bg-muted" />
    ),
  },
);

export function SalaryHistoryChart({
  scenarios,
}: {
  scenarios: SalaryScenario[];
}) {
  const [currency, setCurrency] = useState<HistoryCurrency>("ARS");
  const points = useMemo(
    () => buildSalaryHistory(scenarios, currency),
    [currency, scenarios],
  );
  const missingUsd =
    currency === "USD" && scenarios.some((scenario) => !scenario.exchangeRate);
  const chartConfig = {
    value: {
      label: currency === "ARS" ? "Neto en pesos" : "Neto en dólares",
      color: currency === "ARS" ? "var(--chart-1)" : "var(--chart-2)",
    },
  } satisfies ChartConfig;

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/[.05]">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <TrendingUp className="size-5" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-[.14em]">
              Evolución
            </span>
          </div>
          <CardTitle>Tu sueldo neto en el tiempo</CardTitle>
          <CardDescription className="mt-1">
            Compará cuánto cobraste y cómo se movió frente al dólar.
          </CardDescription>
        </div>
        <ToggleGroup
          type="single"
          value={currency}
          onValueChange={(value) =>
            value && setCurrency(value as HistoryCurrency)
          }
          aria-label="Moneda del gráfico"
          className="grid grid-cols-2 rounded-xl bg-muted p-1"
        >
          <ToggleGroupItem value="ARS" className="min-h-10 px-5">
            Pesos
          </ToggleGroupItem>
          <ToggleGroupItem value="USD" className="min-h-10 px-5">
            Dólares
          </ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {points.length ? (
          <>
            <SalaryAreaVisualization
              points={points}
              currency={currency}
              chartConfig={chartConfig}
            />
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="relative inline-flex size-4 items-center justify-center rounded-full border-2 border-primary"
                aria-hidden="true"
              >
                <span className="size-1.5 rounded-full bg-primary" />
              </span>
              Punto marcado: el total mensual incluye SAC o vacaciones.
            </div>
            {points.length === 1 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Guardá escenarios de al menos dos meses para ver la tendencia.
              </p>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {currency === "USD"
              ? "No hay escenarios con una cotización guardada para mostrar la evolución en dólares."
              : "No hay escenarios mensuales para mostrar la evolución del sueldo."}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-1 text-xs leading-5 text-muted-foreground">
          <p>
            Los recibos guardados del mismo mes se suman. Las simulaciones
            manuales se promedian sólo cuando ese mes no tiene recibos.
          </p>
          {currency === "USD" ? (
            <p>
              La serie usa la cotización congelada al guardar cada escenario.
            </p>
          ) : null}
          {missingUsd ? (
            <p>
              Si a un recibo le falta su cotización, omitimos el mes completo en
              dólares para evitar un total parcial.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
