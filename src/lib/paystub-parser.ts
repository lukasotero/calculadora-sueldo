import type {
  AuditFinding,
  ParsedPaystub,
  ParsedPaystubItem,
  SalaryResult,
} from "@/lib/types";

export interface PositionedTextItem {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
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

function isBuiltInContribution(name: string) {
  const normalized = normalizeText(name);
  return /\b(?:jubil\w*|aporte jubilatorio|sipa|inssjp|pami|ley\s*19\.?032|obra social)\b/i.test(
    normalized,
  );
}

export function sumAdditionalPaystubDeductions(
  deductions: ParsedPaystub["deductions"],
) {
  return deductions
    .filter((item) => item.selected && !isBuiltInContribution(item.name))
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

function isSacConcept(value: string) {
  const normalized = normalizeText(value);
  return /(?:\bS\.?\s*A\.?\s*C\.?(?=\s|$)|\bAGUINALDO\b|\bSUELDO ANUAL COMPLEMENTARIO\b)/i.test(
    normalized,
  );
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
  if (/^(DESCUENTOS?|DEDUCCIONES?)\b/.test(normalized)) return "deduction";
  return undefined;
}

function endsConceptTable(text: string) {
  return /^(COMPOSICION SALARIAL|SUELDO NETO|NETO (?:A COBRAR|A PAGAR)|IMPORTE EN LETRAS|OBSERVACIONES)\b/i.test(
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

interface ColumnLayout {
  page: number;
  columns: Array<{ x: number; section: PaystubSection | "contribution" }>;
}

function columnLayoutFromRow(row: TextRow): ColumnLayout | undefined {
  const headers: ColumnLayout["columns"] = row.items.flatMap((item) => {
    const normalized = normalizeText(item.text).toUpperCase();
    const section =
      normalized === "REMUNERATIVO"
        ? "remunerative"
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
  return headers.length >= 2
    ? { page: row.page, columns: headers.sort((a, b) => a.x - b.x) }
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

  const items: ParsedPaystubItem[] = [];
  const deductions: ParsedPaystub["deductions"] = [];
  let section: PaystubSection | undefined;
  let columnLayout: ColumnLayout | undefined;
  let rowId = 0;

  for (const row of rows) {
    const nextColumnLayout = columnLayoutFromRow(row);
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
    if (rowSection === "deduction") {
      deductions.push({
        id: `d-${row.page}-${rowId}`,
        name,
        amount: Math.abs(value),
        evidence,
        selected: true,
      });
    } else {
      items.push({
        id: `e-${row.page}-${rowId}`,
        name,
        amount: value,
        kind: rowSection,
        destination: isSacConcept(name) ? "sac" : "salary",
        evidence,
        selected: true,
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
    items,
    deductions,
    statedNet: detectNet(rows),
    rawText,
    warnings:
      items.length + deductions.length === 0
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
  const document = await pdfjs.getDocument({ data, useWorkerFetch: false })
    .promise;
  const pages = await Promise.all(
    Array.from({ length: document.numPages }, async (_, index) => {
      const pageNumber = index + 1;
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items.flatMap<PositionedTextItem>((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        return [
          {
            text: item.str,
            page: pageNumber,
            x: item.transform[4],
            y: item.transform[5],
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
  if (parsed.statedNet != null) {
    const difference = Math.abs(parsed.statedNet - result.net);
    findings.push({
      id: "net",
      severity: difference <= 2 ? "ok" : "review",
      title:
        difference <= 2
          ? "El neto coincide"
          : "Revisá la diferencia en el neto",
      detail:
        difference <= 2
          ? "La diferencia está dentro del margen de redondeo."
          : "Puede deberse a conceptos que no reconocimos o a reglas particulares del recibo.",
      expected: result.net,
      actual: parsed.statedNet,
    });
  } else
    findings.push({
      id: "net-missing",
      severity: "unknown",
      title: "No identificamos el neto",
      detail: "Marcá o cargá manualmente el neto del recibo para compararlo.",
    });
  const low = [...parsed.items, ...parsed.deductions].filter(
    (item) => item.evidence.confidence === "low",
  ).length;
  if (low)
    findings.push({
      id: "low-confidence",
      severity: "unknown",
      title: `${low} concepto${low === 1 ? "" : "s"} necesita${low === 1 ? "" : "n"} confirmación`,
      detail:
        "El formato del PDF no permitió interpretarlo con suficiente confianza.",
    });
  return findings;
}
