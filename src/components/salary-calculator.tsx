"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileCheck2,
  FileText,
  HelpCircle,
  Info,
  Loader2,
  LockKeyhole,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PeriodPicker } from "@/components/period-picker";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  auditPaystub,
  parsePaystub,
  sumAdditionalPaystubDeductions,
} from "@/lib/paystub-parser";
import {
  calculateNetToGross,
  calculateSalary,
  defaultScenario,
} from "@/lib/salary-engine";
import type { ParsedPaystub, SalaryScenario } from "@/lib/types";
import { cn, money } from "@/lib/utils";

type View = "calculator" | "receipt" | "saved";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type ScenarioUpdater = <K extends keyof SalaryScenario>(
  key: K,
  value: SalaryScenario[K],
) => void;
const STORAGE_KEY = "salary-scenarios:v1";
const STORAGE_EVENT = "salary-scenarios-change";
const EMPTY_SCENARIOS: SalaryScenario[] = [];
let savedSnapshotRaw: string | undefined;
let savedSnapshot: SalaryScenario[] = EMPTY_SCENARIOS;

function getSavedSnapshot() {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_SCENARIOS;
  }
  if (raw === savedSnapshotRaw) return savedSnapshot;
  savedSnapshotRaw = raw ?? undefined;
  try {
    savedSnapshot = raw
      ? (JSON.parse(raw) as SalaryScenario[])
      : EMPTY_SCENARIOS;
  } catch {
    savedSnapshot = EMPTY_SCENARIOS;
  }
  return savedSnapshot;
}

function subscribeToSaved(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORAGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORAGE_EVENT, onChange);
  };
}

function writeSavedSnapshot(next: SalaryScenario[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  savedSnapshotRaw = undefined;
  window.dispatchEvent(new Event(STORAGE_EVENT));
}
const periodFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const numericFields = [
  ["basicSalary", "Sueldo básico", "Importe mensual bruto"],
  ["seniority", "Antigüedad", "Porcentaje sobre el básico"],
  ["overtime50Hours", "Horas extra 50%", "Cantidad de horas"],
  ["overtime100Hours", "Horas extra 100%", "Cantidad de horas"],
  ["holidayHours", "Horas en feriados", "Cantidad de horas"],
  ["commissions", "Comisiones", "Importe remunerativo"],
  ["bonuses", "Bonos", "Importe remunerativo"],
  ["nonRemunerative", "No remunerativo", "Importe sin aportes"],
  ["sac", "SAC / aguinaldo", "Importe remunerativo"],
  ["otherDeductions", "Otras deducciones", "Importe manual"],
] as const;
const saveLabels: Record<SaveStatus, string> = {
  idle: "Guardar escenario",
  saving: "Guardando…",
  saved: "Guardado",
  error: "No se pudo guardar",
};
const saveIcons: Record<SaveStatus, React.ReactNode> = {
  idle: <Save data-icon="inline-start" />,
  saving: <Loader2 data-icon="inline-start" className="animate-spin" />,
  saved: <CheckCircle2 data-icon="inline-start" />,
  error: <AlertCircle data-icon="inline-start" />,
};

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  const formatted = periodFormatter.format(new Date(Date.UTC(year, month - 1)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function SalaryCalculator() {
  const calculator = useSalaryCalculator();
  const {
    view,
    setView,
    scenario,
    setScenario,
    mode,
    setMode,
    targetNet,
    setTargetNet,
    unionEnabled,
    setUnionEnabled,
    saved,
    paystubs,
    setPaystubs,
    loading,
    uploadError,
    inputRef,
    result,
    update,
    saveScenario,
    saveStatus,
    removeSaved,
    duplicateSaved,
    renameSaved,
    uploadFiles,
    applyPaystub,
  } = calculator;
  const hasIncomeTaxData =
    scenario.spouse ||
    scenario.children > 0 ||
    scenario.ytd.taxableIncome > 0 ||
    scenario.ytd.generalDeductions > 0 ||
    scenario.ytd.withheldTax > 0;
  const showIncomeTax = result.mayPayIncomeTax || hasIncomeTaxData;

  return (
    <>
      <MainNavigation
        view={view}
        savedCount={saved.length}
        onChange={setView}
      />

      {view === "calculator" && (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)] xl:gap-8">
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>Armá tu cálculo</CardTitle>
                  <CardDescription className="mt-1">
                    Todos los importes están expresados en pesos argentinos.
                  </CardDescription>
                </div>
                <Badge>Reglas 2026</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(value) => {
                    if (value) setMode(value as "gross" | "net");
                  }}
                  className="grid min-w-0 grid-cols-2 rounded-xl bg-muted p-1"
                  aria-label="Dirección del cálculo"
                >
                  <ToggleGroupItem
                    value="gross"
                    className="min-h-11 min-w-0 px-1.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground min-[360px]:px-2 min-[360px]:text-sm"
                  >
                    Bruto → neto
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="net"
                    className="min-h-11 min-w-0 px-1.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground min-[360px]:px-2 min-[360px]:text-sm"
                  >
                    Neto → bruto
                  </ToggleGroupItem>
                </ToggleGroup>
                {mode === "net" ? (
                  <NetSalaryFields
                    scenario={scenario}
                    targetNet={targetNet}
                    unionEnabled={unionEnabled}
                    onTargetNetChange={setTargetNet}
                    onUnionEnabledChange={setUnionEnabled}
                    onUpdate={update}
                  />
                ) : (
                  <GrossSalaryFields scenario={scenario} onUpdate={update} />
                )}
                {mode === "gross" && showIncomeTax && (
                  <IncomeTaxFields scenario={scenario} onUpdate={update} />
                )}
                <CalculatorActions
                  saveStatus={saveStatus}
                  onSave={saveScenario}
                  onReset={() =>
                    setScenario({
                      ...defaultScenario,
                      id: crypto.randomUUID(),
                    })
                  }
                />
              </FieldGroup>
            </CardContent>
          </Card>
          <ResultPanel result={result} mode={mode} targetNet={targetNet} />
        </div>
      )}

      {view === "receipt" && (
        <ReceiptView
          inputRef={inputRef}
          loading={loading}
          uploadError={uploadError}
          paystubs={paystubs}
          result={result}
          onUpload={uploadFiles}
          onApply={applyPaystub}
          onDelete={(id) =>
            setPaystubs((current) => current.filter((item) => item.id !== id))
          }
        />
      )}

      {view === "saved" && (
        <SavedScenariosView
          scenarios={saved}
          onCreate={() => setView("calculator")}
          onDelete={removeSaved}
          onDuplicate={duplicateSaved}
          onRename={renameSaved}
          onOpen={(item) => {
            setScenario(item);
            setView("calculator");
          }}
        />
      )}
    </>
  );
}

