import type { ParsedPaystub, SalaryScenario } from "@/lib/types";
import { roundMoney } from "@/lib/utils";
import {
  conceptsFromPaystub,
  reconcilePaystub,
  sumAdditionalPaystubDeductions,
} from "@/lib/paystub-parser";

export function isStandaloneSacPaystub(parsed: ParsedPaystub) {
  const earnings = conceptsFromPaystub(parsed).filter(
    (item) =>
      item.selected &&
      (item.treatment === "remunerative" ||
        item.treatment === "non-remunerative"),
  );
  return earnings.length > 0 && earnings.every((item) => item.nature === "sac");
}

export function isStandaloneVacationPaystub(parsed: ParsedPaystub) {
  const earnings = conceptsFromPaystub(parsed).filter(
    (item) =>
      item.selected &&
      (item.treatment === "remunerative" ||
        item.treatment === "non-remunerative"),
  );
  return (
    earnings.some((item) => item.nature === "vacation") &&
    !earnings.some(
      (item) => item.treatment === "remunerative" && item.nature !== "vacation",
    )
  );
}

export function scenarioFromPaystub(
  base: SalaryScenario,
  parsed: ParsedPaystub,
): SalaryScenario {
  const standaloneSac = isStandaloneSacPaystub(parsed);
  const standaloneVacation = isStandaloneVacationPaystub(parsed);
  const concepts = conceptsFromPaystub(parsed);
  const sum = (nature: string, treatment?: string) =>
    concepts
      .filter(
        (item) =>
          item.selected &&
          item.nature === nature &&
          (!treatment || item.treatment === treatment),
      )
      .reduce((total, item) => total + item.amount, 0);
  const nonRemunerative = roundMoney(
    concepts
      .filter(
        (item) =>
          item.selected &&
          item.treatment === "non-remunerative" &&
          item.nature !== "reimbursement",
      )
      .reduce((total, item) => total + item.amount, 0),
  );
  const basicSalary =
    sum("basic-salary", "remunerative") + sum("other-earning", "remunerative");
  const union = sum("union", "deduction");

  return {
    ...base,
    period: parsed.period ?? base.period,
    paymentDate: parsed.paymentDate,
    // Imported monetary values must only come from the receipt. Falling back
    // to the calculator demo salary contaminates SAC and special settlements.
    basicSalary: standaloneSac ? 0 : basicSalary,
    seniority:
      basicSalary > 0
        ? (sum("seniority", "remunerative") / basicSalary) * 100
        : 0,
    overtime50Hours: 0,
    overtime100Hours: 0,
    holidayHours: 0,
    commissions: sum("commission", "remunerative"),
    bonuses:
      sum("bonus", "remunerative") +
      sum("overtime-50", "remunerative") +
      sum("overtime-100", "remunerative") +
      sum("holiday", "remunerative") +
      sum("attendance", "remunerative") +
      sum("agreement-adjustment", "remunerative") +
      sum("rounding", "remunerative"),
    sac: sum("sac", "remunerative"),
    vacation: roundMoney(sum("vacation", "remunerative")),
    nonRemunerative,
    reimbursements: sum("reimbursement"),
    unionMode: "fixed",
    unionValue: union,
    otherDeductions: sumAdditionalPaystubDeductions(concepts) - union,
    scenarioType: standaloneSac
      ? "sac"
      : standaloneVacation
        ? "vacation"
        : "salary",
    sourcePaystubIds: [parsed.id],
    sourceConcepts: concepts,
    sourceReconciliation: reconcilePaystub(parsed),
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
    (target.scenarioType !== undefined && target.scenarioType !== "salary") ||
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
            reimbursements:
              (scenario.reimbursements ?? 0) + (sac.reimbursements ?? 0),
            otherDeductions: scenario.otherDeductions + sac.otherDeductions,
            scenarioType: "salary" as const,
            sourcePaystubIds,
            sourceConcepts: [
              ...(scenario.sourceConcepts ?? []),
              ...(sac.sourceConcepts ?? []),
            ],
          }
        : scenario,
    );
    return merged;
  }, []);
}
