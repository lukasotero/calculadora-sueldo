import {
  getIncomeTaxRule,
  getLatestConfirmedPeriod,
  getRuleSet,
  type TaxBracket,
} from "@/lib/rules/argentina-2026";
import { resolveRules } from "@/lib/rules/argentina-2026";
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

function employeeContributions(
  remunerative: number,
  period: string,
  healthContributoryNonRemunerative = 0,
) {
  const rules = getRuleSet(period);
  const contributionBase = Math.min(remunerative, rules.contributionCap);
  const healthContributionBase = roundMoney(
    Math.min(
      remunerative + healthContributoryNonRemunerative,
      rules.contributionCap,
    ),
  );
  return {
    contributionBase,
    healthContributionBase,
    pension: roundMoney(contributionBase * rules.pensionRate),
    health: roundMoney(healthContributionBase * rules.healthRate),
    pami: roundMoney(contributionBase * rules.pamiRate),
  };
}

export function isHealthContributoryConcept(
  concept: NonNullable<SalaryScenario["sourceConcepts"]>[number],
  period: string,
) {
  if (period < "2024-04" || period > "2025-06") return false;
  return (
    concept.selected &&
    concept.treatment === "non-remunerative" &&
    (["agreement-adjustment", "attendance", "seniority", "sac"] as const).some(
      (nature) => concept.nature === nature,
    )
  );
}

function healthContributoryNonRemunerative(scenario: SalaryScenario) {
  if (scenario.period < "2024-04" || scenario.period > "2025-06") return 0;
  return (scenario.sourceConcepts ?? [])
    .filter((concept) => isHealthContributoryConcept(concept, scenario.period))
    .reduce((total, concept) => total + concept.amount, 0);
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
  const rulesResolution = resolveRules(scenario.period, scenario.paymentDate);
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
      (scenario.vacation ?? 0) +
      scenario.sac,
  );
  if (
    rulesResolution.status === "unsupported" ||
    !rulesResolution.contributionPeriod ||
    !rulesResolution.incomeTaxPeriod
  ) {
    const gross = roundMoney(remunerative + scenario.nonRemunerative);
    const reimbursements = scenario.reimbursements ?? 0;
    return {
      basicEquivalent: scenario.basicSalary,
      remunerative,
      nonRemunerative: scenario.nonRemunerative,
      reimbursements,
      gross,
      contributionBase: 0,
      pension: 0,
      health: 0,
      pami: 0,
      union: 0,
      incomeTax: 0,
      otherDeductions: scenario.otherDeductions,
      deductions: scenario.otherDeductions,
      net: gross + reimbursements - scenario.otherDeductions,
      taxableYtd: 0,
      rulesSource: "Sin reglas históricas completas",
      rulesVerifiedAt: "2026-08-16",
      mayPayIncomeTax: false,
      assumptions: rulesResolution.warnings,
      rulesResolution,
    };
  }
  const rules = getRuleSet(rulesResolution.contributionPeriod);
  const healthContributoryAmount = healthContributoryNonRemunerative(scenario);
  const { contributionBase, healthContributionBase, pension, health, pami } =
    employeeContributions(
      remunerative,
      rulesResolution.contributionPeriod,
      healthContributoryAmount,
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
    rulesResolution.incomeTaxPeriod,
    scenario.spouse,
    scenario.children,
  );
  const incomeTax = roundMoney(
    Math.max(0, accumulated.tax - scenario.ytd.withheldTax),
  );
  const deductions = roundMoney(currentGeneralDeductions + incomeTax);
  const projected = calculateSteadyIncomeTax(
    remunerative,
    rulesResolution.incomeTaxPeriod,
    scenario.unionMode === "rate" ? scenario.unionValue : 0,
  );

  return {
    basicEquivalent: scenario.basicSalary,
    remunerative,
    nonRemunerative: scenario.nonRemunerative,
    reimbursements: scenario.reimbursements ?? 0,
    gross: roundMoney(remunerative + scenario.nonRemunerative),
    contributionBase,
    healthContributionBase,
    pension,
    health,
    pami,
    union,
    incomeTax,
    otherDeductions: scenario.otherDeductions,
    deductions,
    net: roundMoney(
      remunerative +
        scenario.nonRemunerative +
        (scenario.reimbursements ?? 0) -
        deductions,
    ),
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
      ...(healthContributoryAmount > 0
        ? [
            `La base de obra social incluye ${healthContributoryAmount.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} no remunerativos alcanzados por acuerdos mercantiles.`,
          ]
        : []),
      ...rulesResolution.warnings,
    ],
    rulesResolution,
  };
}

function periodForMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function calculateSteadyIncomeTax(
  monthlyGross: number,
  period: string,
  unionRate = 0,
) {
  const resolution = resolveRules(period);
  if (!resolution.incomeTaxPeriod) return 0;
  const { year, month } = getRuleSet(resolution.incomeTaxPeriod);
  let accumulatedDeductions = 0;
  let previousTax = 0;

  for (let currentMonth = 1; currentMonth <= month; currentMonth++) {
    const currentPeriod = periodForMonth(year, currentMonth);
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
  const resolution = resolveRules(input.period);
  if (!resolution.contributionPeriod || !resolution.incomeTaxPeriod) {
    return calculateSalary({
      ...defaultScenario,
      period: input.period,
      basicSalary: input.targetNet,
    });
  }
  const unionRate = input.unionEnabled ? input.unionRate : 0;
  let low = 0;
  let high = Math.max(input.targetNet * 3, 100_000);

  for (let iteration = 0; iteration < 100; iteration++) {
    const gross = (low + high) / 2;
    const contributions = employeeContributions(
      gross,
      resolution.contributionPeriod,
    );
    const union = roundMoney((gross * unionRate) / 100);
    const incomeTax = calculateSteadyIncomeTax(
      gross,
      resolution.incomeTaxPeriod,
      unionRate,
    );
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
  const rules = getRuleSet(resolution.contributionPeriod);
  const contributions = employeeContributions(
    gross,
    resolution.contributionPeriod,
  );
  const union = roundMoney((gross * unionRate) / 100);
  const incomeTax = calculateSteadyIncomeTax(
    gross,
    resolution.incomeTaxPeriod,
    unionRate,
  );
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
    reimbursements: 0,
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
      ...resolution.warnings,
    ],
    rulesResolution: resolution,
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
  period: getLatestConfirmedPeriod(),
  basicSalary: 1_800_000,
  seniority: 0,
  overtime50Hours: 0,
  overtime100Hours: 0,
  holidayHours: 0,
  commissions: 0,
  bonuses: 0,
  nonRemunerative: 0,
  reimbursements: 0,
  sac: 0,
  vacation: 0,
  unionMode: "rate",
  unionValue: 0,
  spouse: false,
  children: 0,
  otherDeductions: 0,
  ytd: { taxableIncome: 0, generalDeductions: 0, withheldTax: 0 },
};
