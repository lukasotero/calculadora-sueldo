import { describe, expect, it } from "vitest";
import { defaultScenario } from "@/lib/salary-engine";
import { buildSalaryHistory } from "@/lib/scenario-history";
import type { SalaryScenario } from "@/lib/types";

function scenario(
  id: string,
  period: string,
  basicSalary: number,
  rate?: number,
): SalaryScenario {
  return {
    ...defaultScenario,
    id,
    period,
    basicSalary,
    exchangeRate: rate
      ? { rate, date: `${period}-15`, source: "BCRA" }
      : undefined,
  };
}

describe("salary history", () => {
  it("sorts months and averages scenarios in the same month", () => {
    const points = buildSalaryHistory(
      [
        scenario("2", "2026-08", 2_000_000),
        scenario("1", "2026-07", 1_000_000),
        scenario("3", "2026-07", 3_000_000),
      ],
      "ARS",
    );
    expect(points.map((point) => point.period)).toEqual(["2026-07", "2026-08"]);
    expect(points[0].scenarioCount).toBe(2);
    expect(points[1].change).toBe(0);
    expect(points[1].changePercent).toBe(0);
  });

  it("excludes scenarios without a frozen quote from USD", () => {
    const points = buildSalaryHistory(
      [
        scenario("1", "2026-07", 1_000_000),
        scenario("2", "2026-08", 2_000_000, 1000),
      ],
      "USD",
    );
    expect(points).toHaveLength(1);
    expect(points[0].period).toBe("2026-08");
  });

  it("excludes standalone SAC scenarios until they are merged", () => {
    const monthly = scenario("monthly", "2026-08", 2_000_000);
    const sac = {
      ...scenario("sac", "2026-08", 0),
      scenarioType: "sac" as const,
      sac: 500_000,
    };

    expect(buildSalaryHistory([monthly, sac], "ARS")).toHaveLength(1);
    expect(buildSalaryHistory([monthly, sac], "ARS")[0].scenarioCount).toBe(1);
  });

  it("marks monthly points that include SAC", () => {
    const regular = scenario("regular", "2026-07", 2_000_000);
    const withSac = {
      ...scenario("with-sac", "2026-08", 2_000_000),
      sac: 500_000,
    };

    const points = buildSalaryHistory([regular, withSac], "ARS");

    expect(points[0]).toMatchObject({ hasSac: false, sacScenarioCount: 0 });
    expect(points[1]).toMatchObject({ hasSac: true, sacScenarioCount: 1 });
  });
});
