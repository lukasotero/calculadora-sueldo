import type {
  AuditFinding,
  ConceptNature,
  ConceptTreatment,
  PaystubConcept,
  PaystubPrintedTotals,
  PaystubReconciliation,
  ParsedPaystub,
  SalaryResult,
} from "@/lib/types";
import { isHealthContributoryConcept } from "@/lib/salary-engine";
import { getRuleSet } from "@/lib/rules/argentina-2026";

export interface PositionedTextItem {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isInsidePdfPage(
  item: Pick<PositionedTextItem, "x" | "y" | "width" | "height">,
  pageView: [number, number, number, number],
) {
  const [minX, minY, maxX, maxY] = pageView;
  return (
    item.x + item.width > minX &&
    item.x < maxX &&
    item.y + item.height > minY &&
    item.y < maxY
  );
}

/**
 * Some payroll systems keep both receipt copies in one content stream and set
 * the page boxes to the employee half. PDF.js can then drop text runs that
 * cross that boundary, including visible concepts. Widening the boxes only for
 * text extraction lets us recover those runs; callers still filter every item
 * against the original visible box.
 */
export function expandCroppedPdfBoxes(data: Uint8Array) {
  const source = new TextDecoder("windows-1252").decode(data);
  const expanded = data.slice();
  let changed = false;
  const boxPattern =
    /\/(MediaBox|CropBox)\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]/g;
  for (const match of source.matchAll(boxPattern)) {
    const [original, box, minX, minY, maxX, maxY] = match;
    if (Number(minX) === 0 && Number(minY) === 0) continue;
    const replacement = `/${box} [0 0 ${maxX} ${maxY}]`;
    if (replacement.length > original.length || match.index == null) continue;
    const bytes = new TextEncoder().encode(replacement.padEnd(original.length));
    expanded.set(bytes, match.index);
    changed = true;
  }
  return changed ? expanded : undefined;
}

interface TextRow {
  page: number;
  y: number;
  items: PositionedTextItem[];
  text: string;
}

type PaystubSection = "remunerative" | "non-remunerative" | "deduction";

const moneyPattern = /^\s*\$?\s*-?\s*\d+(?:\.\d{3})*,\d{2}(?:\(\*\))?\s*$/i;
const monthNames: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sumAdditionalPaystubDeductions(
  concepts: Array<PaystubConcept | ParsedPaystub["deductions"][number]>,
) {
  return concepts
    .filter(
      (item) =>
        item.selected &&
        ("treatment" in item
          ? item.treatment === "deduction" &&
            (
              ["union", "advance", "other-deduction"] as ConceptNature[]
            ).includes(item.nature)
          : !/\b(?:jubil\w*|aporte jubilatorio|sipa|inssjp|pami|ley\s*19\.?032|obra social)\b/i.test(
              normalizeText(item.name),
            )),
    )
    .reduce((sum, item) => sum + item.amount, 0);
}