function NetSalaryFields({
  scenario,
  targetNet,
  unionEnabled,
  onTargetNetChange,
  onUnionEnabledChange,
  onUpdate,
}: {
  scenario: SalaryScenario;
  targetNet: number;
  unionEnabled: boolean;
  onTargetNetChange: (value: number) => void;
  onUnionEnabledChange: (enabled: boolean) => void;
  onUpdate: ScenarioUpdater;
}) {
  return (
    <>
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[.12] via-primary/[.04] to-transparent p-5 sm:p-6">
        <CalculatorField
          label="¿Cuánto querés recibir en mano?"
          hint="Estimamos el sueldo bruto mensual necesario."
          htmlFor="target-net"
        >
          <MoneyInput
            id="target-net"
            value={targetNet}
            onChange={onTargetNetChange}
          />
        </CalculatorField>
      </div>
      <Accordion type="single" collapsible className="rounded-xl border px-4">
        <AccordionItem value="net-options" className="border-0">
          <AccordionTrigger>
            <span className="flex min-w-0 flex-col items-start gap-1 text-left">
              <span>{`Calculado con reglas de ${formatPeriod(scenario.period)}`}</span>
              <span className="text-xs font-normal text-muted-foreground">
                Cambiar período o agregar cuota sindical
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <FieldGroup>
              <CalculatorField
                label="Período"
                hint="Las tablas y topes cambian según el mes."
                htmlFor="period"
              >
                <PeriodPicker
                  id="period"
                  value={scenario.period}
                  minYear={2026}
                  maxYear={2026}
                  maxPeriod="2026-08"
                  onValueChange={(value) => onUpdate("period", value)}
                />
              </CalculatorField>
              <Field orientation="horizontal">
                <Checkbox
                  id="net-union-enabled"
                  checked={unionEnabled}
                  onCheckedChange={(checked) =>
                    onUnionEnabledChange(checked === true)
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor="net-union-enabled">
                    Agregar cuota sindical
                  </FieldLabel>
                  <FieldDescription>
                    Es opcional y depende de tu convenio o afiliación.
                  </FieldDescription>
                </FieldContent>
              </Field>
              {unionEnabled ? (
                <CalculatorField
                  label="Porcentaje sindical"
                  hint="Se estima sobre el bruto remunerativo; tu convenio puede usar otra base."
                  htmlFor="net-union-rate"
                >
                  <MoneyInput
                    id="net-union-rate"
                    value={scenario.unionValue}
                    onChange={(value) => onUpdate("unionValue", value)}
                    plain
                  />
                </CalculatorField>
              ) : null}
            </FieldGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Alert>
        <Info />
        <AlertTitle>Una estimación salarial estándar</AlertTitle>
        <AlertDescription>
          El básico equivalente coincide con el bruto porque no agregamos
          adicionales. El básico legal depende de tu convenio y categoría.
        </AlertDescription>
      </Alert>
    </>
  );
}

function GrossSalaryFields({
  scenario,
  onUpdate,
}: {
  scenario: SalaryScenario;
  onUpdate: ScenarioUpdater;
}) {
  return (
    <>
      <CalculatorField
        label="Período"
        hint="Disponible desde enero de 2026"
        htmlFor="period"
      >
        <PeriodPicker
          id="period"
          value={scenario.period}
          minYear={2026}
          maxYear={2026}
          maxPeriod="2026-08"
          onValueChange={(value) => onUpdate("period", value)}
        />
      </CalculatorField>
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        {numericFields.map(([key, label, hint]) => (
          <CalculatorField
            key={key}
            label={label}
            hint={hint}
            htmlFor={`scenario-${key}`}
          >
            <MoneyInput
              id={`scenario-${key}`}
              value={scenario[key]}
              onChange={(value) => onUpdate(key, value)}
              plain={key.includes("Hours") || key === "seniority"}
            />
          </CalculatorField>
        ))}
      </div>
      <Separator />
      <Field>
        <FieldLabel htmlFor="union-value">Cuota sindical</FieldLabel>
        <FieldDescription>
          Ingresala según tu recibo o convenio.
        </FieldDescription>
        <Select
          value={scenario.unionMode}
          onValueChange={(value) =>
            onUpdate("unionMode", value as "rate" | "fixed")
          }
        >
          <SelectTrigger aria-label="Tipo de cuota sindical">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="rate">Porcentaje</SelectItem>
              <SelectItem value="fixed">Importe fijo</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <MoneyInput
          id="union-value"
          value={scenario.unionValue}
          onChange={(value) => onUpdate("unionValue", value)}
          plain={scenario.unionMode === "rate"}
        />
      </Field>
    </>
  );
}

function IncomeTaxFields({
  scenario,
  onUpdate,
}: {
  scenario: SalaryScenario;
  onUpdate: ScenarioUpdater;
}) {
  return (
    <Accordion
      type="single"
      collapsible
      className="rounded-xl border border-primary/25 bg-primary/[.04] px-4"
    >
      <AccordionItem value="income-tax" className="border-0">
        <AccordionTrigger>
          <span className="flex min-w-0 flex-col items-start gap-1 text-left">
            <span>Tu sueldo podría pagar Ganancias</span>
            <span className="text-xs font-normal text-muted-foreground">
              Completá los acumulados para mejorar la estimación
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <Alert className="mb-5">
            <Info />
            <AlertTitle>Buscá estos datos en tu recibo</AlertTitle>
            <AlertDescription>
              Ingresá los totales anteriores al período seleccionado. Si los
              dejás en cero, Ganancias puede quedar subestimada.
            </AlertDescription>
          </Alert>
          <FieldGroup className="grid min-w-0 gap-5 sm:grid-cols-2">
            <Field orientation="horizontal" className="sm:col-span-2">
              <Checkbox
                id="spouse"
                checked={scenario.spouse}
                onCheckedChange={(checked) =>
                  onUpdate("spouse", checked === true)
                }
              />
              <FieldContent>
                <FieldLabel htmlFor="spouse">¿Deducís cónyuge?</FieldLabel>
                <FieldDescription>
                  Incluí esta deducción en la estimación anual.
                </FieldDescription>
              </FieldContent>
            </Field>
            <CalculatorField
              label="Hijos a cargo"
              htmlFor="income-tax-children"
            >
              <MoneyInput
                id="income-tax-children"
                plain
                value={scenario.children}
                onChange={(value) =>
                  onUpdate("children", Math.max(0, Math.floor(value)))
                }
              />
            </CalculatorField>
            <CalculatorField
              label="Remuneración gravada acumulada"
              hint="Buscá el total gravado acumulado hasta el recibo anterior. No incluyas el mes que estás calculando."
              htmlFor="income-tax-taxable-income"
            >
              <MoneyInput
                id="income-tax-taxable-income"
                value={scenario.ytd.taxableIncome}
                onChange={(value) =>
                  onUpdate("ytd", { ...scenario.ytd, taxableIncome: value })
                }
              />
            </CalculatorField>
            <CalculatorField
              label="Deducciones acumuladas"
              hint="Buscá las deducciones generales acumuladas hasta el recibo anterior."
              htmlFor="income-tax-general-deductions"
            >
              <MoneyInput
                id="income-tax-general-deductions"
                value={scenario.ytd.generalDeductions}
                onChange={(value) =>
                  onUpdate("ytd", {
                    ...scenario.ytd,
                    generalDeductions: value,
                  })
                }
              />
            </CalculatorField>
            <CalculatorField
              label="Ganancias retenida acumulada"
              hint="Ingresá el total de Impuesto a las Ganancias retenido antes de este mes."
              htmlFor="income-tax-withheld"
            >
              <MoneyInput
                id="income-tax-withheld"
                value={scenario.ytd.withheldTax}
                onChange={(value) =>
                  onUpdate("ytd", { ...scenario.ytd, withheldTax: value })
                }
              />
            </CalculatorField>
          </FieldGroup>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function CalculatorActions({
  saveStatus,
  onSave,
  onReset,
}: {
  saveStatus: SaveStatus;
  onSave: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
      <Button
        className="min-h-11 w-full min-[420px]:w-auto min-[420px]:min-w-44"
        variant={saveStatus === "error" ? "destructive" : "default"}
        disabled={saveStatus === "saving"}
        onClick={() => void onSave()}
      >
        {saveIcons[saveStatus]}
        <span aria-live="polite">{saveLabels[saveStatus]}</span>
      </Button>
      <Button
        variant="outline"
        className="min-h-11 w-full min-[420px]:w-auto"
        onClick={onReset}
      >
        <RotateCcw data-icon="inline-start" /> Restablecer
      </Button>
    </div>
  );
}

function useSalaryCalculator() {
  const [view, setView] = useState<View>("calculator");
  const [scenario, setScenario] = useState<SalaryScenario>(defaultScenario);
  const [mode, setMode] = useState<"gross" | "net">("gross");
  const [targetNet, setTargetNet] = useState(1_500_000);
  const [unionEnabled, setUnionEnabled] = useState(false);
  const saved = useSyncExternalStore(
    subscribeToSaved,
    getSavedSnapshot,
    () => EMPTY_SCENARIOS,
  );
  const [paystubs, setPaystubs] = useState<ParsedPaystub[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const saveInProgress = useRef(false);
  const saveResetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const result = useMemo(
    () =>
      mode === "net"
        ? calculateNetToGross({
            targetNet,
            period: scenario.period,
            unionEnabled,
            unionRate: scenario.unionValue,
          })
        : calculateSalary(scenario),
    [mode, scenario, targetNet, unionEnabled],
  );

  useEffect(
    () => () => {
      clearTimeout(saveResetTimer.current);
    },
    [],
  );

  function update<K extends keyof SalaryScenario>(
    key: K,
    value: SalaryScenario[K],
  ) {
    setScenario((current) => ({ ...current, [key]: value }));
  }
  async function saveScenario() {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    clearTimeout(saveResetTimer.current);
    setSaveStatus("saving");
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : 300));
    const next = [
      ...saved.filter((item) => item.id !== scenario.id),
      {
        ...scenario,
        id: crypto.randomUUID(),
        name: scenario.name.trim() || "Mi escenario",
      },
    ];
    let resetDelay = 1500;
    try {
      writeSavedSnapshot(next);
      setSaveStatus("saved");
    } catch {
      resetDelay = 2000;
      setSaveStatus("error");
    }
    saveInProgress.current = false;
    saveResetTimer.current = setTimeout(
      () => setSaveStatus("idle"),
      resetDelay,
    );
  }
  function removeSaved(id: string) {
    const next = saved.filter((item) => item.id !== id);
    writeSavedSnapshot(next);
  }
  function duplicateSaved(source: SalaryScenario) {
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      name: `Copia de ${source.name}`,
    };
    const next = [...saved, copy];
    writeSavedSnapshot(next);
  }
  function renameSaved(id: string, name: string) {
    const next = saved.map((item) =>
      item.id === id ? { ...item, name } : item,
    );
    writeSavedSnapshot(next);
  }
  async function uploadFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    setLoading(true);
    setUploadError(undefined);
    try {
      const selectedFiles = Array.from(files);
      selectedFiles.forEach((file) => {
        if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024)
          throw new Error("Usá archivos PDF de hasta 10 MB.");
      });
      const parsed = await Promise.all(selectedFiles.map(parsePaystub));
      setPaystubs((current) => [...current, ...parsed]);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "No pudimos leer el archivo.",
      );
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  function applyPaystub(parsed: ParsedPaystub) {
    const remunerative = parsed.items
      .filter((item) => item.selected && item.kind === "remunerative")
      .reduce((sum, item) => sum + item.amount, 0);
    const nonRemunerative = parsed.items
      .filter((item) => item.selected && item.kind === "non-remunerative")
      .reduce((sum, item) => sum + item.amount, 0);
    setScenario((current) => ({
      ...current,
      period: parsed.period ?? current.period,
      basicSalary: remunerative || current.basicSalary,
      nonRemunerative,
      otherDeductions: sumAdditionalPaystubDeductions(parsed.deductions),
    }));
    setMode("gross");
    setView("calculator");
  }

  return {
    view,
    setView,
    scenario,
    setScenario,
    mode,
    setMode,
    targetNet,
    setTargetNet,
    unionEnabled,
    setUnionEnabled,
    saved,
    paystubs,
    setPaystubs,
    loading,
    uploadError,
    inputRef,
    result,
    update,
    saveScenario,
    saveStatus,
    removeSaved,
    duplicateSaved,
    renameSaved,
    uploadFiles,
    applyPaystub,
  };
}

