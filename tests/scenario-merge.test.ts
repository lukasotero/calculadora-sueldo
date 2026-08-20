import { describe, expect, it } from "vitest";
import { calculateSalary, defaultScenario } from "@/lib/salary-engine";
import { auditPaystub } from "@/lib/paystub-parser";
import {
  isStandaloneSacPaystub,
  isStandaloneVacationPaystub,
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
  it("creates an exclusive vacation scenario with independent contribution bases", () => {
    const parsed: ParsedPaystub = {
      id: "vacation-file",
      fileName: "vacaciones-2025-07.pdf",
      period: "2025-07",
      items: [],
      deductions: [],
      rawText: "liquidación digital de vacaciones con contenido suficiente",
      warnings: [],
      concepts: [
        ["Anticipo vacaciones", 89_777.73, "vacation", "remunerative"],
        ["Vacaciones gozadas", 538_666.36, "vacation", "remunerative"],
        [
          "Suma fija no remunerativa",
          22_400,
          "agreement-adjustment",
          "non-remunerative",
        ],
        ["Antigüedad suma fija", 224, "seniority", "non-remunerative"],
        ["Presentismo suma fija", 1_884.58, "attendance", "non-remunerative"],
        ["Redondeo", 0.63, "rounding", "non-remunerative"],
        ["Jubilación", 69_128.85, "pension", "deduction"],
        ["Ley 19.032", 18_853.32, "pami", "deduction"],
        ["SEC", 13_059.05, "union", "deduction"],
        ["FAECYS", 3_264.76, "union", "deduction"],
        ["Obra social", 18_853.32, "health", "deduction"],
        ["Descuento no remunerativo", 1, "other-deduction", "deduction"],
      ].map(([name, amount, nature, treatment], index) => ({
        id: `vacation-${index}`,
        name: String(name),
        amount: Number(amount),
        nature: nature as NonNullable<
          ParsedPaystub["concepts"]
        >[number]["nature"],
        treatment: treatment as NonNullable<
          ParsedPaystub["concepts"]
        >[number]["treatment"],
        selected: true,
        evidence: {
          originalText: String(name),
          page: 1,
          confidence: "high" as const,
        },
        classificationConfidence: "high" as const,
      })),
    };
    const scenario = scenarioFromPaystub(defaultScenario, parsed);
    const result = calculateSalary(scenario);

    expect(isStandaloneVacationPaystub(parsed)).toBe(true);
    expect(scenario).toMatchObject({
      scenarioType: "vacation",
      basicSalary: 0,
      vacation: 628_444.09,
      nonRemunerative: 24_509.21,
    });
    expect(result).toMatchObject({
      remunerative: 628_444.09,
      gross: 652_953.3,
      deductions: 123_160.3,
      net: 529_793,
    });
  });

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

  it("never imports the calculator demo salary into a receipt without a basic", () => {
    const parsed = paystub("bonus-file", "salary", 250_000);
    parsed.items[0].name = "BONO EXTRAORDINARIO";

    expect(scenarioFromPaystub(defaultScenario, parsed)).toMatchObject({
      basicSalary: 250_000,
    });

    parsed.concepts = [
      {
        id: "bonus",
        name: "BONO EXTRAORDINARIO",
        amount: 250_000,
        nature: "bonus",
        treatment: "remunerative",
        selected: true,
        evidence: { originalText: "BONO", page: 1, confidence: "high" },
        classificationConfidence: "high",
      },
    ];
    expect(scenarioFromPaystub(defaultScenario, parsed)).toMatchObject({
      basicSalary: 0,
      bonuses: 250_000,
    });
  });

  it("audits a mixed remunerative and non-remunerative SAC without false positives", () => {
    const parsed = paystub("mixed-sac", "sac", 530_024);
    parsed.period = "2024-06";
    parsed.items.push({
      ...parsed.items[0],
      id: "non-rem-sac",
      name: "SAC S/Incremento N/Rem",
      amount: 47_414,
      kind: "non-remunerative",
    });
    parsed.deductions = [
      ["Jubilación", 58_302.64],
      ["Ley 19.032 3 %", 15_900.72],
      ["S.E.C. 2%", 11_548.76],
      ["F.A.E.C.Y.S. 0.5%", 2_887.19],
      ["OSECAC-OS DE LOS EMPLEADOS DE", 17_323.14],
    ].map(([name, amount], index) => ({
      id: `deduction-${index}`,
      name: String(name),
      amount: Number(amount),
      selected: true,
      evidence: { originalText: String(name), page: 1, confidence: "high" },
    }));
    parsed.printedTotals = {
      remunerative: 530_024,
      nonRemunerative: 47_414,
      gross: 577_438,
      deductions: 105_962.45,
      net: 471_475.55,
    };
    parsed.statedNet = 471_475.55;

    const scenario = scenarioFromPaystub(defaultScenario, parsed);
    const result = calculateSalary(scenario);
    const findings = auditPaystub(parsed, result);

    expect(scenario).toMatchObject({
      basicSalary: 0,
      sac: 530_024,
      nonRemunerative: 47_414,
      scenarioType: "sac",
    });
    expect(result).toMatchObject({
      contributionBase: 530_024,
      healthContributionBase: 577_438,
      pension: 58_302.64,
      pami: 15_900.72,
      health: 17_323.14,
      net: 471_475.55,
    });
    expect(findings.every((finding) => finding.status === "matched")).toBe(
      true,
    );
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

    const vacation = {
      ...monthly,
      id: "vacation",
      scenarioType: "vacation" as const,
      vacation: 300_000,
    };
    expect(mergeSacScenario([vacation, sac], "sac", "vacation")).toEqual([
      vacation,
      sac,
    ]);
  });
});
