import { describe, expect, it } from "vitest";
import {
  classifyPaystubConcept,
  migrateStoredConcepts,
} from "@/lib/paystub-parser";
import { scenarioFromPaystub } from "@/lib/scenario-merge";
import { defaultScenario } from "@/lib/salary-engine";
import type {
  ConceptNature,
  ConceptTreatment,
  ParsedPaystub,
  PaystubConcept,
} from "@/lib/types";

const evidence = { originalText: "", page: 1, confidence: "high" as const };

function concept(
  id: string,
  amount: number,
  nature: ConceptNature,
  treatment: ConceptTreatment,
  selected = true,
): PaystubConcept {
  return {
    id,
    name: id,
    amount,
    nature,
    treatment,
    selected,
    evidence,
    classificationConfidence: "high",
  };
}

function receipt(concepts: PaystubConcept[]): ParsedPaystub {
  return {
    id: "receipt",
    fileName: "receipt.pdf",
    period: "2026-08",
    concepts,
    items: [],
    deductions: [],
    rawText: "recibo digital con contenido suficiente",
    warnings: [],
  };
}

describe("paystub concept classification", () => {
  it.each([
    ["SUELDO BASICO", "basic-salary"],
    ["ANTIGUEDAD", "seniority"],
    ["Presentismo", "attendance"],
    ["Recomposición No Rem.", "agreement-adjustment"],
    ["Incremento No Rem. Enero 2025", "agreement-adjustment"],
    ["Suma Fija acuerdo", "agreement-adjustment"],
    ["Suma compensatoria Abril 2024", "agreement-adjustment"],
    ["SUMA COMPENSATORIA", "agreement-adjustment"],
    ["Asignación compensatoria", "agreement-adjustment"],
    ["Redondeo", "rounding"],
    ["HORAS EXTRA 50%", "overtime-50"],
    ["HORAS EXTRA 100%", "overtime-100"],
    ["FERIADO TRABAJADO", "holiday"],
    ["COMISIONES", "commission"],
    ["PREMIO PRODUCTIVIDAD", "bonus"],
    ["Vacaciones gozadas", "vacation"],
    ["ANTICIPO VACACIONES", "vacation"],
    ["Plus vacacional", "vacation"],
    ["SUELDO ANUAL COMPLEMENTARIO", "sac"],
    ["REINTEGRO GASTOS", "reimbursement"],
    ["JUBILACION", "pension"],
    ["OBRA SOCIAL", "health"],
    ["LEY 19032", "pami"],
    ["IMPUESTO A LAS GANANCIAS", "income-tax"],
    ["CUOTA SINDICAL", "union"],
    ["BASE IMPONIBLE", "informational"],
  ] as const)("classifies %s", (name, nature) => {
    expect(classifyPaystubConcept(name, "remunerative").nature).toBe(nature);
  });

  it.each([
    ["ANTICIPO BONO AC.12/25", "advance"],
    ["O.S.DE EJECUTIVOS", "health"],
    ["Ley 19.032 3%", "pami"],
    ["S.E.C. 2%", "union"],
    ["F.A.E.C.Y.S. 0.5%", "union"],
    ["Aporte Adicional OSECAC Emerg.", "other-deduction"],
  ] as const)("prioritizes deduction meaning for %s", (name, nature) => {
    expect(classifyPaystubConcept(name, "deduction").nature).toBe(nature);
  });

  it("keeps unknown concepts generic and marks them for review", () => {
    expect(classifyPaystubConcept("CONCEPTO ESPECIAL", "remunerative")).toEqual(
      {
        nature: "other-earning",
        classificationConfidence: "low",
      },
    );
  });

  it("maps selected concepts and excludes legal deductions from other deductions", () => {
    const scenario = scenarioFromPaystub(
      { ...defaultScenario, id: "mapped" },
      receipt([
        concept("basic", 1_000_000, "basic-salary", "remunerative"),
        concept("commission", 100_000, "commission", "remunerative"),
        concept("bonus", 50_000, "bonus", "remunerative"),
        concept("sac", 400_000, "sac", "remunerative"),
        concept("vacation", 200_000, "vacation", "remunerative"),
        concept("non-rem", 30_000, "other-earning", "non-remunerative"),
        concept("refund", 20_000, "reimbursement", "non-remunerative"),
        concept("pension", 110_000, "pension", "deduction"),
        concept("tax", 25_000, "income-tax", "deduction"),
        concept("union", 10_000, "union", "deduction"),
        concept("other", 5_000, "other-deduction", "deduction"),
        concept("excluded", 99_000, "bonus", "remunerative", false),
        concept("info", 999_999, "informational", "informational"),
      ]),
    );

    expect(scenario).toMatchObject({
      basicSalary: 1_000_000,
      commissions: 100_000,
      bonuses: 50_000,
      sac: 400_000,
      vacation: 200_000,
      nonRemunerative: 30_000,
      reimbursements: 20_000,
      unionMode: "fixed",
      unionValue: 10_000,
      otherDeductions: 5_000,
    });
    expect(scenario.sourceConcepts).toHaveLength(13);
  });

  it("migrates legacy salary and SAC destinations", () => {
    expect(
      migrateStoredConcepts([
        {
          id: "salary",
          name: "Adicional",
          amount: 10,
          kind: "remunerative",
          destination: "salary",
          selected: true,
        },
        {
          id: "sac",
          name: "Aguinaldo",
          amount: 20,
          kind: "remunerative",
          destination: "sac",
          selected: true,
        },
      ]),
    ).toMatchObject([
      { id: "salary", nature: "other-earning", treatment: "remunerative" },
      { id: "sac", nature: "sac", treatment: "remunerative" },
    ]);
  });
});
