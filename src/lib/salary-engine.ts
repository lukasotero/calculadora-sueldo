import {
  getIncomeTaxRule,
  getLatestConfirmedPeriod,
  getRuleSet,
  type TaxBracket,
} from "@/lib/rules/argentina-2026";
import type {
  NetToGrossScenario,
  SalaryResult,
  SalaryScenario,
} from "@/lib/types";
import { roundMoney } from "@/lib/utils";

function progressiveTax(taxable: number, brackets: TaxBracket[]) {
  if (taxable <= 0) return 0;
  const bracket = brackets.find((item) => taxable <= item.upTo)!;
  return bracket.fixed + (taxable - bracket.over) * bracket.rate;
}

function employeeContributions(remunerative: number, period: string) {
  const rules = getRuleSet(period);
  const contributionBase = Math.min(remunerative, rules.contributionCap);
  return {
    contributionBase,
    pension: roundMoney(contributionBase * rules.pensionRate),
    health: roundMoney(contributionBase * rules.healthRate),
    pami: roundMoney(contributionBase * rules.pamiRate),
  };
}

function calculateAccumulatedTax(
  taxableIncome: number,
  generalDeductions: number,
  period: string,
  spouse = false,
  children = 0,
) {
  const taxRule = getIncomeTaxRule(period);
  const taxable = Math.max(
    0,
    taxableIncome -
      generalDeductions -
      taxRule.nonTaxableMinimum -
      taxRule.specialDeduction -
      (spouse ? taxRule.spouseDeduction : 0) -
      children * taxRule.childDeduction,
  );
  return {
    taxable,
    tax: roundMoney(progressiveTax(taxable, taxRule.brackets)),
  };
}

export function calculateSalary(scenario: SalaryScenario): SalaryResult {
  const rules = getRuleSet(scenario.period);
  const hourly = scenario.basicSalary / 200;
  const seniority = scenario.basicSalary * (scenario.seniority / 100);
  const remunerative = roundMoney(
    scenario.basicSalary +
      seniority +
      hourly * 1.5 * scenario.overtime50Hours +
      hourly * 2 * scenario.overtime100Hours +
      hourly * 2 * scenario.holidayHours +
      scenario.commissions +
      scenario.bonuses +
      scenario.sac,
  );
  const { contributionBase, pension, health, pami } = employeeContributions(
    remunerative,
    scenario.period,
  );
  const union = roundMoney(
    scenario.unionMode === "rate"
      ? (remunerative * scenario.unionValue) / 100
      : scenario.unionValue,
  );
  const currentGeneralDeductions =
    pension + health + pami + union + scenario.otherDeductions;
  const accumulated = calculateAccumulatedTax(
    scenario.ytd.taxableIncome + remunerative,
    scenario.ytd.generalDeductions + currentGeneralDeductions,
    scenario.period,
    scenario.spouse,
    scenario.children,
  );
  const incomeTax = roundMoney(
    Math.max(0, accumulated.tax - scenario.ytd.withheldTax),
  );
  const deductions = roundMoney(currentGeneralDeductions + incomeTax);
  const projected = calculateSteadyIncomeTax(
    remunerative,
    scenario.period,
    scenario.unionMode === "rate" ? scenario.unionValue : 0,
  );

  return {
    basicEquivalent: scenario.basicSalary,
    remunerative,
    nonRemunerative: scenario.nonRemunerative,
    gross: remunerative + scenario.nonRemunerative,
    contributionBase,
    pension,
    health,
    pami,
    union,
    incomeTax,
    otherDeductions: scenario.otherDeductions,
    deductions,
    net: roundMoney(remunerative + scenario.nonRemunerative - deductions),
    taxableYtd: accumulated.taxable,
    rulesSource: rules.source,
    rulesVerifiedAt: rules.verifiedAt,
    mayPayIncomeTax: projected > 0,
    assumptions: [
      "Jornada mensual de referencia: 200 horas.",
      "Ganancias usa las tablas acumuladas oficiales y depende de los datos informados.",
      ...(remunerative > rules.contributionCap
        ? [
            `Se aplicó el tope previsional de ${rules.contributionCap.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}.`,
          ]
        : []),
    ],
  };
}