function parseArgentineAmount(value: string) {
  const normalized = value
    .replace(/\$/g, "")
    .replace(/\(\*\)/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(normalized);
}

export function classifyPaystubConcept(
  name: string,
  treatment: ConceptTreatment,
): Pick<PaystubConcept, "nature" | "classificationConfidence"> {
  const normalized = normalizeText(name).toUpperCase();
  if (treatment === "deduction") {
    const deductionRules: Array<[RegExp, ConceptNature]> = [
      [/\bDESCUENTO\s+NO\s+REMUNERATIVO\b/, "other-deduction"],
      [/\bANTICIPO\b/, "advance"],
      [/\bAPORTE ADICIONAL\b.*\b(?:OSECAC|OBRA SOCIAL)\b/, "other-deduction"],
      [/\b(?:O\.?\s*S\.?|OBRA SOCIAL)\b/, "health"],
      [/\b(?:PAMI|INSSJP|LEY\s*19\.?\s*032)\b/, "pami"],
      [
        /\b(?:S\.?\s*E\.?\s*C\.?|F\.?\s*A\.?\s*E\.?\s*C\.?\s*Y\.?\s*S\.?|SINDICATO|CUOTA SINDICAL|APORTE (?:SINDICAL|SOLIDARIO))\b/,
        "union",
      ],
      [/\b(?:JUBIL\w*|APORTE JUBILATORIO|SIPA)\b/, "pension"],
      [/\b(?:GANANCIAS|IMPUESTO A LAS GANANCIAS)\b/, "income-tax"],
    ];
    const deductionMatch = deductionRules.find(([pattern]) =>
      pattern.test(normalized),
    );
    if (deductionMatch)
      return { nature: deductionMatch[1], classificationConfidence: "high" };
  }
  const rules: Array<[RegExp, ConceptNature]> = [
    [
      /\b(?:VACACIONES?(?:\s+GOZADAS?)?|ANTICIPO\s+(?:DE\s+)?VACACIONES?|PLUS\s+VACACIONAL)\b/,
      "vacation",
    ],
    [/\b(?:SUELDO BASICO|BASICO)\b/, "basic-salary"],
    [/\bANTIGUEDAD\b/, "seniority"],
    [/\bPRESENTISMO\b/, "attendance"],
    [/\b(?:HORAS? EXTRA|H\.E\.)\s*(?:AL\s*)?50\b/, "overtime-50"],
    [/\b(?:HORAS? EXTRA|H\.E\.)\s*(?:AL\s*)?100\b/, "overtime-100"],
    [/\b(?:FERIADO|DIA FERIADO)\b/, "holiday"],
    [/\bCOMISION(?:ES)?\b/, "commission"],
    [
      /\b(?:INCREMENTO NO REM|RECOMPOSICION|SUMA (?:FIJA|COMPENSATORIA)|ASIGNACION COMPENSATORIA|AJUSTE|ACUERDO)\b/,
      "agreement-adjustment",
    ],
    [/\bREDONDEO\b/, "rounding"],
    [/\b(?:BONO|PREMIO|GRATIFICACION)\b/, "bonus"],
    [
      /(?:\bS\.?\s*A\.?\s*C\.?(?=\s|$)|\bAGUINALDO\b|\bSUELDO ANUAL COMPLEMENTARIO\b)/,
      "sac",
    ],
    [/\b(?:REINTEGRO|REEMBOLSO|VIATICO DOCUMENTADO)\b/, "reimbursement"],
    [/\b(?:JUBIL\w*|APORTE JUBILATORIO|SIPA)\b/, "pension"],
    [/\bOBRA SOCIAL\b/, "health"],
    [/\b(?:PAMI|INSSJP|LEY\s*19\.?032)\b/, "pami"],
    [/\b(?:GANANCIAS|IMPUESTO A LAS GANANCIAS)\b/, "income-tax"],
    [/\b(?:SINDICATO|CUOTA SINDICAL|APORTE SOLIDARIO)\b/, "union"],
    [/\b(?:BASE IMPONIBLE|TOTAL REMUNERATIVO|INFORMATIVO)\b/, "informational"],
  ];
  const match = rules.find(([pattern]) => pattern.test(normalized));
  if (match) return { nature: match[1], classificationConfidence: "high" };
  return {
    nature: treatment === "deduction" ? "other-deduction" : "other-earning",
    classificationConfidence: "low",
  };
}

export function conceptsFromPaystub(parsed: ParsedPaystub): PaystubConcept[] {
  if (parsed.concepts?.length) return parsed.concepts;
  return [
    ...(parsed.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      nature:
        item.destination === "sac"
          ? ("sac" as const)
          : ("other-earning" as const),
      treatment: item.kind,
      evidence: item.evidence,
      selected: item.selected,
      classificationConfidence: item.evidence.confidence,
    })),
    ...(parsed.deductions ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      nature: classifyPaystubConcept(item.name, "deduction").nature,
      treatment: "deduction" as const,
      evidence: item.evidence,
      selected: item.selected,
      classificationConfidence: classifyPaystubConcept(item.name, "deduction")
        .classificationConfidence,
    })),
  ];
}

