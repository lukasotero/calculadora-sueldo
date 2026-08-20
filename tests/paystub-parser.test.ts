import { describe, expect, it } from "vitest";
import {
  auditPaystub,
  expandCroppedPdfBoxes,
  groupTextItemsIntoRows,
  isInsidePdfPage,
  isPaystubAmountWithinTolerance,
  parsePositionedPaystub,
  paystubMoneyTolerance,
  paystubReconciliationReference,
  reconcilePaystub,
  sumAdditionalPaystubDeductions,
  type PositionedTextItem,
} from "@/lib/paystub-parser";
import type { ParsedPaystub, SalaryResult } from "@/lib/types";
import { calculateSalary, defaultScenario } from "@/lib/salary-engine";
import { scenarioFromPaystub } from "@/lib/scenario-merge";

function token(
  text: string,
  x: number,
  y: number,
  page = 1,
): PositionedTextItem {
  return { text, x, y, page, width: Math.max(text.length * 4, 4), height: 7 };
}

function row(y: number, values: Array<[string, number]>, page = 1) {
  return values.map(([text, x]) => token(text, x, y, page));
}

const syntheticPaystub = [
  ...row(820, [["EMPLEADOR", 20]]),
  ...row(810, [["EMPRESA DE PRUEBA S.A.", 20]]),
  ...row(790, [
    ["MES", 40],
    ["AÑO", 70],
    ["APELLIDO Y NOMBRE", 170],
  ]),
  ...row(780, [
    ["7", 40],
    ["2026", 70],
    ["PERSONA DE PRUEBA", 170],
  ]),
  ...row(760, [["PERIODO DE PAGO", 460]]),
  ...row(750, [["Julio 2026", 470]]),
  ...row(710, [
    ["COSTO TOTAL EMPLEADOR", 170],
    ["$ 2.429.567,34", 540],
  ]),
  ...row(700, [
    ["0501", 12],
    ["CONTRIBUCION JUBILACION", 32],
    ["18%", 330],
    ["$ 1.878.496,33", 390],
    ["$ 338.129,34", 550],
  ]),
  ...row(600, [
    ["CONCEPTO", 110],
    ["UNIDAD", 290],
    ["BASE", 380],
    ["MONTO", 500],
  ]),
  ...row(590, [["REMUNERATIVO", 110]]),
  ...row(580, [
    ["0201", 12],
    ["SUELDO", 32],
    ["$ 1.885.500,00", 547],
  ]),
  ...row(570, [
    ["0207", 12],
    ["DIAS", 32],
    ["NO TRABAJADOS", 48],
    ["5D", 336],
    ["$ 60.822,58", 397],
    ["$ -304.112,90", 550],
  ]),
  ...row(560, [
    ["0230", 12],
    ["AUSENCIAS CON AVISO", 32],
    ["5D", 336],
    ["$ 60.822,58", 397],
    ["$ 304.112,90", 552],
  ]),
  ...row(550, [["NO REMUNERATIVO", 106]]),
  ...row(540, [
    ["0335", 12],
    ["PROVISION INTERNET", 32],
    ["$ 40.000,00", 555],
  ]),
  ...row(530, [["DESCUENTOS", 114]]),
  ...row(520, [
    ["0402", 12],
    ["INSSJP LEY 19.032 (3%)", 32],
    ["3%", 335],
    ["$ 1.885.500,00", 388],
    ["$ 56.565,00", 555],
  ]),
  ...row(510, [
    ["0405", 12],
    ["OBRA SOCIAL LEY 23.660 (3%)", 32],
    ["3%", 335],
    ["$ 1.885.500,00", 388],
    ["$ 56.565,00", 555],
  ]),
  ...row(500, [
    ["0412", 12],
    ["JUBILACION (11%)", 32],
    ["11%", 331],
    ["$ 1.885.500,00", 388],
    ["$ 207.405,00", 552],
  ]),
  ...row(490, [
    ["COMPOSICIÓN SALARIAL", 12],
    ["$ 320.535,00", 550],
  ]),
  ...row(480, [
    ["SUELDO NETO", 180],
    ["$ 1.604.965,00", 527],
  ]),
  ...row(470, [
    ["CUIL 20-11111111-7", 12],
    ["13/07/2026", 540],
  ]),
];

