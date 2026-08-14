import { describe, expect, it } from "vitest";
import { defaultScenario } from "@/lib/salary-engine";
import {
  isStandaloneSacPaystub,
  mergeSacScenario,
  scenarioFromPaystub,
} from "@/lib/scenario-merge";
import type { ParsedPaystub, SalaryScenario } from "@/lib/types";

function paystub(
  id: string,
  destination: "salary" | "sac",
  amount: number,
): ParsedPaystub {
  return {
    id,
    fileName: `${id}.pdf`,
    period: "2026-06",
    items: [
      {
        id: `${id}-item`,
        name: destination === "sac" ? "AGUINALDO" : "SUELDO",
        amount,
        kind: "remunerative",
        destination,
        selected: true,
        evidence: { originalText: "", page: 1, confidence: "high" },
      },
    ],
    deductions: [],
    rawText: "recibo digital con contenido suficiente para la prueba",
    warnings: [],
  };
}

describe("SAC scenario flow", () => {
  it("creates an individual SAC scenario without a basic salary", () => {
    const parsed = paystub("sac-file", "sac", 500_000);
    expect(isStandaloneSacPaystub(parsed)).toBe(true);

    expect(scenarioFromPaystub(defaultScenario, parsed)).toMatchObject({
      period: "2026-06",
      basicSalary: 0,
      sac: 500_000,
      scenarioType: "sac",
      sourcePaystubIds: ["sac-file"],
    });
  });

  it("does not treat a mixed receipt as an individual SAC", () => {
    const parsed = paystub("mixed", "sac", 500_000);
    parsed.items.push({
      ...parsed.items[0],
      id: "salary-item",
      name: "SUELDO",
      amount: 1_000_000,
      destination: "salary",
    });

    expect(isStandaloneSacPaystub(parsed)).toBe(false);
    expect(scenarioFromPaystub(defaultScenario, parsed)).toMatchObject({
      basicSalary: 1_000_000,
      sac: 500_000,
      scenarioType: "salary",
    });
  });

  it("merges only into a monthly scenario of the same period", () => {
    const monthly: SalaryScenario = {
      ...defaultScenario,
      id: "monthly",
      period: "2026-06",
      sac: 100_000,
      sourcePaystubIds: ["monthly-file"],
      exchangeRate: { rate: 1_400, date: "2026-06-30", source: "BCRA" },
    };
    const sac: SalaryScenario = {
      ...defaultScenario,
      id: "sac",
      period: "2026-06",
      basicSalary: 0,
      sac: 500_000,
      nonRemunerative: 20_000,
      otherDeductions: 5_000,
      scenarioType: "sac",
      sourcePaystubIds: ["sac-file"],
      exchangeRate: { rate: 1_500, date: "2026-07-01", source: "BCRA" },
    };

    const merged = mergeSacScenario([monthly, sac], "sac", "monthly");
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "monthly",
      sac: 600_000,
      nonRemunerative: 20_000,
      otherDeductions: 5_000,
      sourcePaystubIds: ["monthly-file", "sac-file"],
      exchangeRate: monthly.exchangeRate,
    });

    const otherMonth = { ...monthly, id: "other", period: "2026-05" };
    expect(mergeSacScenario([otherMonth, sac], "sac", "other")).toEqual([
      otherMonth,
      sac,
    ]);
  });
});
