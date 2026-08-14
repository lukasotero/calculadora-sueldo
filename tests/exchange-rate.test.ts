import { describe, expect, it } from "vitest";
import {
  convertArsToUsd,
  getExchangeRateRequest,
  migrateHistoricalExchangeRates,
  parseExchangeRateResponse,
  parseHistoricalExchangeRateResponse,
  readCachedHistoricalExchangeRate,
  readCachedExchangeRate,
  writeCachedExchangeRate,
} from "@/lib/exchange-rate";
import { defaultScenario } from "@/lib/salary-engine";
import { formatDate } from "@/lib/utils";

describe("exchange rate", () => {
  it("formats ISO dates for display", () => {
    expect(formatDate("2026-08-13")).toBe("13/08/2026");
  });

  it("selects the newest positive value", () => {
    expect(
      parseExchangeRateResponse({
        results: [
          {
            detalle: [
              { fecha: "2026-08-12", valor: 1450 },
              { fecha: "2026-08-13", valor: 1460.5 },
            ],
          },
        ],
      }),
    ).toEqual({ rate: 1460.5, date: "2026-08-13", source: "BCRA" });
  });

  it("rejects incomplete or non-positive responses", () => {
    expect(() => parseExchangeRateResponse({ results: [] })).toThrow();
    expect(() =>
      parseExchangeRateResponse({
        results: [{ detalle: [{ fecha: "2026-08-13", valor: 0 }] }],
      }),
    ).toThrow();
  });

  it("converts ARS safely", () => {
    expect(convertArsToUsd(1_460_500, 1460.5)).toBe(1000);
    expect(convertArsToUsd(100, 0)).toBeUndefined();
  });

  it("does not replace a newer cached quote", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writeCachedExchangeRate(storage, {
      rate: 1460,
      date: "2026-08-13",
      source: "BCRA",
    });
    writeCachedExchangeRate(storage, {
      rate: 1400,
      date: "2026-08-12",
      source: "BCRA",
    });
    expect(readCachedExchangeRate(storage)?.rate).toBe(1460);
  });

  it("selects the first quote on or after the payment date", () => {
    const request = getExchangeRateRequest("2026-05", "2026-05-30", "2026-08");
    expect(request).toBeDefined();
    expect(
      parseHistoricalExchangeRateResponse(
        {
          results: [
            {
              detalle: [
                { fecha: "2026-06-02", valor: 1435 },
                { fecha: "2026-06-01", valor: 1430 },
                { fecha: "2026-05-29", valor: 1425 },
              ],
            },
          ],
        },
        request!,
      ),
    ).toMatchObject({
      rate: 1430,
      date: "2026-06-01",
      period: "2026-05",
      reference: "payment-date",
      requestedDate: "2026-05-30",
    });
  });

  it("selects the last quote in a month when there is no payment date", () => {
    const request = getExchangeRateRequest("2026-05", undefined, "2026-08");
    expect(
      parseHistoricalExchangeRateResponse(
        {
          results: [
            {
              detalle: [
                { fecha: "2026-05-28", valor: 1420 },
                { fecha: "2026-05-29", valor: 1425 },
              ],
            },
          ],
        },
        request!,
      ),
    ).toMatchObject({ date: "2026-05-29", reference: "month-close" });
  });

  it("groups migration requests and keeps failed legacy snapshots", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const scenarios = [
      {
        ...defaultScenario,
        id: "may-a",
        period: "2026-05",
        exchangeRate: {
          rate: 1500,
          date: "2026-08-01",
          source: "BCRA" as const,
        },
      },
      { ...defaultScenario, id: "may-b", period: "2026-05" },
      { ...defaultScenario, id: "june", period: "2026-06" },
    ];
    const calls: string[] = [];
    const result = await migrateHistoricalExchangeRates(
      scenarios,
      storage,
      undefined,
      async (request) => {
        calls.push(request.cacheKey);
        if (request.period === "2026-06") throw new Error("offline");
        return {
          rate: 1425,
          date: "2026-05-29",
          source: "BCRA",
          period: request.period,
          reference: request.reference,
          requestedDate: request.requestedDate,
        };
      },
    );

    expect(calls).toEqual(["month-close:2026-05", "month-close:2026-06"]);
    expect(result.scenarios[0].exchangeRate?.rate).toBe(1425);
    expect(result.scenarios[1].exchangeRate?.rate).toBe(1425);
    expect(result.scenarios[2].exchangeRate).toBeUndefined();
    expect(result.pending).toBe(1);
    const mayRequest = getExchangeRateRequest("2026-05", undefined, "2026-08");
    expect(
      readCachedHistoricalExchangeRate(storage, mayRequest!),
    ).toBeDefined();
  });
});
