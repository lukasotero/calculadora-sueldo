import type { ExchangeRateSnapshot, SalaryScenario } from "@/lib/types";
import { roundMoney } from "@/lib/utils";

const BCRA_EXCHANGE_RATE_URL =
  "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/4?Limit=30";
const BCRA_MONETARY_RATE_URL =
  "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/4";
const EXCHANGE_RATE_CACHE_KEY = "salary-exchange-rate:v1";
const HISTORICAL_EXCHANGE_RATE_CACHE_KEY = "salary-exchange-rates-history:v1";

type ExchangeRateRequest = {
  period: string;
  reference: "latest" | "payment-date" | "month-close";
  requestedDate?: string;
  cacheKey: string;
};

type MonetaryApiResponse = {
  status?: unknown;
  results?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validDetails(payload: unknown) {
  if (!isRecord(payload)) throw new Error("Respuesta inválida del BCRA.");
  const rawResults = (payload as MonetaryApiResponse).results;
  const results: unknown[] = Array.isArray(rawResults) ? rawResults : [];
  const first = results[0];
  const detail =
    isRecord(first) && Array.isArray(first.detalle) ? first.detalle : [];
  return detail.filter(
    (item): item is { fecha: string; valor: number } =>
      isRecord(item) &&
      typeof item.fecha === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.fecha) &&
      typeof item.valor === "number" &&
      Number.isFinite(item.valor) &&
      item.valor > 0,
  );
}

export function parseExchangeRateResponse(
  payload: unknown,
): ExchangeRateSnapshot {
  const valid = validDetails(payload).toSorted((a, b) =>
    b.fecha.localeCompare(a.fecha),
  );

  if (!valid.length)
    throw new Error("El BCRA no informó una cotización válida.");
  return { rate: valid[0].valor, date: valid[0].fecha, source: "BCRA" };
}

function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return isoDate(year, month - 1, day + days);
}