const result: SalaryResult = {
  basicEquivalent: 1000,
  remunerative: 1000,
  nonRemunerative: 0,
  reimbursements: 0,
  gross: 1000,
  contributionBase: 1000,
  pension: 110,
  health: 30,
  pami: 30,
  union: 0,
  incomeTax: 0,
  otherDeductions: 0,
  deductions: 170,
  net: 830,
  taxableYtd: 0,
  rulesSource: "Test",
  rulesVerifiedAt: "2026-08-13",
  mayPayIncomeTax: false,
  assumptions: [],
  rulesResolution: {
    requestedPeriod: "2026-08",
    contributionPeriod: "2026-08",
    incomeTaxPeriod: "2026-08",
    status: "exact",
    sources: [],
    warnings: [],
  },
};
describe("paystub audit", () => {
  const parsedAudit = (statedNet: number): ParsedPaystub => ({
    id: "1",
    fileName: "anonimo.pdf",
    period: "2026-08",
    concepts: [
      {
        id: "salary",
        name: "Sueldo básico",
        amount: 1_000,
        nature: "basic-salary",
        treatment: "remunerative",
        selected: true,
        evidence: { originalText: "Sueldo", page: 1, confidence: "high" },
        classificationConfidence: "high",
      },
      ...[
        ["Jubilación", 110, "pension"],
        ["Obra social", 30, "health"],
        ["Ley 19.032", 30, "pami"],
      ].map(([name, amount, nature], index) => ({
        id: `deduction-${index}`,
        name: String(name),
        amount: Number(amount),
        nature: nature as "pension" | "health" | "pami",
        treatment: "deduction" as const,
        selected: true,
        evidence: {
          originalText: String(name),
          page: 1,
          confidence: "high" as const,
        },
        classificationConfidence: "high" as const,
      })),
    ],
    items: [],
    deductions: [],
    statedNet,
    printedTotals: {
      remunerative: 1_000,
      nonRemunerative: 0,
      deductions: 170,
      gross: 1_000,
      net: statedNet,
    },
    rawText: "",
    warnings: [],
  });

  it("accepts rounding differences", () => {
    expect(auditPaystub(parsedAudit(829.5), result)[0]).toMatchObject({
      severity: "ok",
      status: "matched",
    });
  });
  it("suspends legal findings when structural reconciliation fails", () => {
    expect(auditPaystub(parsedAudit(700), result)).toEqual([]);
  });
  it("uses an informational state when printed totals are unavailable", () => {
    const parsed = parsedAudit(830);
    parsed.printedTotals = undefined;
    parsed.statedNet = undefined;
    expect(auditPaystub(parsed, result)).toMatchObject([
      { status: "unverified", severity: "unknown" },
    ]);
  });
  it("does not create a finding for low-confidence concepts", () => {
    const parsed = parsedAudit(830);
    parsed.concepts![0].classificationConfidence = "low";
    parsed.concepts![0].evidence.confidence = "low";

    expect(
      auditPaystub(parsed, result).map((finding) => finding.id),
    ).not.toContain("low-confidence");
  });
});

