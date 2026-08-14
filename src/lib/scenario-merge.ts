import type { ParsedPaystub, SalaryScenario } from "@/lib/types";
import { sumAdditionalPaystubDeductions } from "@/lib/paystub-parser";

export function isStandaloneSacPaystub(parsed: ParsedPaystub) {
  const remunerative = parsed.items.filter(
    (item) => item.selected && item.kind === "remunerative",
  );
  return (
    remunerative.length > 0 &&
    remunerative.every((item) => item.destination === "sac")
  );
}

export function scenarioFromPaystub(
  base: SalaryScenario,
  parsed: ParsedPaystub,
): SalaryScenario {
  const standaloneSac = isStandaloneSacPaystub(parsed);
  const salary = parsed.items
    .filter(
      (item) =>
        item.selected &&
        item.kind === "remunerative" &&
        item.destination !== "sac",
    )
    .reduce((sum, item) => sum + item.amount, 0);
  const sac = parsed.items
    .filter(
      (item) =>
        item.selected &&
        item.kind === "remunerative" &&
        item.destination === "sac",
    )
    .reduce((sum, item) => sum + item.amount, 0);
  const nonRemunerative = parsed.items
    .filter((item) => item.selected && item.kind === "non-remunerative")
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    ...base,
    period: parsed.period ?? base.period,
    paymentDate: parsed.paymentDate,
    basicSalary: standaloneSac ? 0 : salary || base.basicSalary,
    sac,
    nonRemunerative,
    otherDeductions: sumAdditionalPaystubDeductions(parsed.deductions),
    scenarioType: standaloneSac ? "sac" : "salary",
    sourcePaystubIds: [parsed.id],
  };
}

export function mergeSacScenario(
  scenarios: SalaryScenario[],
  sacId: string,
  targetId: string,
) {
  const sac = scenarios.find((scenario) => scenario.id === sacId);
  const target = scenarios.find((scenario) => scenario.id === targetId);
  if (
    !sac ||
    sac.scenarioType !== "sac" ||
    !target ||
    target.scenarioType === "sac" ||
    target.period !== sac.period
  ) {
    return scenarios;
  }

  const sourcePaystubIds = [
    ...(target.sourcePaystubIds ?? []),
    ...(sac.sourcePaystubIds ?? []),
  ].filter((id, index, values) => values.indexOf(id) === index);

  return scenarios.reduce<SalaryScenario[]>((merged, scenario) => {
    if (scenario.id === sacId) return merged;
    merged.push(
      scenario.id === targetId
        ? {
            ...scenario,
            sac: scenario.sac + sac.sac,
            nonRemunerative: scenario.nonRemunerative + sac.nonRemunerative,
            otherDeductions: scenario.otherDeductions + sac.otherDeductions,
            scenarioType: "salary" as const,
            sourcePaystubIds,
          }
        : scenario,
    );
    return merged;
  }, []);
}
