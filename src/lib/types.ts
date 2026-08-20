export type Confidence = "high" | "medium" | "low";
export type ConceptTreatment =
  "remunerative" | "non-remunerative" | "deduction" | "informational";
export type ConceptKind = Exclude<ConceptTreatment, "informational">;
export type ConceptNature =
  | "basic-salary"
  | "seniority"
  | "overtime-50"
  | "overtime-100"
  | "holiday"
  | "commission"
  | "bonus"
  | "attendance"
  | "advance"
  | "agreement-adjustment"
  | "rounding"
  | "vacation"
  | "sac"
  | "other-earning"
  | "reimbursement"
  | "pension"
  | "health"
  | "pami"
  | "income-tax"
  | "union"
  | "other-deduction"
  | "informational";

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
  reimbursements: number;
  sac: number;
  vacation: number;
  unionMode: "rate" | "fixed";
  unionValue: number;
  spouse: boolean;
  children: number;
  otherDeductions: number;
  ytd: TaxYearToDate;
  exchangeRate?: ExchangeRateSnapshot;
  paymentDate?: string;
  scenarioType?: "salary" | "sac" | "vacation";
  sourcePaystubIds?: string[];
  rulesResolution?: RulesResolution;
  sourceConcepts?: PaystubConcept[];
  sourceReconciliation?: PaystubReconciliation;
}

export interface NetToGrossScenario {
  targetNet: number;
  period: string;
  unionEnabled: boolean;
  unionRate: number;
}

export interface RuleSet {
  year: number;
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
  period: string;
  sourceUrl: string;
}

export type RulesStatus = "exact" | "estimated" | "unsupported";

export interface RuleSource {
  authority: "ARCA" | "ANSES" | "Boletín Oficial";
  title: string;
  url: string;
  effectiveFrom: string;
  verifiedAt: string;
}

export interface RulesResolution {
  requestedPeriod: string;
  contributionPeriod?: string;
  incomeTaxPeriod?: string;
  status: RulesStatus;
  sources: RuleSource[];
  warnings: string[];
}

export interface ExtractionEvidence {
  originalText: string;
  page: number;
  confidence: Confidence;
}

export interface PaystubConcept {
  id: string;
  name: string;
  amount: number;
  nature: ConceptNature;
  treatment: ConceptTreatment;
  evidence: ExtractionEvidence;
  selected: boolean;
  classificationConfidence: Confidence;
}

export interface PaystubPrintedTotals {
  remunerative?: number;
  nonRemunerative?: number;
  deductions?: number;
  gross?: number;
  net?: number;
}

export interface PaystubReconciliation {
  status: "matched" | "mismatch" | "unavailable";
  printed: PaystubPrintedTotals;
  calculated: PaystubPrintedTotals;
  differences: PaystubPrintedTotals;
  confirmed: boolean;
}

/** @deprecated Compatibility shape for receipts created before concept v2. */
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
  concepts?: PaystubConcept[];
  items: ParsedPaystubItem[];
  deductions: Array<
    DeductionItem & { evidence: ExtractionEvidence; selected: boolean }
  >;
  statedNet?: number;
  printedTotals?: PaystubPrintedTotals;
  reconciliationConfirmed?: boolean;
  rawText: string;
  warnings: string[];
}

export interface AuditFinding {
  id: string;
  severity: "ok" | "review" | "unknown";
  status: "matched" | "mismatch" | "unverified" | "unavailable";
  title: string;
  detail: string;
  expected?: number;
  actual?: number;
  basis?: {
    amount: number;
    rate: number;
    cap?: number;
    concepts: string[];
    source?: string;
  };
}

export interface SalaryResult {
  basicEquivalent: number;
  remunerative: number;
  nonRemunerative: number;
  reimbursements: number;
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
  healthContributionBase?: number;
  rulesSource: string;
  rulesVerifiedAt: string;
  mayPayIncomeTax: boolean;
  assumptions: string[];
  rulesResolution: RulesResolution;
}