export function migrateStoredConcepts(
  value: unknown,
): PaystubConcept[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== "string" || typeof item.amount !== "number")
      return [];
    const treatment =
      item.treatment === "remunerative" ||
      item.treatment === "non-remunerative" ||
      item.treatment === "deduction" ||
      item.treatment === "informational"
        ? item.treatment
        : item.kind === "non-remunerative"
          ? "non-remunerative"
          : item.kind === "deduction"
            ? "deduction"
            : "remunerative";
    const inferred = classifyPaystubConcept(item.name, treatment);
    const nature =
      typeof item.nature === "string"
        ? (item.nature as ConceptNature)
        : item.destination === "sac"
          ? "sac"
          : inferred.nature;
    return [
      {
        id: typeof item.id === "string" ? item.id : `migrated-${index}`,
        name: item.name,
        amount: item.amount,
        nature,
        treatment,
        selected: item.selected !== false,
        evidence:
          item.evidence && typeof item.evidence === "object"
            ? (item.evidence as PaystubConcept["evidence"])
            : { originalText: item.name, page: 1, confidence: "low" },
        classificationConfidence:
          item.classificationConfidence === "high" ||
          item.classificationConfidence === "medium" ||
          item.classificationConfidence === "low"
            ? item.classificationConfidence
            : inferred.classificationConfidence,
      },
    ];
  });
}

