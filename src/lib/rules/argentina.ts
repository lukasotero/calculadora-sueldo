import type { RuleSet, RulesResolution, RuleSource } from "@/lib/types";

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

export const EARLIEST_SUPPORTED_PERIOD = "2019-01";
const LATEST_CONFIRMED_PERIOD = "2026-08";
const ARCA_URL =
  "https://www.arca.gob.ar/gananciasYBienes/ganancias/personas-humanas-sucesiones-indivisas/declaracion-jurada/determinativa/determinacion.asp";
const ANSES_URL =
  "https://www.anses.gob.ar/transparencia/toda-la-informacion-sobre-transparencia/actos-administrativos";

const arcaSource: RuleSource = {
  authority: "ARCA",
  title: "Tablas históricas de deducciones personales y escala del artículo 94",
  url: ARCA_URL,
  effectiveFrom: EARLIEST_SUPPORTED_PERIOD,
  verifiedAt: "2026-08-16",
};
const ansesSource: RuleSource = {
  authority: "ANSES",
  title: "Bases imponibles mínima y máxima del SIPA",
  url: ANSES_URL,
  effectiveFrom: EARLIEST_SUPPORTED_PERIOD,
  verifiedAt: "2026-08-16",
};

type AnnualTaxValues = {
  nonTaxable: number;
  special: number;
  spouse: number;
  child: number;
  scaleUnit: number;
};
const annualTaxValues: Record<number, AnnualTaxValues> = {
  2019: {
    nonTaxable: 85_848.99,
    special: 412_075.14,
    spouse: 80_033.97,
    child: 40_361.43,
    scaleUnit: 33_039.81,
  },
  2020: {
    nonTaxable: 123_861.17,
    special: 594_533.62,
    spouse: 115_471.38,
    child: 58_232.65,
    scaleUnit: 47_669.16,
  },
  2021: {
    nonTaxable: 167_678.4,
    special: 804_856.34,
    spouse: 156_320.63,
    child: 78_833.08,
    scaleUnit: 64_532.64,
  },
  2022: {
    nonTaxable: 252_564.84,
    special: 1_212_311.24,
    spouse: 235_457.25,
    child: 118_741.97,
    scaleUnit: 97_202,
  },
  2023: {
    nonTaxable: 451_683.19,
    special: 2_168_079.35,
    spouse: 421_088.24,
    child: 212_356.37,
    scaleUnit: 234_676.72,
  },
  2024: {
    nonTaxable: 3_091_035,
    special: 14_836_968,
    spouse: 2_911_135,
    child: 1_468_096,
    scaleUnit: 1_200_000,
  },
  2025: {
    nonTaxable: 3_916_268.37,
    special: 18_798_088.2,
    spouse: 3_688_339.32,
    child: 1_860_042.98,
    scaleUnit: 1_503_034.6,
  },
  2026: {
    nonTaxable: 5_151_802.5,
    special: 24_728_652.02,
    spouse: 4_851_964.66,
    child: 2_446_863.48,
    scaleUnit: 2_000_030.09,
  },
};
const secondHalfTaxValues: Partial<Record<number, AnnualTaxValues>> = {
  2024: {
    nonTaxable: 3_228_586.36,
    special: 15_497_214.38,
    spouse: 3_043_683.51,
    child: 1_531_426.27,
    scaleUnit: 1_400_000,
  },
  2025: {
    nonTaxable: 4_211_886.94,
    special: 20_217_057.35,
    spouse: 3_966_752.72,
    child: 2_000_447.87,
    scaleUnit: 1_635_136.56,
  },
  2026: {
    nonTaxable: 5_585_736.93,
    special: 26_811_537.29,
    spouse: 5_260_643.86,
    child: 2_652_961.9,
    scaleUnit: 2_168_491.89,
  },
};
const bracketMultipliers = [1, 2, 3, 4.5, 9, 13.5, 20.25, 30.375] as const;
const rates = [0.05, 0.09, 0.12, 0.15, 0.19, 0.23, 0.27, 0.31, 0.35] as const;