describe("paystub monetary tolerance", () => {
  it("uses a $2 floor, 0.01% proportional margin and $100 cap", () => {
    expect(paystubMoneyTolerance(1_000)).toBe(2);
    expect(paystubMoneyTolerance(615_000)).toBe(61.5);
    expect(paystubMoneyTolerance(2_000_000)).toBe(100);
    expect(paystubMoneyTolerance(5_000_000)).toBe(100);
    expect(
      paystubReconciliationReference({ deductions: 108_126, gross: 724_034 }),
    ).toBe(724_034);
  });

  it("accepts a $12 receipt difference over roughly $615,000", () => {
    expect(isPaystubAmountWithinTolerance(615_896, 615_908)).toBe(true);
    const parsed: ParsedPaystub = {
      id: "small-difference",
      fileName: "recibo.pdf",
      concepts: [
        {
          id: "salary",
          name: "Sueldo",
          amount: 724_034,
          nature: "basic-salary",
          treatment: "remunerative",
          selected: true,
          evidence: { originalText: "Sueldo", page: 1, confidence: "high" },
          classificationConfidence: "high",
        },
        {
          id: "deductions",
          name: "Otros descuentos",
          amount: 108_138,
          nature: "other-deduction",
          treatment: "deduction",
          selected: true,
          evidence: {
            originalText: "Otros descuentos",
            page: 1,
            confidence: "high",
          },
          classificationConfidence: "high",
        },
      ],
      items: [],
      deductions: [],
      statedNet: 615_908,
      printedTotals: {
        remunerative: 724_034,
        nonRemunerative: 0,
        deductions: 108_126,
        gross: 724_034,
        net: 615_908,
      },
      rawText: "",
      warnings: [],
    };

    expect(reconcilePaystub(parsed).status).toBe("matched");
  });

  it("keeps differences above the capped margin as mismatches", () => {
    expect(isPaystubAmountWithinTolerance(2_000_101, 2_000_000)).toBe(false);
  });
});