function rowText(items: PositionedTextItem[]) {
  const parts: string[] = [];
  for (const item of items) {
    const text = item.text.trim();
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function displayConceptName(value: string) {
  return value.replace(/^\d{3,6}\s+/, "").trim();
}

export function groupTextItemsIntoRows(items: PositionedTextItem[]): TextRow[] {
  const rows: Array<Omit<TextRow, "text">> = [];
  const sorted = [...items]
    .filter((item) => item.text.trim())
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  for (const item of sorted) {
    const last = rows.at(-1);
    const tolerance = Math.max(2, item.height * 0.35);
    if (
      !last ||
      last.page !== item.page ||
      Math.abs(last.y - item.y) > tolerance
    ) {
      rows.push({ page: item.page, y: item.y, items: [item] });
      continue;
    }
    last.items.push(item);
    last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
  }

  return rows.map((row) => {
    const ordered = row.items.sort((a, b) => a.x - b.x);
    return { ...row, items: ordered, text: rowText(ordered) };
  });
}

function sectionFromRow(text: string): PaystubSection | undefined {
  const normalized = normalizeText(text).toUpperCase();
  if (/^NO REMUNERATIVO\b/.test(normalized)) return "non-remunerative";
  if (/^REMUNERATIVO\b/.test(normalized)) return "remunerative";
  // "Descuento no remunerativo" is a concept, not a section heading.
  if (/^(?:DESCUENTOS|DEDUCCIONES?)\b/.test(normalized)) return "deduction";
  return undefined;
}

function endsConceptTable(text: string) {
  return /^(COMPOSICION SALARIAL|OBRA SOCIAL|LUGAR Y FECHA DE PAGO|FORMA DE PAGO|T\.?\s*HABERES|TOTAL(?:ES)?|SUELDO NETO|NETO (?:A COBRAR|A PAGAR)|IMPORTE EN LETRAS|SON PESOS|FIRMA|RECIBI|OBSERVACIONES)\b/i.test(
    normalizeText(text),
  );
}

function periodFromText(text: string) {
  const normalized = normalizeText(text).toLowerCase();
  const namedMonth = Object.keys(monthNames).find((month) =>
    new RegExp(`\\b${month}\\b`, "i").test(normalized),
  );
  const year = normalized.match(/\b(20\d{2})\b/)?.[1];
  if (namedMonth && year) return `${year}-${monthNames[namedMonth]}`;

  const numeric = normalized.match(/\b(0?[1-9]|1[0-2])\s*[/-]\s*(20\d{2})\b/);
  return numeric ? `${numeric[2]}-${numeric[1].padStart(2, "0")}` : undefined;
}

function valueBelowHeader(
  rows: TextRow[],
  rowIndex: number,
  headerPattern: RegExp,
) {
  const headerRow = rows[rowIndex];
  const header = headerRow.items.find((item) => headerPattern.test(item.text));
  if (!header) return undefined;

  let closestItem: PositionedTextItem | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  const maxDistance = Math.max(55, header.width);

  for (
    let candidateIndex = rowIndex + 1;
    candidateIndex < Math.min(rowIndex + 4, rows.length);
    candidateIndex += 1
  ) {
    const candidate = rows[candidateIndex];
    if (candidate.page !== headerRow.page || headerRow.y - candidate.y >= 35) {
      continue;
    }

    for (const item of candidate.items) {
      const distance = Math.abs(item.x - header.x);
      if (distance < maxDistance && distance < closestDistance) {
        closestItem = item;
        closestDistance = distance;
      }
    }
  }

  return closestItem?.text;
}

function detectPeriod(rows: TextRow[], fileName: string) {
  for (let index = 0; index < rows.length; index += 1) {
    if (/PER[IÍ]ODO DE PAGO/i.test(rows[index].text)) {
      const nearbyRows: string[] = [];
      for (
        let candidateIndex = index + 1;
        candidateIndex < Math.min(index + 4, rows.length);
        candidateIndex += 1
      ) {
        const candidate = rows[candidateIndex];
        if (
          candidate.page === rows[index].page &&
          rows[index].y - candidate.y < 35
        ) {
          nearbyRows.push(candidate.text);
        }
      }
      const nearbyText = nearbyRows.join(" ");
      const candidate =
        periodFromText(rows[index].text) ??
        periodFromText(nearbyText) ??
        periodFromText(
          valueBelowHeader(rows, index, /PER[IÍ]ODO DE PAGO/i) ?? "",
        );
      if (candidate) return candidate;
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const monthHeader = row.items.find((item) =>
      /^MES$/i.test(item.text.trim()),
    );
    const yearHeader = row.items.find((item) =>
      /^A[NÑ]O$/i.test(item.text.trim()),
    );
    if (!monthHeader || !yearHeader) continue;
    const nextItems: PositionedTextItem[] = [];
    for (
      let candidateIndex = index + 1;
      candidateIndex < Math.min(index + 4, rows.length);
      candidateIndex += 1
    ) {
      const candidate = rows[candidateIndex];
      if (candidate.page === row.page && row.y - candidate.y < 35) {
        nextItems.push(...candidate.items);
      }
    }
    const month = nextItems.find(
      (item) =>
        Math.abs(item.x - monthHeader.x) < 20 &&
        /^(0?[1-9]|1[0-2])$/.test(item.text.trim()),
    )?.text;
    const year = nextItems.find(
      (item) =>
        Math.abs(item.x - yearHeader.x) < 25 &&
        /^20\d{2}$/.test(item.text.trim()),
    )?.text;
    if (month && year) return `${year}-${month.padStart(2, "0")}`;
  }

  for (const row of rows) {
    if (!/\b(?:PER[IÍ]ODO|MES)\b/i.test(row.text)) continue;
    const candidate = periodFromText(row.text);
    if (candidate) return candidate;
  }

  const filePeriod = fileName.match(/\b(20\d{2})[-_](0[1-9]|1[0-2])\b/);
  return filePeriod ? `${filePeriod[1]}-${filePeriod[2]}` : undefined;
}

function dateFromText(text: string) {
  const numeric = text.match(
    /\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](20\d{2})\b/,
  );
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  const year = Number(numeric?.[3] ?? iso?.[1]);
  const month = Number(numeric?.[2] ?? iso?.[2]);
  const day = Number(numeric?.[1] ?? iso?.[3]);
  if (!year || !month || !day) return undefined;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function detectPaymentDate(rows: TextRow[]) {
  const label = /FECHA\s+(?:DE\s+)?PAGO/i;
  const candidates = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    if (!label.test(rows[index].text)) continue;
    const inline = dateFromText(rows[index].text);
    const below = dateFromText(valueBelowHeader(rows, index, label) ?? "");
    if (inline) candidates.add(inline);
    if (below) candidates.add(below);
  }
  return candidates.size === 1 ? [...candidates][0] : undefined;
}

function detectLabeledValue(rows: TextRow[], label: RegExp) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const item = row.items.find((candidate) => label.test(candidate.text));
    if (!item) continue;
    const inline = item.text.split(/:\s*/).slice(1).join(": ").trim();
    if (inline) return inline;
    const below = valueBelowHeader(rows, index, label);
    if (below) return below.trim();
  }
  return undefined;
}

function detectNet(rows: TextRow[]) {
  const label = /(?:SUELDO|TOTAL)?\s*NETO(?:\s+A\s+(?:COBRAR|PAGAR))?/i;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const labelItem = row.items.find((item) => label.test(item.text));
    if (!labelItem && !label.test(row.text)) continue;
    const anchorX = labelItem?.x ?? row.items[0]?.x ?? 0;
    const candidates: PositionedTextItem[] = [];
    for (const candidate of rows) {
      if (candidate.page !== row.page || Math.abs(candidate.y - row.y) >= 30) {
        continue;
      }
      for (const item of candidate.items) {
        if (moneyPattern.test(item.text) && item.x > anchorX) {
          candidates.push(item);
        }
      }
    }
    candidates.sort(
      (a, b) => Math.abs(a.y - row.y) - Math.abs(b.y - row.y) || b.x - a.x,
    );
    if (candidates[0]) return parseArgentineAmount(candidates[0].text);
  }
  return undefined;
}