function MainNavigation({
  view,
  savedCount,
  onChange,
}: {
  view: View;
  savedCount: number;
  onChange: (view: View) => void;
}) {
  const items = [
    ["calculator", "Calculadora"],
    ["receipt", "Revisar recibo"],
    ["saved", `Escenarios${savedCount ? ` · ${savedCount}` : ""}`],
  ] as const;

  return (
    <Tabs
      value={view}
      onValueChange={(value) => onChange(value as View)}
      className="mb-6 w-full min-w-0 sm:mb-8"
    >
      <TabsList
        aria-label="Secciones principales"
        className="grid h-auto w-full min-w-0 grid-cols-3 border bg-card p-1"
      >
        {items.map(([id, label]) => (
          <TabsTrigger
            key={id}
            value={id}
            className="min-h-11 min-w-0 overflow-hidden px-1 text-[11px] sm:px-4 sm:text-sm"
          >
            <span className="truncate">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function ReceiptView({
  inputRef,
  loading,
  uploadError,
  paystubs,
  result,
  onUpload,
  onApply,
  onDelete,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  uploadError?: string;
  paystubs: ParsedPaystub[];
  result: ReturnType<typeof calculateSalary>;
  onUpload: (files: FileList | File[] | null) => Promise<void>;
  onApply: (paystub: ParsedPaystub) => void;
  onDelete: (id: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  function handleDragEnter(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (!loading) void onUpload(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card
        role="region"
        aria-label="Zona de carga de recibos PDF"
        className={cn(
          "min-w-0 overflow-hidden border-dashed transition-[border-color,box-shadow,background-color]",
          isDragging && "border-primary bg-primary/[.06] shadow-lg",
        )}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent className="flex min-h-72 flex-col items-center justify-center p-5 text-center sm:p-9">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : isDragging ? (
              <UploadCloud />
            ) : paystubs.length > 0 ? (
              <FileCheck2 />
            ) : (
              <Upload />
            )}
          </div>
          <Badge className="mt-5 border-primary/30 bg-primary/10 text-primary">
            <LockKeyhole data-icon="inline-start" /> Procesamiento privado
          </Badge>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">
            {isDragging
              ? "Soltá los PDF para empezar"
              : loading
                ? "Estamos leyendo tus recibos…"
                : "Arrastrá tus recibos acá"}
          </h2>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
            PDF con texto digital, hasta 10 MB cada uno. Podés cargar varios
            meses y los archivos nunca salen de tu dispositivo.
          </p>
          <Input
            ref={inputRef}
            aria-label="Seleccionar recibos de sueldo en PDF"
            className="sr-only !size-px !w-px"
            type="file"
            accept="application/pdf"
            multiple
            onChange={(event) => void onUpload(event.target.files)}
          />
          <Button
            size="lg"
            className="mt-5 min-h-11 w-full sm:w-auto"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Upload data-icon="inline-start" />
            )}
            Elegir PDF
          </Button>
          <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
            {paystubs.length > 0
              ? `${paystubs.length} ${paystubs.length === 1 ? "recibo listo" : "recibos listos"} para revisar`
              : "También podés usar el botón si preferís no arrastrar archivos"}
          </p>
          {uploadError && (
            <Alert variant="destructive" className="mt-5 max-w-xl text-left">
              <AlertCircle />
              <AlertTitle>No pudimos leer el archivo</AlertTitle>
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      {paystubs.map((parsed) => (
        <PaystubReview
          key={parsed.id}
          parsed={parsed}
          result={result}
          onApply={() => onApply(parsed)}
          onDelete={() => onDelete(parsed.id)}
        />
      ))}
    </div>
  );
}

function SavedScenariosView({
  scenarios,
  onCreate,
  onDelete,
  onDuplicate,
  onRename,
  onOpen,
}: {
  scenarios: SalaryScenario[];
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (scenario: SalaryScenario) => void;
  onRename: (id: string, name: string) => void;
  onOpen: (scenario: SalaryScenario) => void;
}) {
  const [deleteCandidate, setDeleteCandidate] = useState<string>();
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const scenarioToDelete = scenarios.find(
    (scenario) => scenario.id === deleteCandidate,
  );

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (deleteCandidate && !dialog.open) dialog.showModal();
    if (!deleteCandidate && dialog.open) dialog.close();
  }, [deleteCandidate]);

  if (scenarios.length === 0) {
    return (
      <Card>
        <CardContent>
          <Empty className="min-h-56 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Save />
              </EmptyMedia>
              <EmptyTitle>Todavía no guardaste escenarios</EmptyTitle>
              <EmptyDescription>
                Guardá cálculos para comparar propuestas o cambios de sueldo.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={onCreate}>Crear un escenario</Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {scenarios.map((item) => {
          const itemResult = calculateSalary(item);
          return (
            <Card key={item.id} className="min-w-0 overflow-hidden">
              <CardHeader>
                <Badge variant="outline" className="mb-2 w-fit">
                  {formatPeriod(item.period)}
                </Badge>
                <CardTitle className="sr-only">{item.name}</CardTitle>
                <Field>
                  <FieldLabel htmlFor={`scenario-name-${item.id}`}>
                    Nombre del escenario
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Pencil className="shrink-0 text-muted-foreground" />
                    <Input
                      id={`scenario-name-${item.id}`}
                      value={item.name}
                      maxLength={60}
                      onChange={(event) =>
                        onRename(item.id, event.target.value)
                      }
                      onBlur={(event) => {
                        if (!event.target.value.trim()) {
                          onRename(item.id, "Mi escenario");
                        }
                      }}
                    />
                  </div>
                </Field>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div>
                  <p className="break-all text-2xl font-bold text-primary min-[360px]:text-3xl">
                    {money.format(itemResult.net)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Neto estimado
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Bruto</p>
                    <p className="mt-1 break-all font-mono text-sm font-semibold tabular-nums">
                      {money.format(itemResult.gross)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Deducciones</p>
                    <p className="mt-1 break-all font-mono text-sm font-semibold tabular-nums">
                      {money.format(itemResult.deductions)}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  className="min-h-11 w-full sm:flex-1"
                  onClick={() => onOpen(item)}
                >
                  Abrir escenario <ArrowRight data-icon="inline-end" />
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => onDuplicate(item)}
                >
                  <Copy data-icon="inline-start" /> Duplicar
                </Button>
                <Button
                  aria-label={`Eliminar ${item.name}`}
                  className="min-h-11 w-full sm:w-auto"
                  variant="ghost"
                  onClick={() => setDeleteCandidate(item.id)}
                >
                  <Trash2 data-icon="inline-start" /> Eliminar
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
      <dialog
        ref={deleteDialogRef}
        aria-labelledby="delete-scenario-title"
        aria-describedby="delete-scenario-description"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-background/80 backdrop:backdrop-blur-sm"
        onCancel={() => setDeleteCandidate(undefined)}
        onClose={() => setDeleteCandidate(undefined)}
      >
        <div className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-2">
            <h2
              id="delete-scenario-title"
              className="text-xl font-semibold tracking-tight"
            >
              ¿Eliminar escenario?
            </h2>
            <p
              id="delete-scenario-description"
              className="leading-6 text-muted-foreground"
            >
              “{scenarioToDelete?.name}” se eliminará de este dispositivo. Esta
              acción no se puede deshacer.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => setDeleteCandidate(undefined)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                if (deleteCandidate) onDelete(deleteCandidate);
                setDeleteCandidate(undefined);
              }}
            >
              <Trash2 data-icon="inline-start" /> Eliminar escenario
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function CalculatorField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Field className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        {hint && (
          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`Más información sobre ${label}`}
                onMouseEnter={() => setHelpOpen(true)}
                onMouseLeave={() => setHelpOpen(false)}
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible")) {
                    setHelpOpen(true);
                  }
                }}
                onBlur={() => setHelpOpen(false)}
              >
                <HelpCircle />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              role="tooltip"
              className="w-64 max-w-[calc(100vw-2rem)] text-sm"
              align="start"
              collisionPadding={16}
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              {hint}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {children}
    </Field>
  );
}
function MoneyInput({
  id,
  value,
  onChange,
  plain,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  plain?: boolean;
}) {
  return (
    <InputGroup className="min-w-0">
      {!plain && <InputGroupAddon>$</InputGroupAddon>}
      <InputGroupInput
        id={id}
        type="number"
        min="0"
        step={plain ? "1" : "1000"}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </InputGroup>
  );
}

function ResultPanel({
  result,
  mode,
  targetNet,
}: {
  result: ReturnType<typeof calculateSalary>;
  mode: "gross" | "net";
  targetNet: number;
}) {
  const rows = [
    ["Jubilación · 11%", result.pension],
    ["Obra social · 3%", result.health],
    ["PAMI · 3%", result.pami],
    ["Cuota sindical", result.union],
    ["Ganancias estimada", result.incomeTax],
    ["Otras deducciones", result.otherDeductions],
  ] as const;
  return (
    <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      <Card className="min-w-0 border-primary/25 bg-gradient-to-b from-primary/[.08] to-card">
        <CardHeader>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <CardDescription>
                {mode === "net"
                  ? "Sueldo bruto estimado"
                  : "Sueldo neto estimado"}
              </CardDescription>
              <CardTitle className="mt-2 break-all text-3xl text-primary min-[360px]:text-4xl sm:text-5xl lg:text-4xl xl:text-5xl">
                {money.format(mode === "net" ? result.gross : result.net)}
              </CardTitle>
            </div>
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary sm:size-12">
              <Sparkles />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {mode === "net" ? (
            <div className="mb-5 grid gap-3 rounded-xl border border-primary/20 bg-background/60 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  Básico equivalente
                </p>
                <p className="mt-1 break-all font-semibold">
                  {money.format(result.basicEquivalent)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recibís en mano</p>
                <p className="mt-1 break-all font-semibold text-primary">
                  {money.format(targetNet)}
                </p>
              </div>
            </div>
          ) : null}
          <Progress
            className="mb-5"
            value={Math.max(
              0,
              Math.min(
                100,
                result.gross ? (result.net / result.gross) * 100 : 0,
              ),
            )}
            aria-label="Porcentaje del sueldo bruto que representa el neto"
          />
          <div className="flex flex-col gap-3 border-y py-5">
            {mode === "gross" ? (
              <>
                <SummaryRow
                  label="Remunerativo"
                  value={result.remunerative}
                  strong
                />
                <SummaryRow
                  label="No remunerativo"
                  value={result.nonRemunerative}
                />
              </>
            ) : null}
            <SummaryRow
              label="Total de descuentos"
              value={-result.deductions}
            />
          </div>
          <div className="mt-5 flex flex-col gap-2">
            {rows
              .filter(([, value]) => value > 0)
              .map(([label, value]) => (
                <SummaryRow key={label} label={label} value={-value} small />
              ))}
          </div>
          <Alert className="mt-6">
            <Info />
            <AlertTitle>Estimación orientativa</AlertTitle>
            <AlertDescription>
              <ul className="flex flex-col gap-1 text-xs leading-5">
                {result.assumptions.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Fuente: {result.rulesSource}. Verificado el{" "}
                {result.rulesVerifiedAt}.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </aside>
  );
}
function SummaryRow({
  label,
  value,
  strong,
  small,
}: {
  label: string;
  value: number;
  strong?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3",
        small && "text-sm",
      )}
    >
      <span
        className={cn(
          "min-w-0 break-words text-muted-foreground",
          strong && "font-semibold text-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 break-all text-right font-mono tabular-nums",
          strong && "font-bold",
        )}
      >
        {value < 0 ? "−" : ""}
        {money.format(Math.abs(value))}
      </span>
    </div>
  );
}
function PaystubReview({
  parsed,
  result,
  onApply,
  onDelete,
}: {
  parsed: ParsedPaystub;
  result: ReturnType<typeof calculateSalary>;
  onApply: () => void;
  onDelete: () => void;
}) {
  const findings = auditPaystub(parsed, result);
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 break-all">
              <FileText className="text-primary" /> {parsed.fileName}
            </CardTitle>
            <CardDescription>
              {parsed.period
                ? `Período ${parsed.period}`
                : "Período no identificado"}{" "}
              · {parsed.items.length + parsed.deductions.length} conceptos
              detectados
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Quitar recibo"
            onClick={onDelete}
          >
            <Trash2 data-icon="inline-start" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div
          data-overflow-allow="scroll-container"
          className="max-w-full overflow-x-auto rounded-xl border overscroll-x-contain"
        >
          <Table className="min-w-[560px]">
            <TableHeader className="bg-muted text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead>Clasificación</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span>Confianza</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          aria-label="¿Qué significa la confianza de la lectura?"
                        >
                          <HelpCircle />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-72 text-sm font-normal normal-case"
                        align="end"
                        collisionPadding={16}
                      >
                        Indica qué tan segura es la lectura automática. Alta
                        significa que encontramos el concepto y el importe
                        alineados dentro de una sección clara. Si aparece Media
                        o Baja, conviene revisar el dato antes de usarlo.
                      </PopoverContent>
                    </Popover>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...parsed.items, ...parsed.deductions]
                .slice(0, 30)
                .map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-xs">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Página {item.evidence.page}
                      </p>
                    </TableCell>
                    <TableCell>
                      {"kind" in item
                        ? item.kind === "remunerative"
                          ? "Remunerativo"
                          : "No remunerativo"
                        : "Deducción"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money.format(item.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          item.evidence.confidence === "low" &&
                            "border-amber-500/30 bg-amber-500/10 text-amber-500",
                        )}
                      >
                        {item.evidence.confidence === "high"
                          ? "Alta"
                          : item.evidence.confidence === "medium"
                            ? "Media"
                            : "Baja"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {findings.map((finding) => (
            <Alert
              key={finding.id}
              className={cn(
                "rounded-xl border p-4",
                finding.severity === "ok"
                  ? "border-primary/25 bg-primary/5"
                  : finding.severity === "review"
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "bg-muted/40",
              )}
            >
              {finding.severity === "ok" ? (
                <CheckCircle2 className="text-primary" />
              ) : (
                <AlertCircle className="text-amber-500" />
              )}
              <AlertTitle>{finding.title}</AlertTitle>
              <AlertDescription>{finding.detail}</AlertDescription>
            </Alert>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs text-muted-foreground">
            Confirmá y corregí los valores en la calculadora antes de tomar
            decisiones.
          </p>
          <Button className="min-h-11 w-full sm:w-auto" onClick={onApply}>
            Usar valores detectados <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
