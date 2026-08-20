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
  it("includes mercantile non-remunerative agreements only in the health base", () => {
    const nonRemunerativeConcepts = [
      ["Incremento No Rem. Abril 2024", 43_318.67],
      ["Presentismo No Rem.Abril 2024", 3_608.45],
      ["Incremento No Rem. Junio 2024", 96_074.62],
      ["Presentismo No Rem.Junio 2024", 8_003.02],
      ["Incremento No Rem.Sept.2024", 64_619.08],
      ["Presentismo No Rem.Sept.2024", 5_382.77],
      ["Incremento No Rem. Enero 2025", 15_571.58],
      ["Presentismo No Rem.Enero 2025", 1_297.11],
    ] as const;
    const result = calculateSalary({
      ...defaultScenario,
      period: "2025-01",
      basicSalary: 771_269.52,
      nonRemunerative: 237_876.18,
      unionMode: "fixed",
      unionValue: 25_228.62,
      otherDeductions: 100,
      sourceConcepts: nonRemunerativeConcepts.map(([name, amount], index) => ({
        id: `agreement-${index}`,
        name,
        amount,
        nature: name.startsWith("Presentismo")
          ? ("attendance" as const)
          : ("agreement-adjustment" as const),
        treatment: "non-remunerative" as const,
        selected: true,
        evidence: { originalText: name, page: 1, confidence: "high" as const },
        classificationConfidence: "high" as const,
      })),
    });

    expect(result.contributionBase).toBe(771_269.52);
    expect(result.healthContributionBase).toBe(1_009_144.82);
    expect(result.pension).toBe(84_839.65);
    expect(result.pami).toBe(23_138.09);
    expect(result.health).toBe(30_274.34);
    expect(result.net).toBe(845_565);
  });
  it("includes non-remunerative seniority additions in the February 2025 health base", () => {
    const concepts = [
      ["Incremento No Rem. Junio 2024", 96_074.62],
      ["Antiguedad No rem.Junio 2024", 960.75],
      ["Presentismo No Rem.Junio 2024", 8_083.05],
      ["Incremento No Rem.Sept.2024", 64_619.08],
      ["Antiguedad No rem.Sep.2024", 646.19],
      ["Presentismo No Rem.Sept.2024", 5_436.6],
      ["Incremento No Rem. Enero 2025", 15_836.3],
      ["Antiguedad No Rem.Enero 2025", 158.36],
      ["Presentismo No Rem.Enero 2025", 1_332.36],
    ] as const;
    const result = calculateSalary({
      ...defaultScenario,
      period: "2025-02",
      basicSalary: 843_415.71,
      nonRemunerative: 193_147.46,
      unionMode: "fixed",
      unionValue: 25_914.08,
      otherDeductions: 100,
      sourceConcepts: concepts.map(([name, amount], index) => ({
        id: `february-agreement-${index}`,
        name,
        amount,
        nature: name.startsWith("Presentismo")
          ? ("attendance" as const)
          : name.startsWith("Antiguedad")
            ? ("seniority" as const)
            : ("agreement-adjustment" as const),
        treatment: "non-remunerative" as const,
        selected: true,
        evidence: { originalText: name, page: 1, confidence: "high" as const },
        classificationConfidence: "high" as const,
      })),
    });

    expect(result.contributionBase).toBe(843_415.71);
    expect(result.healthContributionBase).toBe(1_036_563.02);
    expect(result.health).toBe(31_096.89);
    expect(result.net).toBe(861_374);
  });
  it("includes the April 2025 fixed sum in the mercantile health base", () => {
    const concepts = [
      ["Incremento No Rem Junio", 28_466.55, "agreement-adjustment"],
      ["Antig No rem Junio", 284.67, "seniority"],
      ["Presentismo No Rem Junio", 2_394.98, "attendance"],
      ["Incremento No Rem Sept", 64_619.08, "agreement-adjustment"],
      ["Antig No rem Sept", 646.19, "seniority"],
      ["Presentismo No Rem Sept", 5_436.6, "attendance"],
      ["Incremento No Rem Abril", 18_306.29, "agreement-adjustment"],
      ["Antig No Rem Abril", 183.06, "seniority"],
      ["Presentismo No Rem Abril", 1_540.16, "attendance"],
      ["Suma Fija No Rem", 35_000, "agreement-adjustment"],
    ] as const;
    const result = calculateSalary({
      ...defaultScenario,
      period: "2025-04",
      basicSalary: 952_336.65,
      nonRemunerative: 156_878.26,
      unionMode: "fixed",
      unionValue: 27_730.35,
      otherDeductions: 101,
      sourceConcepts: concepts.map(([name, amount, nature], index) => ({
        id: `april-agreement-${index}`,
        name,
        amount,
        nature,
        treatment: "non-remunerative" as const,
        selected: true,
        evidence: { originalText: name, page: 1, confidence: "high" as const },
        classificationConfidence: "high" as const,
      })),
    });

    expect(result.healthContributionBase).toBe(1_109_214.23);
    expect(result.health).toBe(33_276.43);
    expect(result.net).toBe(914_780);
  });
  it("keeps the May 2025 fixed sum and additions in the health base", () => {
    const concepts = [
      ["Incremento No Rem Sept", 64_619.08, "agreement-adjustment"],
      ["Antig No rem Sept", 646.19, "seniority"],
      ["Presentismo No Rem Sept", 5_436.6, "attendance"],
      ["Incremento No Rem Abril", 17_342.8, "agreement-adjustment"],
      ["Antig No Rem Abril", 173.43, "seniority"],
      ["Presentismo No Rem Abril", 1_459.1, "attendance"],
      ["Suma Fija No Rem", 40_000, "agreement-adjustment"],
      ["Antiguedad s/Suma Fija", 400, "seniority"],
      ["Presentismo s/Suma Fija", 3_365.32, "attendance"],
    ] as const;
    const result = calculateSalary({
      ...defaultScenario,
      period: "2025-05",
      basicSalary: 1_003_512.53,
      nonRemunerative: 133_442.76,
      unionMode: "fixed",
      unionValue: 28_423.88,
      otherDeductions: 100,
      sourceConcepts: concepts.map(([name, amount, nature], index) => ({
        id: `may-agreement-${index}`,
        name,
        amount,
        nature,
        treatment: "non-remunerative" as const,
        selected: true,
        evidence: { originalText: name, page: 1, confidence: "high" as const },
        classificationConfidence: "high" as const,
      })),
    });

    expect(result.healthContributionBase).toBe(1_136_955.05);
    expect(result.health).toBe(34_108.65);
    expect(result.net).toBe(933_831);
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
  it("estimates future periods with the latest confirmed rules", () => {
    const result = calculateNetToGross({
      targetNet: 1_000_000,
      period: "2026-09",
      unionEnabled: false,
      unionRate: 0,
    });
    expect(result.rulesResolution.status).toBe("estimated");
    expect(result.rulesResolution.contributionPeriod).toBe("2026-08");
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