function detectPrintedTotals(
  rows: TextRow[],
): PaystubPrintedTotals | undefined {
  const fields: Array<[keyof PaystubPrintedTotals, RegExp]> = [
    ["remunerative", /T\.?\s*HABERES|TOTAL\s+REMUNERATIVO/i],
    ["nonRemunerative", /T\.?\s*NO\s*REM|TOTAL\s+NO\s+REMUNERATIVO/i],
    ["deductions", /T\.?\s*DEDUCC|TOTAL\s+(?:DESCUENTOS|DEDUCCIONES)/i],
  ];
  const totals: PaystubPrintedTotals = {};
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (const [field, pattern] of fields) {
      const value = valueBelowHeader(rows, rowIndex, pattern);
      const amount = value ? parseArgentineAmount(value) : Number.NaN;
      if (Number.isFinite(amount)) totals[field] = Math.abs(amount);
    }
  }
  const net = detectNet(rows);
  if (net != null) totals.net = net;
  if (totals.remunerative != null && totals.nonRemunerative != null)
    totals.gross =
      Math.round((totals.remunerative + totals.nonRemunerative) * 100) / 100;
  return Object.keys(totals).length ? totals : undefined;
}

export function reconcilePaystub(parsed: ParsedPaystub): PaystubReconciliation {
  const printed =
    parsed.printedTotals ??
    (parsed.statedNet == null ? {} : { net: parsed.statedNet });
  const concepts = conceptsFromPaystub(parsed).filter((item) => item.selected);
  const roundMoney = (value: number) => Math.round(value * 100) / 100;
  const total = (treatment: ConceptTreatment) =>
    roundMoney(
      concepts
        .filter((item) => item.treatment === treatment)
        .reduce((sum, item) => sum + item.amount, 0),
    );
  const calculated: PaystubPrintedTotals = {
    remunerative: total("remunerative"),
    nonRemunerative: total("non-remunerative"),
    deductions: total("deduction"),
  };
  calculated.gross = roundMoney(
    calculated.remunerative! + calculated.nonRemunerative!,
  );
  calculated.net = roundMoney(calculated.gross - calculated.deductions!);
  const differences: PaystubPrintedTotals = {};
  const compared = (
    Object.keys(printed) as Array<keyof PaystubPrintedTotals>
  ).filter((key) => printed[key] != null && calculated[key] != null);
  const toleranceReference = paystubReconciliationReference(printed);
  for (const key of compared)
    differences[key] = roundMoney(calculated[key]! - printed[key]!);
  return {
    status:
      compared.length === 0
        ? "unavailable"
        : compared.every((key) =>
              isPaystubAmountWithinTolerance(
                calculated[key]!,
                printed[key]!,
                toleranceReference,
              ),
            )
          ? "matched"
          : "mismatch",
    printed,
    calculated,
    differences,
    confirmed: parsed.reconciliationConfirmed === true,
  };
}

export function paystubMoneyTolerance(referenceAmount: number) {
  return Math.min(100, Math.max(2, Math.abs(referenceAmount) * 0.0001));
}

export function paystubReconciliationReference(
  printedTotals: PaystubPrintedTotals,
) {
  return Math.max(
    0,
    ...Object.values(printedTotals)
      .filter(
        (amount): amount is number => amount != null && Number.isFinite(amount),
      )
      .map(Math.abs),
  );
}

export function isPaystubAmountWithinTolerance(
  calculatedAmount: number,
  printedAmount: number,
  referenceAmount = printedAmount,
) {
  return (
    Math.abs(calculatedAmount - printedAmount) <=
    paystubMoneyTolerance(referenceAmount)
  );
}

interface ColumnLayout {
  page: number;
  columns: Array<{ x: number; section: PaystubSection | "contribution" }>;
}