function periodForMonth(month: number) {
  return `2026-${String(month).padStart(2, "0")}`;
}

export function calculateSteadyIncomeTax(
  monthlyGross: number,
  period: string,
  unionRate = 0,
) {
  const month = getRuleSet(period).month;
  let accumulatedDeductions = 0;
  let previousTax = 0;

  for (let currentMonth = 1; currentMonth <= month; currentMonth++) {
    const currentPeriod = periodForMonth(currentMonth);
    const contributions = employeeContributions(monthlyGross, currentPeriod);
    accumulatedDeductions +=
      contributions.pension +
      contributions.health +
      contributions.pami +
      roundMoney((monthlyGross * unionRate) / 100);
    const accumulated = calculateAccumulatedTax(
      monthlyGross * currentMonth,
      accumulatedDeductions,
      currentPeriod,
    );
    if (currentMonth === month) {
      return roundMoney(Math.max(0, accumulated.tax - previousTax));
    }
    previousTax = accumulated.tax;
  }
  return 0;
}

export function calculateNetToGross(input: NetToGrossScenario): SalaryResult {
  const unionRate = input.unionEnabled ? input.unionRate : 0;
  let low = 0;
  let high = Math.max(input.targetNet * 3, 100_000);

  for (let iteration = 0; iteration < 100; iteration++) {
    const gross = (low + high) / 2;
    const contributions = employeeContributions(gross, input.period);
    const union = roundMoney((gross * unionRate) / 100);
    const incomeTax = calculateSteadyIncomeTax(gross, input.period, unionRate);
    const net =
      gross -
      contributions.pension -
      contributions.health -
      contributions.pami -
      union -
      incomeTax;
    if (net < input.targetNet) low = gross;
    else high = gross;
  }

  const gross = roundMoney(high);
  const rules = getRuleSet(input.period);
  const contributions = employeeContributions(gross, input.period);
  const union = roundMoney((gross * unionRate) / 100);
  const incomeTax = calculateSteadyIncomeTax(gross, input.period, unionRate);
  const deductions = roundMoney(
    contributions.pension +
      contributions.health +
      contributions.pami +
      union +
      incomeTax,
  );

  return {
    basicEquivalent: gross,
    remunerative: gross,
    nonRemunerative: 0,
    gross,
    contributionBase: contributions.contributionBase,
    pension: contributions.pension,
    health: contributions.health,
    pami: contributions.pami,
    union,
    incomeTax,
    otherDeductions: 0,
    deductions,
    net: roundMoney(gross - deductions),
    taxableYtd: 0,
    rulesSource: rules.source,
    rulesVerifiedAt: rules.verifiedAt,
    mayPayIncomeTax: incomeTax > 0,
    assumptions: [
      "Un único empleador y el mismo sueldo mensual desde enero.",
      "Sin cargas de familia, deducciones de SiRADIG, bonos, SAC ni retroactivos.",
      "El básico equivalente coincide con el bruto porque no se agregaron adicionales.",
      ...(unionRate > 0
        ? [
            "La cuota sindical se estimó sobre el bruto remunerativo; el convenio puede definir otra base.",
          ]
        : []),
    ],
  };
}

export function solveGrossForNet(targetNet: number, base: SalaryScenario) {
  return calculateNetToGross({
    targetNet,
    period: base.period,
    unionEnabled: base.unionValue > 0,
    unionRate: base.unionMode === "rate" ? base.unionValue : 0,
  }).gross;
}

export const defaultScenario: SalaryScenario = {
  id: "actual",
  name: "Mi escenario",
  period: getLatestConfirmedPeriod(),
  basicSalary: 1_800_000,
  seniority: 0,
  overtime50Hours: 0,
  overtime100Hours: 0,
  holidayHours: 0,
  commissions: 0,
  bonuses: 0,
  nonRemunerative: 0,
  sac: 0,
  unionMode: "rate",
  unionValue: 0,
  spouse: false,
  children: 0,
  otherDeductions: 0,
  ytd: { taxableIncome: 0, generalDeductions: 0, withheldTax: 0 },
};
