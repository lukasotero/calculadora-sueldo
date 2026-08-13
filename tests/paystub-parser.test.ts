import { describe, expect, it } from "vitest";
import {
  auditPaystub,
  groupTextItemsIntoRows,
  parsePositionedPaystub,
  sumAdditionalPaystubDeductions,
  type PositionedTextItem,
} from "@/lib/paystub-parser";
import type { ParsedPaystub, SalaryResult } from "@/lib/types";

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
};
describe("paystub audit", () => {
  it("accepts rounding differences", () => {
    const parsed: ParsedPaystub = {
      id: "1",
      fileName: "anonimo.pdf",
      items: [],
      deductions: [],
      statedNet: 829.5,
      rawText: "",
      warnings: [],
    };
    expect(auditPaystub(parsed, result)[0].severity).toBe("ok");
  });
  it("flags material net differences", () => {
    const parsed: ParsedPaystub = {
      id: "1",
      fileName: "anonimo.pdf",
      items: [],
      deductions: [],
      statedNet: 700,
      rawText: "",
      warnings: [],
    };
    expect(auditPaystub(parsed, result)[0].severity).toBe("review");
  });
});

describe("positioned paystub parser", () => {
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
});
