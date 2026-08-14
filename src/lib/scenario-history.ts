import { convertArsToUsd } from "@/lib/exchange-rate";
import { calculateSalary } from "@/lib/salary-engine";
import type { SalaryScenario } from "@/lib/types";
import { roundMoney } from "@/lib/utils";

export type HistoryCurrency = "ARS" | "USD";

interface SalaryHistoryPoint {
  period: string;
  value: number;
  scenarioCount: number;
  sacScenarioCount: number;
  hasSac: boolean;
  change?: number;
  changePercent?: number;
}

export function buildSalaryHistory(
  scenarios: SalaryScenario[],
  currency: HistoryCurrency,
): SalaryHistoryPoint[] {
  const grouped = new Map<
    string,
    { values: number[]; sacScenarioCount: number }
  >();
  for (const scenario of scenarios) {
    if (scenario.scenarioType === "sac") continue;
    const net = calculateSalary(scenario).net;
    const value =
      currency === "ARS"
        ? net
        : scenario.exchangeRate
          ? convertArsToUsd(net, scenario.exchangeRate.rate)
          : undefined;
    if (value == null || !Number.isFinite(value)) continue;
    const group = grouped.get(scenario.period) ?? {
      values: [],
      sacScenarioCount: 0,
    };
    group.values.push(value);
    if (scenario.sac > 0) group.sacScenarioCount += 1;
    grouped.set(scenario.period, group);
  }

  const points = [...grouped.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([period, group]) => ({
      period,
      value: roundMoney(
        group.values.reduce((sum, value) => sum + value, 0) /
          group.values.length,
      ),
      scenarioCount: group.values.length,
      sacScenarioCount: group.sacScenarioCount,
      hasSac: group.sacScenarioCount > 0,
    }));

  return points.map((point, index) => {
    const previous = points[index - 1];
    if (!previous) return point;
    const change = roundMoney(point.value - previous.value);
    return {
      ...point,
      change,
      changePercent:
        previous.value === 0
          ? undefined
          : roundMoney((change / previous.value) * 100),
    };
  });
}
