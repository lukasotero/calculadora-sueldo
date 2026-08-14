export type Confidence = "high" | "medium" | "low";
export type ConceptKind = "remunerative" | "non-remunerative" | "deduction";

export interface EarningItem {
  id: string;
  name: string;
  amount: number;
  kind: Exclude<ConceptKind, "deduction">;
}

export interface DeductionItem {
  id: string;
  name: string;
  amount: number;
  rate?: number;
}

export interface TaxYearToDate {
  taxableIncome: number;
  generalDeductions: number;
  withheldTax: number;
}

export interface ExchangeRateSnapshot {
  rate: number;
  date: string;
  source: "BCRA";
  period?: string;
  reference?: "latest" | "payment-date" | "month-close";
  requestedDate?: string;
}

export interface SalaryScenario {
  id: string;
  period: string;
  basicSalary: number;
  seniority: number;
  overtime50Hours: number;
  overtime100Hours: number;
  holidayHours: number;
  commissions: number;
  bonuses: number;
  nonRemunerative: number;
  sac: number;
  unionMode: "rate" | "fixed";
  unionValue: number;
  spouse: boolean;
  children: number;
  otherDeductions: number;
  ytd: TaxYearToDate;
  exchangeRate?: ExchangeRateSnapshot;
  paymentDate?: string;
  scenarioType?: "salary" | "sac";
  sourcePaystubIds?: string[];
}

export interface NetToGrossScenario {
  targetNet: number;
  period: string;
  unionEnabled: boolean;
  unionRate: number;
}

export interface RuleSet {
  year: 2026;
  month: number;
  pensionRate: number;
  healthRate: number;
  pamiRate: number;
  contributionCap: number;
  nonTaxableMinimumYtd: number;
  specialDeductionYtd: number;
  spouseDeductionYtd: number;
  childDeductionYtd: number;
  source: string;
  verifiedAt: string;
}

export interface ExtractionEvidence {
  originalText: string;
  page: number;
  confidence: Confidence;
}

export interface ParsedPaystubItem extends EarningItem {
  evidence: ExtractionEvidence;
  selected: boolean;
  destination?: "salary" | "sac";
}

export interface ParsedPaystub {
  id: string;
  fileName: string;
  period?: string;
  paymentDate?: string;
  employer?: string;
  employee?: string;
  items: ParsedPaystubItem[];
  deductions: Array<
    DeductionItem & { evidence: ExtractionEvidence; selected: boolean }
  >;
  statedNet?: number;
  rawText: string;
  warnings: string[];
}

export interface AuditFinding {
  id: string;
  severity: "ok" | "review" | "unknown";
  title: string;
  detail: string;
  expected?: number;
  actual?: number;
}

export interface SalaryResult {
  basicEquivalent: number;
  remunerative: number;
  nonRemunerative: number;
  gross: number;
  pension: number;
  health: number;
  pami: number;
  union: number;
  incomeTax: number;
  otherDeductions: number;
  deductions: number;
  net: number;
  taxableYtd: number;
  contributionBase: number;
  rulesSource: string;
  rulesVerifiedAt: string;
  mayPayIncomeTax: boolean;
  assumptions: string[];
}
