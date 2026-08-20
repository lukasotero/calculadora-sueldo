import { describe, expect, it } from "vitest";
import {
  getIncomeTaxRule,
  getRuleSet,
  getSupportedPeriods,
  resolveRules,
} from "@/lib/rules/argentina";

describe("historical Argentine salary rules", () => {
  it("has a consecutive monthly series from January 2019 through August 2026", () => {
    const periods = getSupportedPeriods();
    expect(periods).toHaveLength(92);
    expect(periods[0]).toBe("2019-01");
    expect(periods.at(-1)).toBe("2026-08");
    periods.forEach((period) => {
      const rules = getRuleSet(period);
      expect(rules.period).toBe(period);
      expect(rules.sourceUrl).toMatch(/^https:\/\//);
      expect(rules.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("matches the corrected official August 2026 values", () => {
    const tax = getIncomeTaxRule("2026-08");
    const contributions = getRuleSet("2026-08");
    expect(tax.nonTaxableMinimum).toBeCloseTo(3_579_179.81, 2);
    expect(tax.specialDeduction).toBeCloseTo(17_180_063.1, 2);
    expect(tax.spouseDeduction).toBeCloseTo(3_370_869.51, 2);
    expect(tax.childDeduction).toBeCloseTo(1_699_941.79, 2);
    expect(contributions.contributionCap).toBe(4_594_798.23);
  });

  it("uses payment date for income tax and accrued period for contributions", () => {
    expect(resolveRules("2025-12", "2026-01-05")).toMatchObject({
      contributionPeriod: "2025-12",
      incomeTaxPeriod: "2026-01",
      status: "exact",
    });
  });

  it("models the October 2023 cedular transition separately", () => {
    const september = getIncomeTaxRule("2023-09");
    const october = getIncomeTaxRule("2023-10");
    expect(september.brackets[0].rate).toBe(0.05);
    expect(october.brackets[0]).toMatchObject({ upTo: 1_600_000, rate: 0 });
    expect(october.brackets[1].rate).toBe(0.09);
  });

  it("keeps pre-2019 receipts reviewable but unsupported for calculations", () => {
    expect(resolveRules("2018-12").status).toBe("unsupported");
  });

  it("clamps future calculations and records an explicit warning", () => {
    const resolution = resolveRules("2027-01");
    expect(resolution.status).toBe("estimated");
    expect(resolution.contributionPeriod).toBe("2026-08");
    expect(resolution.warnings.join(" ")).toContain("2026-08");
  });
});
