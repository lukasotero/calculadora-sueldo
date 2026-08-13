import type { RuleSet } from "@/lib/types";

export type TaxBracket = {
  upTo: number;
  fixed: number;
  rate: number;
  over: number;
};

type IncomeTaxRule = {
  nonTaxableMinimum: number;
  specialDeduction: number;
  spouseDeduction: number;
  childDeduction: number;
  brackets: TaxBracket[];
};

const contributionCaps = [
  3_823_372.95, 3_932_339.08, 4_045_590.45, 4_162_912.57, 4_303_619.01,
  4_414_652.38, 4_509_585.35, 4_594_798.23,
] as const;

const nonTaxableMinimum = [
  429_316.88, 858_633.75, 1_287_950.63, 1_717_267.5, 2_146_584.38, 2_575_901.25,
  3_077_540.53, 3_579_179.81, 4_080_819.09, 4_582_458.37, 5_084_097.65,
  5_585_736.93,
] as const;

const specialDeduction = [
  2_060_721, 4_121_442, 6_182_163.01, 8_242_884.01, 10_303_605.01,
  12_364_326.01, 14_772_194.56, 17_180_063.1, 19_587_931.65, 21_995_800.2,
  24_403_668.74, 26_811_537.29,
] as const;

const spouseDeduction = [
  404_330.39, 808_660.78, 1_212_991.17, 1_617_321.55, 2_021_651.94,
  2_425_982.33, 2_898_425.92, 3_370_869.51, 3_843_313.1, 4_315_756.68,
  4_788_200.27, 5_260_643.86,
] as const;

const childDeduction = [
  203_905.29, 407_810.58, 611_715.87, 815_621.16, 1_019_526.45, 1_223_431.74,
  1_461_686.77, 1_699_941.79, 1_938_196.82, 2_176_451.84, 2_414_706.87,
  2_652_961.9,
] as const;

// Primer límite de cada escala mensual oficial. Los demás límites mantienen
// las proporciones definidas por el artículo 94.
const scaleUnits = [
  166_669.17, 333_338.35, 500_007.52, 666_676.7, 833_345.87, 1_000_015.04,
  1_194_761.19, 1_389_507.33, 1_584_253.47, 1_778_999.61, 1_973_745.75,
  2_168_491.89,
] as const;

const bracketMultipliers = [1, 2, 3, 4.5, 9, 13.5, 20.25, 30.375] as const;
const rates = [0.05, 0.09, 0.12, 0.15, 0.19, 0.23, 0.27, 0.31, 0.35] as const;

function getMonth(period: string) {
  return Math.min(12, Math.max(1, Number(period.split("-")[1]) || 1));
}

function createBrackets(month: number): TaxBracket[] {
  const unit = scaleUnits[month - 1];
  const limits = bracketMultipliers.map((multiplier) => unit * multiplier);
  let fixed = 0;
  let over = 0;

  return rates.map((rate, index) => {
    const upTo = limits[index] ?? Infinity;
    const bracket = { upTo, fixed, rate, over };
    if (Number.isFinite(upTo)) {
      fixed += (upTo - over) * rate;
      over = upTo;
    }
    return bracket;
  });
}

export function getIncomeTaxRule(period: string): IncomeTaxRule {
  const month = getMonth(period);
  return {
    nonTaxableMinimum: nonTaxableMinimum[month - 1],
    specialDeduction: specialDeduction[month - 1],
    spouseDeduction: spouseDeduction[month - 1],
    childDeduction: childDeduction[month - 1],
    brackets: createBrackets(month),
  };
}

export function getRuleSet(period: string): RuleSet {
  const month = getMonth(period);
  const cap = contributionCaps[month - 1];
  if (cap === undefined) {
    throw new RangeError(
      `No hay una base imponible oficial confirmada para el período ${period}.`,
    );
  }
  const incomeTax = getIncomeTaxRule(period);
  return {
    year: 2026,
    month,
    pensionRate: 0.11,
    healthRate: 0.03,
    pamiRate: 0.03,
    contributionCap: cap,
    nonTaxableMinimumYtd: incomeTax.nonTaxableMinimum,
    specialDeductionYtd: incomeTax.specialDeduction,
    spouseDeductionYtd: incomeTax.spouseDeduction,
    childDeductionYtd: incomeTax.childDeduction,
    source:
      "ARCA · Tablas art. 30 y art. 94 (julio-diciembre 2026) / ANSES Res. 232/2026",
    verifiedAt: "2026-08-13",
  };
}

export function getLatestConfirmedPeriod() {
  return `2026-${String(contributionCaps.length).padStart(2, "0")}`;
}