function splitPeriod(period: string) {
  const match = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(period);
  return match
    ? { year: Number(match[1]), month: Number(match[2]) }
    : undefined;
}
function accumulate(firstHalf: number, secondHalf: number, month: number) {
  const firstSemester = firstHalf / 2;
  return month <= 6
    ? (firstHalf / 12) * month
    : firstSemester + ((secondHalf - firstSemester) / 6) * (month - 6);
}
function taxValuesFor(year: number, month: number) {
  const first = annualTaxValues[year];
  if (!first) throw new RangeError(`No hay reglas de Ganancias para ${year}.`);
  const second = secondHalfTaxValues[year];
  if (!second || year < 2024) {
    const factor = month / 12;
    return {
      nonTaxable: first.nonTaxable * factor,
      special: first.special * factor,
      spouse: first.spouse * factor,
      child: first.child * factor,
      scaleUnit: first.scaleUnit * factor,
    };
  }
  return {
    nonTaxable: accumulate(first.nonTaxable, second.nonTaxable, month),
    special: accumulate(first.special, second.special, month),
    spouse: accumulate(first.spouse, second.spouse, month),
    child: accumulate(first.child, second.child, month),
    scaleUnit: accumulate(first.scaleUnit, second.scaleUnit, month),
  };
}
function createBrackets(unit: number): TaxBracket[] {
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

function createOctober2023CedularBrackets(month: number): TaxBracket[] {
  const factor = month - 9;
  const limits = [
    1_600_000, 1_744_000, 1_883_520, 2_015_366.4, 2_136_288.39, 2_243_102.8,
    2_332_826.91, 2_402_811.73,
  ].map((value) => value * factor);
  const cedularRates = [0, 0.09, 0.12, 0.15, 0.19, 0.23, 0.27, 0.31, 0.35];
  let fixed = 0;
  let over = 0;
  return cedularRates.map((rate, index) => {
    const upTo = limits[index] ?? Infinity;
    const bracket = { upTo, fixed, rate, over };
    if (Number.isFinite(upTo)) {
      fixed += (upTo - over) * rate;
      over = upTo;
    }
    return bracket;
  });
}

const capChanges: Array<[string, number]> = [
  ["2019-01", 105_233.32],
  ["2019-03", 117_682.47],
  ["2019-06", 125_987.76],
  ["2019-09", 129_190.1],
  ["2019-12", 159_028.8],
  ["2020-03", 173_945.7],
  ["2020-06", 198_435.52],
  ["2020-09", 208_357.3],
  ["2020-12", 225_171.69],
  ["2021-06", 252_462.5],
  ["2021-09", 283_742.6],
  ["2021-12", 318_103.83],
  ["2022-03", 357_166.98],
  ["2022-06", 410_742.03],
  ["2022-09", 478_157.3],
  ["2022-12", 548_651.9],
  ["2023-03", 642_142.18],
  ["2023-06", 776_478.32],
  ["2023-09", 957_320.12],
  ["2023-12", 1_157_112.83],
  ["2024-03", 1_471_616.1],
  ["2024-06", 2_359_712.22],
  ["2024-07", 2_535_038.87],
  ["2024-08", 2_588_757.18],
  ["2024-09", 2_625_608.99],
  ["2024-10", 2_674_292.72],
  ["2024-11", 2_711_659.52],
  ["2024-12", 2_778_918.31],
  ["2025-01", 2_910_574.49],
  ["2025-02", 2_989_160],
  ["2025-03", 3_055_220.44],
  ["2025-04", 3_128_545.73],
  ["2025-05", 3_245_240.49],
  ["2025-06", 3_335_458.18],
  ["2025-07", 3_385_490.05],
  ["2025-08", 3_440_334.99],
  ["2025-09", 3_505_701.35],
  ["2025-10", 3_571_608.54],
  ["2025-11", 3_645_898],
  ["2025-12", 3_731_212.01],
  ["2026-01", 3_823_372.95],
  ["2026-02", 3_932_339.08],
  ["2026-03", 4_045_590.45],
  ["2026-04", 4_162_912.57],
  ["2026-05", 4_303_619.01],
  ["2026-06", 4_414_652.38],
  ["2026-07", 4_509_585.35],
  ["2026-08", 4_594_798.23],
];
function contributionCap(period: string) {
  let cap: number | undefined;
  for (const [effectiveFrom, value] of capChanges) {
    if (effectiveFrom > period) break;
    cap = value;
  }
  if (cap === undefined)
    throw new RangeError(`No hay tope previsional para ${period}.`);
  return cap;
}
function clampPeriod(period: string) {
  if (period < EARLIEST_SUPPORTED_PERIOD) return undefined;
  return period > LATEST_CONFIRMED_PERIOD ? LATEST_CONFIRMED_PERIOD : period;
}

export function resolveRules(
  period: string,
  paymentDate?: string,
): RulesResolution {
  if (!splitPeriod(period) || period < EARLIEST_SUPPORTED_PERIOD)
    return {
      requestedPeriod: period,
      status: "unsupported",
      sources: [arcaSource, ansesSource],
      warnings: [
        "El recibo se puede revisar, pero no hay una serie oficial completa anterior a enero de 2019.",
      ],
    };
  const paymentPeriod = /^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(
    paymentDate ?? "",
  )
    ? paymentDate!.slice(0, 7)
    : period;
  const contributionPeriod = clampPeriod(period)!;
  const incomeTaxPeriod = clampPeriod(paymentPeriod);
  if (!incomeTaxPeriod)
    return {
      requestedPeriod: period,
      contributionPeriod,
      status: "unsupported",
      sources: [arcaSource, ansesSource],
      warnings: [
        "La fecha de pago es anterior a la cobertura histórica de Ganancias.",
      ],
    };
  const estimated =
    period > LATEST_CONFIRMED_PERIOD || paymentPeriod > LATEST_CONFIRMED_PERIOD;
  return {
    requestedPeriod: period,
    contributionPeriod,
    incomeTaxPeriod,
    status: estimated ? "estimated" : "exact",
    sources: [arcaSource, ansesSource],
    warnings: [
      ...(!paymentDate
        ? [
            "No se detectó la fecha de pago; Ganancias usa el período devengado como aproximación.",
          ]
        : []),
      ...(estimated
        ? [
            `El período todavía no tiene reglas confirmadas; se aplican las de ${LATEST_CONFIRMED_PERIOD}.`,
          ]
        : []),
    ],
  };
}
export function getIncomeTaxRule(period: string): IncomeTaxRule {
  const parsed = splitPeriod(period);
  if (!parsed) throw new RangeError(`Período inválido: ${period}.`);
  if (parsed.year === 2023 && parsed.month >= 10) {
    return {
      nonTaxableMinimum: 0,
      specialDeduction: 0,
      spouseDeduction: 0,
      childDeduction: 0,
      brackets: createOctober2023CedularBrackets(parsed.month),
    };
  }
  const values = taxValuesFor(parsed.year, parsed.month);
  return {
    nonTaxableMinimum: values.nonTaxable,
    specialDeduction: values.special,
    spouseDeduction: values.spouse,
    childDeduction: values.child,
    brackets: createBrackets(values.scaleUnit),
  };
}
export function getRuleSet(period: string): RuleSet {
  const parsed = splitPeriod(period);
  if (!parsed) throw new RangeError(`Período inválido: ${period}.`);
  const incomeTax = getIncomeTaxRule(period);
  return {
    year: parsed.year,
    month: parsed.month,
    period,
    pensionRate: 0.11,
    healthRate: 0.03,
    pamiRate: 0.03,
    contributionCap: contributionCap(period),
    nonTaxableMinimumYtd: incomeTax.nonTaxableMinimum,
    specialDeductionYtd: incomeTax.specialDeduction,
    spouseDeductionYtd: incomeTax.spouseDeduction,
    childDeductionYtd: incomeTax.childDeduction,
    source:
      "ARCA · tablas históricas art. 30 y art. 94 / ANSES · bases imponibles SIPA",
    sourceUrl: ARCA_URL,
    verifiedAt: "2026-08-16",
  };
}
export function getLatestConfirmedPeriod() {
  return LATEST_CONFIRMED_PERIOD;
}
export function getSupportedPeriods() {
  const periods: string[] = [];
  for (let year = 2019; year <= 2026; year += 1) {
    const lastMonth = year === 2026 ? 8 : 12;
    for (let month = 1; month <= lastMonth; month += 1)
      periods.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return periods;
}