function currentLocalPeriod(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getExchangeRateRequest(
  period: string,
  paymentDate?: string,
  currentPeriod = currentLocalPeriod(),
): ExchangeRateRequest | undefined {
  if (!/^\d{4}-\d{2}$/.test(period) || period > currentPeriod) return undefined;
  if (period === currentPeriod) {
    return { period, reference: "latest", cacheKey: "latest" };
  }
  if (paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return {
      period,
      reference: "payment-date",
      requestedDate: paymentDate,
      cacheKey: `payment-date:${paymentDate}`,
    };
  }
  return {
    period,
    reference: "month-close",
    cacheKey: `month-close:${period}`,
  };
}

export function parseHistoricalExchangeRateResponse(
  payload: unknown,
  request: ExchangeRateRequest,
): ExchangeRateSnapshot {
  const details = validDetails(payload);
  const selected =
    request.reference === "payment-date" && request.requestedDate
      ? details
          .filter((item) => item.fecha >= request.requestedDate!)
          .toSorted((a, b) => a.fecha.localeCompare(b.fecha))[0]
      : details.toSorted((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (!selected)
    throw new Error("El BCRA no informó una cotización histórica válida.");
  return {
    rate: selected.valor,
    date: selected.fecha,
    source: "BCRA",
    period: request.period,
    reference: request.reference,
    requestedDate: request.requestedDate,
  };
}

function isExchangeRateSnapshot(value: unknown): value is ExchangeRateSnapshot {
  return (
    isRecord(value) &&
    typeof value.rate === "number" &&
    Number.isFinite(value.rate) &&
    value.rate > 0 &&
    typeof value.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    value.source === "BCRA"
  );
}

export function matchesExchangeRateRequest(
  snapshot: ExchangeRateSnapshot | undefined,
  request: ExchangeRateRequest,
) {
  return (
    snapshot?.period === request.period &&
    snapshot.reference === request.reference &&
    snapshot.requestedDate === request.requestedDate
  );
}

export function convertArsToUsd(amount: number, rate: number) {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0)
    return undefined;
  return roundMoney(amount / rate);
}

export function readCachedExchangeRate(storage: Pick<Storage, "getItem">) {
  try {
    const raw = storage.getItem(EXCHANGE_RATE_CACHE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isExchangeRateSnapshot(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedExchangeRate(
  storage: Pick<Storage, "getItem" | "setItem">,
  snapshot: ExchangeRateSnapshot,
) {
  const current = readCachedExchangeRate(storage);
  if (!current || snapshot.date >= current.date) {
    storage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify(snapshot));
  }
}

export async function fetchExchangeRate(signal?: AbortSignal) {
  const response = await fetch(BCRA_EXCHANGE_RATE_URL, {
    headers: { "Accept-Language": "es-AR" },
    signal,
  });
  if (!response.ok) throw new Error("No pudimos consultar la cotización.");
  return {
    ...parseExchangeRateResponse(await response.json()),
    period: currentLocalPeriod(),
    reference: "latest" as const,
  };
}

function readHistoricalCache(storage: Pick<Storage, "getItem">) {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(HISTORICAL_EXCHANGE_RATE_CACHE_KEY) ?? "{}",
    );
    if (!isRecord(parsed)) return {};
    const valid: Record<string, ExchangeRateSnapshot> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isExchangeRateSnapshot(value)) valid[key] = value;
    }
    return valid;
  } catch {
    return {};
  }
}

export function readCachedHistoricalExchangeRate(
  storage: Pick<Storage, "getItem">,
  request: ExchangeRateRequest,
) {
  const snapshot = readHistoricalCache(storage)[request.cacheKey];
  return matchesExchangeRateRequest(snapshot, request) ? snapshot : undefined;
}

export function writeCachedHistoricalExchangeRate(
  storage: Pick<Storage, "getItem" | "setItem">,
  request: ExchangeRateRequest,
  snapshot: ExchangeRateSnapshot,
) {
  storage.setItem(
    HISTORICAL_EXCHANGE_RATE_CACHE_KEY,
    JSON.stringify({
      ...readHistoricalCache(storage),
      [request.cacheKey]: snapshot,
    }),
  );
}

export async function fetchHistoricalExchangeRate(
  request: ExchangeRateRequest,
  signal?: AbortSignal,
) {
  if (request.reference === "latest") return fetchExchangeRate(signal);
  const [year, month] = request.period.split("-").map(Number);
  const from = request.requestedDate ?? `${request.period}-01`;
  const to = request.requestedDate
    ? addDays(request.requestedDate, 14)
    : isoDate(year, month, 0);
  const url = new URL(BCRA_MONETARY_RATE_URL);
  url.searchParams.set("Desde", from);
  url.searchParams.set("Hasta", to);
  url.searchParams.set("Limit", "40");
  const response = await fetch(url, {
    headers: { "Accept-Language": "es-AR" },
    signal,
  });
  if (!response.ok)
    throw new Error("No pudimos consultar la cotización histórica.");
  return parseHistoricalExchangeRateResponse(await response.json(), request);
}

export async function migrateHistoricalExchangeRates(
  scenarios: SalaryScenario[],
  storage: Pick<Storage, "getItem" | "setItem">,
  signal?: AbortSignal,
  fetcher = fetchHistoricalExchangeRate,
) {
  const requests = new Map<string, ExchangeRateRequest>();
  for (const scenario of scenarios) {
    const request = getExchangeRateRequest(
      scenario.period,
      scenario.paymentDate,
    );
    if (!request || request.reference === "latest") continue;
    if (
      !matchesExchangeRateRequest(scenario.exchangeRate, request) &&
      !readCachedHistoricalExchangeRate(storage, request)
    ) {
      requests.set(request.cacheKey, request);
    }
  }

  const resolved = new Map<string, ExchangeRateSnapshot>();
  const outcomes = await Promise.allSettled(
    [...requests.values()].map(async (request) => ({
      request,
      snapshot: await fetcher(request, signal),
    })),
  );
  for (const outcome of outcomes) {
    if (outcome.status !== "fulfilled") continue;
    const { request, snapshot } = outcome.value;
    writeCachedHistoricalExchangeRate(storage, request, snapshot);
    resolved.set(request.cacheKey, snapshot);
  }

  let changed = false;
  let pending = 0;
  const next = scenarios.map((scenario) => {
    const request = getExchangeRateRequest(
      scenario.period,
      scenario.paymentDate,
    );
    if (!request || request.reference === "latest") return scenario;
    if (matchesExchangeRateRequest(scenario.exchangeRate, request)) {
      return scenario;
    }
    const snapshot =
      resolved.get(request.cacheKey) ??
      readCachedHistoricalExchangeRate(storage, request);
    if (!snapshot) {
      pending += 1;
      return scenario;
    }
    changed = true;
    return { ...scenario, exchangeRate: snapshot };
  });

  return { scenarios: next, changed, pending };
}