function columnLayoutFromRow(
  row: TextRow,
  nearbyRows: TextRow[] = [row],
): ColumnLayout | undefined {
  const rowContainsHeader = row.items.some((item) =>
    /^(?:HABERES(?: NO)?|REMUNERATIVO|NO REMUNERATIVO|DESCUENTOS?|DEDUCCIONES?|CONTRIBUCIONES?)$/i.test(
      normalizeText(item.text),
    ),
  );
  if (!rowContainsHeader) return undefined;
  const nearbyItems: PositionedTextItem[] = [];
  for (const candidate of nearbyRows) {
    if (candidate.page === row.page && Math.abs(candidate.y - row.y) <= 12) {
      nearbyItems.push(...candidate.items);
    }
  }
  const remunerationHeaders = nearbyItems
    .filter((item) => normalizeText(item.text).toUpperCase() === "REMUNERATIVO")
    .sort((a, b) => a.x - b.x);
  const headers: ColumnLayout["columns"] = nearbyItems.flatMap((item) => {
    const normalized = normalizeText(item.text).toUpperCase();
    const section =
      normalized === "REMUNERATIVO"
        ? remunerationHeaders.length >= 2 && item === remunerationHeaders[1]
          ? "non-remunerative"
          : "remunerative"
        : normalized === "NO REMUNERATIVO"
          ? "non-remunerative"
          : /^(DESCUENTOS?|DEDUCCIONES?)$/.test(normalized)
            ? "deduction"
            : /^CONTRIBUCIONES?$/.test(normalized)
              ? "contribution"
              : undefined;
    return section
      ? [
          {
            x: item.x + item.width / 2,
            section: section as PaystubSection | "contribution",
          },
        ]
      : [];
  });
  const uniqueHeaders = headers.filter(
    (header, index, values) =>
      values.findIndex(
        (candidate) =>
          candidate.section === header.section &&
          Math.abs(candidate.x - header.x) < 2,
      ) === index,
  );
  return uniqueHeaders.length >= 2
    ? { page: row.page, columns: uniqueHeaders.sort((a, b) => a.x - b.x) }
    : undefined;
}

function sectionForColumn(layout: ColumnLayout, item: PositionedTextItem) {
  const center = item.x + item.width / 2;
  return [...layout.columns].sort(
    (a, b) => Math.abs(a.x - center) - Math.abs(b.x - center),
  )[0]?.section;
}

export function parsePositionedPaystub(
  positionedItems: PositionedTextItem[],
  fileName: string,
): ParsedPaystub {
  const rows = groupTextItemsIntoRows(positionedItems);
  const rawText = rows.map((row) => row.text).join("\n");
  if (rawText.replace(/\s/g, "").length < 40)
    throw new Error(
      "El PDF no contiene texto digital suficiente. Probablemente sea un escaneo.",
    );

  const concepts: PaystubConcept[] = [];
  let section: PaystubSection | undefined;
  let columnLayout: ColumnLayout | undefined;
  let rowId = 0;

  for (const row of rows) {
    const nextColumnLayout = columnLayoutFromRow(row, rows);
    if (nextColumnLayout) {
      columnLayout = nextColumnLayout;
      section = undefined;
      continue;
    }
    const nextSection = sectionFromRow(row.text);
    if (nextSection) {
      section = nextSection;
      continue;
    }
    if (endsConceptTable(row.text)) {
      section = undefined;
      columnLayout = undefined;
      continue;
    }
    const amounts = row.items
      .filter((item) => moneyPattern.test(item.text))
      .sort((a, b) => b.x - a.x);
    const amountItem = amounts[0];
    if (!amountItem) continue;
    const rowSection =
      columnLayout?.page === row.page
        ? sectionForColumn(columnLayout, amountItem)
        : section;
    if (!rowSection || rowSection === "contribution") continue;

    const firstNonConceptIndex = row.items.findIndex(
      (item) =>
        moneyPattern.test(item.text) ||
        /^\d+(?:[.,]\d+)?(?:%|[DdHh])$/.test(item.text.trim()),
    );
    const conceptItems = row.items.slice(
      0,
      firstNonConceptIndex === -1 ? row.items.length : firstNonConceptIndex,
    );
    const name = displayConceptName(
      rowText(conceptItems).replace(/\s+/g, " ").trim(),
    );
    const value = parseArgentineAmount(amountItem.text);
    if (!name || !Number.isFinite(value) || Math.abs(value) > 1e10) continue;

    const evidence = {
      originalText: row.text,
      page: row.page,
      confidence: "high" as const,
    };
    rowId += 1;
    const treatment: ConceptTreatment = rowSection;
    const classification = classifyPaystubConcept(name, treatment);
    concepts.push({
      id: `${rowSection === "deduction" ? "d" : "e"}-${row.page}-${rowId}`,
      name,
      amount: rowSection === "deduction" ? Math.abs(value) : value,
      treatment,
      ...classification,
      evidence,
      selected: true,
    });
  }

  const printedTotals = detectPrintedTotals(rows);
  const items: ParsedPaystub["items"] = [];
  const deductions: ParsedPaystub["deductions"] = [];
  for (const item of concepts) {
    if (
      item.treatment === "remunerative" ||
      item.treatment === "non-remunerative"
    ) {
      items.push({
        id: item.id,
        name: item.name,
        amount: item.amount,
        kind: item.treatment,
        destination: item.nature === "sac" ? "sac" : "salary",
        evidence: item.evidence,
        selected: item.selected,
      });
    } else if (item.treatment === "deduction") {
      deductions.push({
        id: item.id,
        name: item.name,
        amount: item.amount,
        evidence: item.evidence,
        selected: item.selected,
      });
    }
  }
  return {
    id: crypto.randomUUID(),
    fileName,
    period: detectPeriod(rows, fileName),
    paymentDate: detectPaymentDate(rows),
    employer: detectLabeledValue(rows, /^(?:EMPLEADOR|RAZ[ÓO]N SOCIAL)$/i),
    employee: detectLabeledValue(rows, /APELLIDO Y NOMBRE/i),
    concepts,
    items,
    deductions,
    statedNet: printedTotals?.net,
    printedTotals,
    rawText,
    warnings:
      concepts.length === 0
        ? [
            "No pudimos identificar conceptos automáticamente. Revisá el texto extraído.",
          ]
        : [],
  };
}