describe("positioned paystub parser", () => {
  it("widens cropped payroll pages without changing the PDF byte length", () => {
    const source = new TextEncoder().encode(
      "%PDF /MediaBox [425.0 0.0 842.0 595.0] /CropBox [425.0 0.0 842.0 595.0] end",
    );
    const expanded = expandCroppedPdfBoxes(source);
    const text = new TextDecoder().decode(expanded);

    expect(expanded).toHaveLength(source.length);
    expect(text).toContain("/MediaBox [0 0 842.0 595.0]");
    expect(text).toContain("/CropBox [0 0 842.0 595.0]");
  });

  it("respects PDF pages whose coordinate origin is not zero", () => {
    const shiftedPage: [number, number, number, number] = [417, 0, 834, 595];
    expect(
      isInsidePdfPage({ x: 450, y: 420, width: 40, height: 8 }, shiftedPage),
    ).toBe(true);
    expect(
      isInsidePdfPage({ x: 850, y: 420, width: 40, height: 8 }, shiftedPage),
    ).toBe(false);
  });

  it("reconstructs split headers with remunerative, non-remunerative and deduction columns", () => {
    const parsed = parsePositionedPaystub(
      [
        ...row(430, [
          ["HABERES", 674],
          ["HABERES NO", 721],
        ]),
        ...row(424, [["DESCUENTOS", 773]]),
        ...row(418, [
          ["REMUNERATIVO", 665],
          ["REMUNERATIVO", 718],
        ]),
        ...row(407, [
          ["001 Sueldo Básico", 482],
          ["1076448,00", 674],
        ]),
        ...row(396, [
          ["002 Suma fija", 482],
          ["40000,00", 736],
        ]),
        ...row(385, [
          ["003 ANTICIPO BONO", 482],
          ["64641,00", 790],
        ]),
      ],
      "recibo-2026-03.pdf",
    );

    expect(parsed.concepts).toMatchObject([
      { name: "Sueldo Básico", treatment: "remunerative" },
      { name: "Suma fija", treatment: "non-remunerative" },
      { name: "ANTICIPO BONO", treatment: "deduction", nature: "advance" },
    ]);
  });

  it("validates an April 2024 compensatory sum against its health deduction", () => {
    const parsed = parsePositionedPaystub(
      [
        ...row(500, [
          ["CONCEPTO", 30],
          ["REMUNERATIVO", 300],
          ["NO REMUNERATIVO", 390],
          ["DEDUCCIONES", 490],
        ]),
        ...row(480, [
          ["001 Suma compensatoria Abril 2024", 30],
          ["$ 40.000,00", 390],
        ]),
        ...row(460, [
          ["101 S.E.C. 2%", 30],
          ["$ 800,00", 490],
        ]),
        ...row(440, [
          ["102 F.A.E.C.Y.S. 0.5%", 30],
          ["$ 200,00", 490],
        ]),
        ...row(420, [
          ["103 OSECAC-OS DE LOS EMPLEADOS DE", 30],
          ["$ 1.200,00", 490],
        ]),
        ...row(380, [
          ["T. HABERES", 300],
          ["T. NO REM", 390],
          ["T. DEDUCC", 490],
        ]),
        ...row(360, [
          ["$ 0,00", 300],
          ["$ 40.000,00", 390],
          ["$ 2.200,00", 490],
        ]),
        ...row(320, [
          ["SUELDO NETO", 300],
          ["$ 37.800,00", 490],
        ]),
      ],
      "2024-04-recibo.pdf",
    );
    const scenario = scenarioFromPaystub(defaultScenario, parsed);
    const salary = calculateSalary(scenario);

    expect(parsed.concepts?.[0]).toMatchObject({
      nature: "agreement-adjustment",
      treatment: "non-remunerative",
      classificationConfidence: "high",
    });
    expect(salary.healthContributionBase).toBe(40_000);
    expect(salary.health).toBe(1_200);
    expect(reconcilePaystub(parsed).status).toBe("matched");
    expect(
      auditPaystub(parsed, salary).find(
        (finding) => finding.id === "legal-health",
      ),
    ).toMatchObject({ status: "matched", actual: 1_200, expected: 1_200 });
  });

  it("reconciles the anonymized multi-column receipt without footer concepts", () => {
    const fixture = [
      ...row(500, [
        ["CONCEPTO", 30],
        ["REMUNERATIVO", 300],
        ["NO REMUNERATIVO", 390],
        ["DEDUCCIONES", 490],
      ]),
      ...row(490, [
        ["001 Sueldo Básico", 30],
        ["$ 1.076.448,00", 300],
      ]),
      ...row(480, [
        ["002 Adic. Antiguedad", 30],
        ["$ 21.528,96", 300],
      ]),
      ...row(470, [
        ["003 Presentismo", 30],
        ["$ 91.461,48", 300],
      ]),
      ...row(460, [
        ["004 ANTICIPO BONO AC.12/25", 30],
        ["$ 64.641,00", 490],
      ]),
      ...row(450, [
        ["005 Recomposicion No Rem.Ac 2025", 30],
        ["$ 60.000,00", 390],
      ]),
      ...row(440, [
        ["006 Suma Fija No Rem.2025", 30],
        ["$ 40.000,00", 390],
      ]),
      ...row(430, [
        ["007 Antiguedad s/Suma Fija", 30],
        ["$ 2.000,00", 390],
      ]),
      ...row(420, [
        ["008 Presentismo s/Suma Fija", 30],
        ["$ 8.496,60", 390],
      ]),
      ...row(410, [
        ["009 Jubilación", 30],
        ["$ 130.838,23", 490],
      ]),
      ...row(400, [
        ["010 Ley 19.032 3%", 30],
        ["$ 35.683,15", 490],
      ]),
      ...row(390, [
        ["011 S.E.C. 2%", 30],
        ["$ 25.998,70", 490],
      ]),
      ...row(380, [
        ["012 F.A.E.C.Y.S. 0.5%", 30],
        ["$ 6.499,68", 490],
      ]),
      ...row(370, [
        ["013 O.S.DE EJECUTIVOS Y DEL PERSONAL", 30],
        ["$ 35.683,15", 490],
      ]),
      ...row(360, [
        ["014 Redondeo", 30],
        ["$ 0,87", 390],
      ]),
      ...row(340, [
        ["LUGAR Y FECHA DE PAGO", 30],
        ["T. HABERES", 300],
        ["T. NO REM", 390],
        ["T. DEDUCC", 490],
      ]),
      ...row(330, [
        ["CABA 31/03/2026", 30],
        ["$ 1.189.438,44", 300],
        ["$ 110.497,47", 390],
        ["$ 299.343,91", 490],
      ]),
      ...row(310, [["FORMA DE PAGO", 30]]),
      ...row(300, [["Efectivo", 30]]),
      ...row(280, [
        ["SUELDO NETO", 300],
        ["$ 1.000.592,00", 490],
      ]),
    ];
    const parsed = parsePositionedPaystub(fixture, "recibo-2026-03.pdf");
    const reconciliation = reconcilePaystub(parsed);

    expect(parsed.concepts).toHaveLength(14);
    expect(parsed.concepts?.map((concept) => concept.name)).not.toContain(
      "CABA 31/03/2026",
    );
    expect(parsed.concepts?.map((concept) => concept.name)).not.toContain(
      "Efectivo",
    );
    expect(parsed.printedTotals).toEqual({
      remunerative: 1_189_438.44,
      nonRemunerative: 110_497.47,
      deductions: 299_343.91,
      gross: 1_299_935.91,
      net: 1_000_592,
    });
    expect(reconciliation.status).toBe("matched");
    expect(reconciliation.calculated).toEqual({
      remunerative: 1_189_438.44,
      nonRemunerative: 110_497.47,
      deductions: 299_343.91,
      gross: 1_299_935.91,
      net: 1_000_592,
    });
  });

  it("reads an anonymized exclusive vacation receipt and reconciles its totals", () => {
    const fixture = [
      ...row(510, [
        ["CONCEPTO", 30],
        ["REMUNERATIVO", 300],
        ["NO REMUNERATIVO", 390],
        ["DEDUCCIONES", 490],
      ]),
      ...[
        ["Anticipo vacaciones", "$ 89.777,73", 300],
        ["Suma fija no remunerativa", "$ 22.400,00", 390],
        ["Antigüedad s/suma fija", "$ 224,00", 390],
        ["Presentismo s/suma fija", "$ 1.884,58", 390],
        ["Vacaciones gozadas", "$ 538.666,36", 300],
        ["Jubilación", "$ 69.128,85", 490],
        ["Ley 19.032 3%", "$ 18.853,32", 490],
        ["S.E.C. 2%", "$ 13.059,05", 490],
        ["F.A.E.C.Y.S. 0.5%", "$ 3.264,76", 490],
        ["O.S.DE EMPLEADOS", "$ 18.853,32", 490],
        ["Descuento no remunerativo", "$ 1,00", 490],
        ["Redondeo", "$ 0,63", 390],
      ].flatMap(([name, amount, x], index) =>
        row(495 - index * 10, [
          [String(name), 30],
          [String(amount), Number(x)],
        ]),
      ),
      ...row(360, [
        ["T. HABERES", 300],
        ["T. NO REM", 390],
        ["T. DEDUCC", 490],
      ]),
      ...row(350, [
        ["$ 628.444,09", 300],
        ["$ 24.509,21", 390],
        ["$ 123.160,30", 490],
      ]),
      ...row(330, [
        ["SUELDO NETO", 300],
        ["$ 529.793,00", 490],
      ]),
      ...row(310, [["FORMA DE PAGO", 30]]),
    ];
    const parsed = parsePositionedPaystub(fixture, "vacaciones-2025-07.pdf");
    const scenario = scenarioFromPaystub(defaultScenario, parsed);
    const result = calculateSalary(scenario);

    expect(parsed.concepts).toHaveLength(12);
    expect(parsed.printedTotals).toEqual({
      remunerative: 628_444.09,
      nonRemunerative: 24_509.21,
      deductions: 123_160.3,
      gross: 652_953.3,
      net: 529_793,
    });
    expect(reconcilePaystub(parsed).status).toBe("matched");
    expect(scenario.scenarioType).toBe("vacation");
    expect(result.net).toBe(529_793);
    expect(
      auditPaystub(parsed, result).every((item) => item.status === "matched"),
    ).toBe(true);
  });

  it("detects a labeled payment date without confusing other dates", () => {
    const parsed = parsePositionedPaystub(
      [...syntheticPaystub, ...row(745, [["FECHA DE PAGO: 02/08/2026", 300]])],
      "recibo.pdf",
    );

    expect(parsed.paymentDate).toBe("2026-08-02");
  });

  it("reconstructs fragmented rows and sorts their columns", () => {
    const rows = groupTextItemsIntoRows([
      token("TRABAJADOS", 80, 500.8),
      token("0207", 10, 500),
      token("DIAS NO", 30, 501),
      token("$ -10.000,00", 500, 500.4),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("0207 DIAS NO TRABAJADOS $ -10.000,00");
  });

  it("extracts only employee concepts and preserves earning signs", () => {
    const parsed = parsePositionedPaystub(
      syntheticPaystub,
      "2026-07, recibo sintetico.pdf",
    );

    expect(parsed.period).toBe("2026-07");
    expect(parsed.employer).toBe("EMPRESA DE PRUEBA S.A.");
    expect(parsed.employee).toBe("PERSONA DE PRUEBA");
    expect(parsed.statedNet).toBe(1_604_965);
    expect(parsed.items).toEqual([
      expect.objectContaining({
        name: "SUELDO",
        amount: 1_885_500,
        kind: "remunerative",
      }),
      expect.objectContaining({
        name: "DIAS NO TRABAJADOS",
        amount: -304_112.9,
        kind: "remunerative",
      }),
      expect.objectContaining({
        name: "AUSENCIAS CON AVISO",
        amount: 304_112.9,
        kind: "remunerative",
      }),
      expect.objectContaining({
        name: "PROVISION INTERNET",
        amount: 40_000,
        kind: "non-remunerative",
      }),
    ]);
    expect(
      parsed.deductions.map(({ name, amount }) => ({ name, amount })),
    ).toEqual([
      { name: "INSSJP LEY 19.032 (3%)", amount: 56_565 },
      { name: "OBRA SOCIAL LEY 23.660 (3%)", amount: 56_565 },
      { name: "JUBILACION (11%)", amount: 207_405 },
    ]);
    expect(parsed.deductions.reduce((sum, item) => sum + item.amount, 0)).toBe(
      320_535,
    );
    expect([...parsed.items, ...parsed.deductions]).toHaveLength(7);
    expect(parsed.items[0].evidence.originalText).toContain("0201 SUELDO");
    expect(parsed.rawText).toContain("COSTO TOTAL EMPLEADOR");
    expect(
      parsed.items.some((item) => /CONTRIBUCION|CUIL|2026/.test(item.name)),
    ).toBe(false);
  });

  it("does not duplicate contributions already calculated by the engine", () => {
    const parsed = parsePositionedPaystub(
      syntheticPaystub,
      "2026-07, recibo sintetico.pdf",
    );

    expect(sumAdditionalPaystubDeductions(parsed.deductions)).toBe(0);
    expect(
      sumAdditionalPaystubDeductions([
        ...parsed.deductions,
        {
          id: "extra",
          name: "SEGURO COLECTIVO",
          amount: 1_250,
          selected: true,
          evidence: {
            originalText: "SEGURO COLECTIVO $ 1.250,00",
            page: 1,
            confidence: "high",
          },
        },
        {
          id: "ignored",
          name: "OTRO DESCUENTO",
          amount: 500,
          selected: false,
          evidence: {
            originalText: "OTRO DESCUENTO $ 500,00",
            page: 1,
            confidence: "high",
          },
        },
      ]),
    ).toBe(1_250);
  });

  it("continues a declared section onto the following page", () => {
    const parsed = parsePositionedPaystub(
      [
        ...row(100, [["REMUNERATIVO", 100]], 1),
        ...row(
          800,
          [
            ["0001", 10],
            ["SUELDO", 30],
            ["$ 100.000,00", 500],
          ],
          2,
        ),
        ...row(
          790,
          [
            ["SUELDO NETO", 100],
            ["$ 100.000,00", 500],
          ],
          2,
        ),
      ],
      "recibo-2026-08.pdf",
    );

    expect(parsed.period).toBe("2026-08");
    expect(parsed.items[0]).toMatchObject({
      amount: 100_000,
      kind: "remunerative",
    });
    expect(parsed.items[0].evidence.page).toBe(2);
  });

  it("classifies an unprefixed amount table by its columns", () => {
    const parsed = parsePositionedPaystub(
      [
        ...row(500, [["PERÍODO DE PAGO", 590]]),
        ...row(485, [
          ["Mayo", 610],
          ["2026", 640],
        ]),
        ...row(460, [
          ["CÓDIGO", 15],
          ["CONCEPTO", 208],
          ["REMUNERATIVO", 483],
          ["NO REMUNERATIVO", 568],
          ["DESCUENTOS", 669],
          ["CONTRIBUCIONES", 752],
        ]),
        ...row(440, [
          ["0201", 24],
          ["SUELDO", 56],
          ["1.885.500,00", 507],
        ]),
        ...row(430, [
          ["0335", 24],
          ["PROVISION INTERNET", 56],
          ["40.000,00", 608],
        ]),
        ...row(420, [
          ["0402", 24],
          ["INSSJP LEY 19.032 (3%)", 56],
          ["56.565,00", 699],
        ]),
        ...row(410, [
          ["0501", 24],
          ["CONTRIBUCION JUBILACION", 56],
          ["338.129,34", 786],
        ]),
        ...row(200, [
          ["TOTAL NETO", 585],
          ["1.604.965,00", 759],
        ]),
        ...row(20, [
          ["PERÍODO", 80],
          ["Abril 2026", 100],
        ]),
      ],
      "recibo.pdf",
    );

    expect(parsed.period).toBe("2026-05");
    expect(parsed.statedNet).toBe(1_604_965);
    expect(parsed.items).toEqual([
      expect.objectContaining({
        name: "SUELDO",
        amount: 1_885_500,
        kind: "remunerative",
        destination: "salary",
      }),
      expect.objectContaining({
        name: "PROVISION INTERNET",
        amount: 40_000,
        kind: "non-remunerative",
      }),
    ]);
    expect(parsed.deductions).toEqual([
      expect.objectContaining({
        name: "INSSJP LEY 19.032 (3%)",
        amount: 56_565,
      }),
    ]);
    expect(parsed.rawText).toContain("CONTRIBUCION JUBILACION");
    expect(
      [...parsed.items, ...parsed.deductions].some((item) =>
        item.name.includes("CONTRIBUCION"),
      ),
    ).toBe(false);
  });

  it.each(["SAC", "S.A.C.", "Aguinaldo", "Sueldo Anual Complementario"])(
    "classifies %s as SAC",
    (concept) => {
      const parsed = parsePositionedPaystub(
        [
          ...row(120, [["EMPLEADOR EMPRESA DE PRUEBA", 10]]),
          ...row(100, [["REMUNERATIVO", 100]]),
          ...row(90, [
            ["0001", 10],
            [concept, 30],
            ["500.000,00", 500],
          ]),
        ],
        "sac-2026-06.pdf",
      );

      expect(parsed.items[0]).toMatchObject({ destination: "sac" });
    },
  );
});
