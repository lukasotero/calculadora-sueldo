"use client";

import { useState, useSyncExternalStore } from "react";
import { CalendarDays, Check, ChevronDown, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const months = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const subscribeToLocalPeriod = () => () => {};

function getLocalPeriodSnapshot() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

type PeriodPickerProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  minYear: number;
  maxYear: number;
  maxPeriod?: string;
};

export function PeriodPicker({
  id,
  value,
  onValueChange,
  minYear,
  maxYear,
  maxPeriod,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [valueYear, valueMonth] = value.split("-").map(Number);
  const selectedYear = Number.isFinite(valueYear) ? valueYear : minYear;
  const selectedMonth = Number.isFinite(valueMonth) ? valueMonth : 1;
  const years = Array.from(
    { length: Math.max(1, maxYear - minYear + 1) },
    (_, index) => minYear + index,
  );
  const currentLocalPeriod = useSyncExternalStore(
    subscribeToLocalPeriod,
    getLocalPeriodSnapshot,
    () => "",
  );
  const [localYear, localMonth] = currentLocalPeriod.split("-").map(Number);
  const currentYear = Number.isFinite(localYear) ? localYear : undefined;
  const currentMonth = Number.isFinite(localMonth) ? localMonth : undefined;
  const currentPeriodSupported =
    currentYear !== undefined &&
    currentMonth !== undefined &&
    currentYear >= minYear &&
    currentYear <= maxYear;
  const [maximumYear, maximumMonth] = (maxPeriod ?? `${maxYear}-12`)
    .split("-")
    .map(Number);

  function selectMonth(month: number) {
    onValueChange(`${selectedYear}-${String(month).padStart(2, "0")}`);
    setOpen(false);
  }

  function selectYear(year: string) {
    onValueChange(`${year}-${String(selectedMonth).padStart(2, "0")}`);
  }

  function selectCurrentPeriod() {
    if (!currentPeriodSupported || !currentYear || !currentMonth) return;
    onValueChange(`${currentYear}-${String(currentMonth).padStart(2, "0")}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full min-w-0 justify-between px-3 font-normal"
          aria-label="Seleccionar período"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <CalendarDays data-icon="inline-start" />
            <span className="truncate capitalize">
              {months[selectedMonth - 1]} de {selectedYear}
            </span>
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 max-w-[calc(100vw-2rem)] p-3"
        align="start"
        collisionPadding={16}
      >
        <div className="flex flex-col gap-3">
          <Select value={String(selectedYear)} onValueChange={selectYear}>
            <SelectTrigger aria-label="Año del período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent collisionPadding={16}>
              <SelectGroup>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!currentPeriodSupported}
            onClick={selectCurrentPeriod}
          >
            <LocateFixed data-icon="inline-start" />
            Ir al mes actual
          </Button>
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label="Mes del período"
          >
            {months.map((month, index) => {
              const monthNumber = index + 1;
              const selected = monthNumber === selectedMonth;
              const unavailable =
                selectedYear > maximumYear ||
                (selectedYear === maximumYear && monthNumber > maximumMonth);
              return (
                <Button
                  key={month}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "ghost"}
                  className="min-w-0 capitalize"
                  aria-pressed={selected}
                  disabled={unavailable}
                  onClick={() => selectMonth(monthNumber)}
                >
                  <span className="truncate">{month.slice(0, 3)}.</span>
                  <Check
                    data-icon="inline-end"
                    className={cn(!selected && "invisible")}
                  />
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
