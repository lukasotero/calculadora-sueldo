import { describe, expect, it } from "vitest";
import {
  calculateNetToGross,
  calculateSalary,
  calculateSteadyIncomeTax,
  defaultScenario,
  solveGrossForNet,
} from "@/lib/salary-engine";

describe("salary engine", () => {
  it("applies the three general employee contributions", () => {
    const result = calculateSalary({
      ...defaultScenario,
      basicSalary: 1_000_000,
    });
    expect(result.pension).toBe(110_000);
    expect(result.health).toBe(30_000);
    expect(result.pami).toBe(30_000);
    expect(result.net).toBe(830_000);
  });
  it("supports fixed and percentage union dues", () => {
    const rate = calculateSalary({
      ...defaultScenario,
      basicSalary: 1_000_000,
      unionMode: "rate",
      unionValue: 2,
    });
    const fixed = calculateSalary({
      ...defaultScenario,
      basicSalary: 1_000_000,
      unionMode: "fixed",
      unionValue: 25_000,
    });
    expect(rate.union).toBe(20_000);
    expect(fixed.union).toBe(25_000);
  });
  it("keeps non-remunerative earnings outside contribution base", () => {
    const result = calculateSalary({
      ...defaultScenario,
      basicSalary: 1_000_000,
      nonRemunerative: 100_000,
    });
    expect(result.net).toBe(930_000);
  });
  it("solves a gross salary for a desired net", () => {
    const target = 1_200_000;
    const gross = solveGrossForNet(target, defaultScenario);
    const result = calculateSalary({ ...defaultScenario, basicSalary: gross });
    expect(Math.abs(result.net - target)).toBeLessThan(1);
  });
  it("solves the standard net flow with official deductions", () => {
    const result = calculateNetToGross({
      targetNet: 3_500_000,
      period: "2026-08",
      unionEnabled: false,
      unionRate: 0,
    });
    expect(Math.abs(result.net - 3_500_000)).toBeLessThan(1);
    expect(result.basicEquivalent).toBe(result.gross);
    expect(result.incomeTax).toBeGreaterThan(0);
  });
  it("includes an optional union rate in the inverse calculation", () => {
    const withoutUnion = calculateNetToGross({
      targetNet: 2_000_000,
      period: "2026-08",
      unionEnabled: false,
      unionRate: 2,
    });
    const withUnion = calculateNetToGross({
      targetNet: 2_000_000,
      period: "2026-08",
      unionEnabled: true,
      unionRate: 2,
    });
    expect(withUnion.gross).toBeGreaterThan(withoutUnion.gross);
    expect(Math.abs(withUnion.net - 2_000_000)).toBeLessThan(1);
  });
  it("uses the August 2026 official contribution cap", () => {
    const result = calculateSalary({
      ...defaultScenario,
      basicSalary: 10_000_000,
    });
    expect(result.contributionBase).toBe(4_594_798.23);
    expect(result.pension).toBe(505_427.81);
  });
  it("calculates income tax as the current cumulative difference", () => {
    const july = calculateSteadyIncomeTax(5_000_000, "2026-07");
    const august = calculateSteadyIncomeTax(5_000_000, "2026-08");
    expect(july).toBeGreaterThan(0);
    expect(august).toBeGreaterThan(0);
    expect(august).not.toBe(july);
  });
  it("rejects periods without confirmed contribution rules", () => {
    expect(() =>
      calculateNetToGross({
        targetNet: 1_000_000,
        period: "2026-09",
        unionEnabled: false,
        unionRate: 0,
      }),
    ).toThrow(/No hay una base imponible oficial confirmada/);
  });
  it("applies contribution caps", () => {
    const result = calculateSalary({
      ...defaultScenario,
      basicSalary: 10_000_000,
    });
    expect(result.pension).toBeLessThan(1_100_000);
    expect(result.assumptions.some((item) => item.includes("tope"))).toBe(true);
  });
  it("flags income tax potential independently from accumulated values", () => {
    const below = calculateSalary({
      ...defaultScenario,
      period: "2026-08",
      basicSalary: 2_000_000,
    });
    const above = calculateSalary({
      ...defaultScenario,
      period: "2026-08",
      basicSalary: 4_000_000,
    });

    expect(below.mayPayIncomeTax).toBe(false);
    expect(above.mayPayIncomeTax).toBe(true);
  });
  it("keeps the potential flag stable when prior accumulations change", () => {
    const scenario = {
      ...defaultScenario,
      basicSalary: 4_000_000,
    };
    const withoutAccumulations = calculateSalary(scenario);
    const withAccumulations = calculateSalary({
      ...scenario,
      ytd: {
        taxableIncome: 20_000_000,
        generalDeductions: 3_000_000,
        withheldTax: 500_000,
      },
    });

    expect(withAccumulations.mayPayIncomeTax).toBe(
      withoutAccumulations.mayPayIncomeTax,
    );
  });
});
