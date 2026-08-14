"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchExchangeRate,
  fetchHistoricalExchangeRate,
  getExchangeRateRequest,
  matchesExchangeRateRequest,
  readCachedExchangeRate,
  readCachedHistoricalExchangeRate,
  writeCachedExchangeRate,
  writeCachedHistoricalExchangeRate,
} from "@/lib/exchange-rate";
import type { ExchangeRateSnapshot } from "@/lib/types";

type ExchangeRateStatus = "loading" | "success" | "error" | "unavailable";

export function useExchangeRate({
  period,
  paymentDate,
  existingRate,
}: {
  period: string;
  paymentDate?: string;
  existingRate?: ExchangeRateSnapshot;
}) {
  const [rate, setRate] = useState<ExchangeRateSnapshot>();
  const [status, setStatus] = useState<ExchangeRateStatus>("loading");
  const [isCached, setIsCached] = useState(false);

  const request = useMemo(
    () => getExchangeRateRequest(period, paymentDate),
    [paymentDate, period],
  );

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!request) {
        setRate(undefined);
        setIsCached(false);
        setStatus("unavailable");
        return;
      }
      setStatus("loading");
      if (matchesExchangeRateRequest(existingRate, request)) {
        setRate(existingRate);
        setIsCached(true);
        setStatus("success");
        return;
      }
      if (request.reference !== "latest") {
        const cached = readCachedHistoricalExchangeRate(localStorage, request);
        if (cached) {
          setRate(cached);
          setIsCached(true);
          setStatus("success");
          return;
        }
      }
      try {
        const next =
          request.reference === "latest"
            ? await fetchExchangeRate(signal)
            : await fetchHistoricalExchangeRate(request, signal);
        if (request.reference === "latest") {
          writeCachedExchangeRate(localStorage, next);
        } else {
          writeCachedHistoricalExchangeRate(localStorage, request, next);
        }
        setRate(next);
        setIsCached(false);
        setStatus("success");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        const cached =
          request.reference === "latest"
            ? readCachedExchangeRate(localStorage)
            : undefined;
        setRate(cached);
        setIsCached(Boolean(cached));
        setStatus(cached ? "success" : "error");
      }
    },
    [existingRate, request],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);

  return { rate, status, isCached, refresh: () => refresh() };
}