export async function parsePaystub(file: File): Promise<ParsedPaystub> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", data);
  const fileId = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  let document = await pdfjs.getDocument({
    data: data.slice(),
    useWorkerFetch: false,
  }).promise;
  const originalViews = await Promise.all(
    Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      return page.view as [number, number, number, number];
    }),
  );
  const expandedData = originalViews.some(
    ([minX, minY]) => minX !== 0 || minY !== 0,
  )
    ? expandCroppedPdfBoxes(data)
    : undefined;
  if (expandedData) {
    await document.destroy();
    document = await pdfjs.getDocument({
      data: expandedData,
      useWorkerFetch: false,
    }).promise;
  }
  const pages = await Promise.all(
    Array.from({ length: document.numPages }, async (_, index) => {
      const pageNumber = index + 1;
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items.flatMap<PositionedTextItem>((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        const x = item.transform[4];
        const y = item.transform[5];
        if (
          !isInsidePdfPage(
            { x, y, width: item.width, height: item.height },
            originalViews[index],
          )
        )
          return [];
        return [
          {
            text: item.str,
            page: pageNumber,
            x,
            y,
            width: item.width,
            height: item.height,
          },
        ];
      });
    }),
  );
  return {
    ...parsePositionedPaystub(pages.flat(), file.name),
    id: fileId,
  };
}

