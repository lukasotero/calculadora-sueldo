import { convertArsToUsd } from "@/lib/exchange-rate";
import { calculateSalary } from "@/lib/salary-engine";
import type { SalaryScenario } from "@/lib/types";
import { roundMoney } from "@/lib/utils";

export type HistoryCurrency = "ARS" | "USD";

interface SalaryHistoryPoint {
  period: string;
  value: number;
  aggregation: "sum" | "average";
  scenarioCount: number;
  receiptCount: number;
  sacScenarioCount: number;
  hasSac: boolean;
  hasVacation: boolean;
  change?: number;
  changePercent?: number;
}

export function buildSalaryHistory(
  scenarios: SalaryScenario[],
  currency: HistoryCurrency,
): SalaryHistoryPoint[] {
  const grouped = new Map<string, SalaryScenario[]>();
  for (const scenario of scenarios) {
    const group = grouped.get(scenario.period) ?? [];
    group.push(scenario);
    grouped.set(scenario.period, group);
  }

  const points = [...grouped.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .flatMap(([period, allScenarios]) => {
      const receipts = allScenarios.filter(
        (scenario) => (scenario.sourcePaystubIds?.length ?? 0) > 0,
      );
      const chosen = receipts.length > 0 ? receipts : allScenarios;
      const aggregation: SalaryHistoryPoint["aggregation"] =
        receipts.length > 0 ? "sum" : "average";
      const values = chosen.map((scenario) => {
        const net = calculateSalary(scenario).net;
        return currency === "ARS"
          ? net
          : scenario.exchangeRate
            ? convertArsToUsd(net, scenario.exchangeRate.rate)
            : undefined;
      });
      if (receipts.length > 0 && values.some((value) => value == null)) {
        return [];
      }
      const validValues = values.filter(
        (value): value is number => value != null && Number.isFinite(value),
      );
      if (validValues.length === 0) return [];
      const paystubIds = new Set(
        chosen.flatMap((scenario) => scenario.sourcePaystubIds ?? []),
      );
      const sacScenarioCount = chosen.filter(
        (scenario) => scenario.scenarioType === "sac" || scenario.sac > 0,
      ).length;
      return [
        {
          period,
          value: roundMoney(
            aggregation === "sum"
              ? validValues.reduce((sum, value) => sum + value, 0)
              : validValues.reduce((sum, value) => sum + value, 0) /
                  validValues.length,
          ),
          aggregation,
          scenarioCount: chosen.length,
          receiptCount: paystubIds.size,
          sacScenarioCount,
          hasSac: sacScenarioCount > 0,
          hasVacation: chosen.some(
            (scenario) =>
              scenario.scenarioType === "vacation" ||
              (scenario.vacation ?? 0) > 0,
          ),
        },
      ];
    });

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