export function auditPaystub(
  parsed: ParsedPaystub,
  result: SalaryResult,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (result.rulesResolution?.status === "unsupported") {
    findings.push({
      id: "rules-unsupported",
      severity: "unknown",
      status: "unavailable",
      title: "Sin comparación histórica",
      detail:
        "Podés revisar los conceptos extraídos, pero no calculamos períodos anteriores a 2019.",
    });
    return findings;
  }
  const concepts = conceptsFromPaystub(parsed);
  const reconciliation = reconcilePaystub(parsed);
  // Structural mismatches are already shown by the reconciliation panel. Legal
  // findings based on an unreliable extraction would only create noise.
  if (reconciliation.status === "mismatch") return findings;
  if (
    reconciliation.status === "unavailable" ||
    result.rulesResolution.status === "estimated"
  ) {
    findings.push({
      id: "legal-unverified",
      severity: "unknown",
      status: "unverified",
      title: "Validación legal no confirmada",
      detail:
        reconciliation.status === "unavailable"
          ? "El recibo no imprime totales suficientes para validar primero la lectura."
          : "El período usa reglas estimadas; mostramos los importes sin marcarlos como incongruencia.",
    });
    return findings;
  }
  const contributionPeriod = result.rulesResolution.contributionPeriod;
  const contributionCap = contributionPeriod
    ? getRuleSet(contributionPeriod).contributionCap
    : undefined;
  const remunerativeConcepts = concepts.filter(
    (item) => item.selected && item.treatment === "remunerative",
  );
  const healthConcepts = concepts.filter(
    (item) =>
      item.selected &&
      (item.treatment === "remunerative" ||
        (contributionPeriod != null &&
          isHealthContributoryConcept(item, contributionPeriod))),
  );
  const ansesSources: string[] = [];
  for (const item of result.rulesResolution.sources) {
    if (item.authority === "ANSES") ansesSources.push(item.title);
  }
  const source = ansesSources.join(" · ");
  const legalComparisons: Array<{
    nature: ConceptNature;
    label: string;
    expected: number;
    basisAmount: number;
    basisConcepts: PaystubConcept[];
  }> = [
    {
      nature: "pension",
      label: "Jubilación",
      expected: result.pension,
      basisAmount: result.contributionBase,
      basisConcepts: remunerativeConcepts,
    },
    {
      nature: "health",
      label: "Obra social",
      expected: result.health,
      basisAmount: result.healthContributionBase ?? result.contributionBase,
      basisConcepts: healthConcepts,
    },
    {
      nature: "pami",
      label: "PAMI",
      expected: result.pami,
      basisAmount: result.contributionBase,
      basisConcepts: remunerativeConcepts,
    },
    {
      nature: "income-tax",
      label: "Ganancias",
      expected: result.incomeTax,
      basisAmount: result.remunerative,
      basisConcepts: remunerativeConcepts,
    },
  ];
  for (const comparison of legalComparisons) {
    const matching = concepts.filter(
      (item) => item.selected && item.nature === comparison.nature,
    );
    if (!matching.length) continue;
    const actual = matching.reduce((sum, item) => sum + item.amount, 0);
    const matched = isPaystubAmountWithinTolerance(comparison.expected, actual);
    findings.push({
      id: `legal-${comparison.nature}`,
      severity: matched ? "ok" : "review",
      status: matched ? "matched" : "mismatch",
      title: matched
        ? `${comparison.label} coincide`
        : `Revisá ${comparison.label}`,
      detail: matched
        ? "La diferencia está dentro del margen de tolerancia."
        : "Comparamos el descuento observado con el cálculo legal del mismo recibo.",
      expected: comparison.expected,
      actual,
      basis: {
        amount: comparison.basisAmount,
        rate:
          comparison.basisAmount > 0
            ? comparison.expected / comparison.basisAmount
            : 0,
        concepts: comparison.basisConcepts.map((item) => item.name),
        cap: comparison.nature === "income-tax" ? undefined : contributionCap,
        source: source || undefined,
      },
    });
  }
  const incompatible = concepts.filter(
    (item) =>
      item.selected &&
      ([
        "pension",
        "health",
        "pami",
        "income-tax",
        "union",
        "other-deduction",
      ].includes(item.nature)
        ? item.treatment !== "deduction"
        : item.nature === "informational"
          ? item.treatment !== "informational"
          : false),
  ).length;
  if (incompatible) {
    findings.push({
      id: "incompatible-classification",
      severity: "review",
      status: "mismatch",
      title: `${incompatible} clasificación${incompatible === 1 ? "" : "es"} incompatible${incompatible === 1 ? "" : "s"}`,
      detail:
        "La naturaleza y el tratamiento no coinciden. Corregilos o excluí esos conceptos del cálculo.",
    });
  }
  if (parsed.statedNet != null) {
    const matched = isPaystubAmountWithinTolerance(
      result.net,
      parsed.statedNet,
    );
    findings.push({
      id: "net",
      severity: matched ? "ok" : "review",
      status: matched ? "matched" : "mismatch",
      title: matched ? "El neto coincide" : "Revisá la diferencia en el neto",
      detail: matched
        ? "La diferencia está dentro del margen de tolerancia."
        : "Puede deberse a conceptos que no reconocimos o a reglas particulares del recibo.",
      expected: result.net,
      actual: parsed.statedNet,
    });
  } else
    findings.push({
      id: "net-missing",
      severity: "unknown",
      status: "unavailable",
      title: "No identificamos el neto",
      detail: "Marcá o cargá manualmente el neto del recibo para compararlo.",
    });
  return findings;
}
