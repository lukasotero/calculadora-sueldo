import Link from "next/link";
import Image from "next/image";
import {
  Calculator,
  Github,
  LockKeyhole,
  Scale,
  ShieldCheck,
} from "lucide-react";
import heroEditorial from "@/assets/brand/hero-editorial.png";
import { BrandLogo } from "@/components/brand-logo";
import { SalaryCalculator } from "@/components/salary-calculator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import packageJson from "../../package.json";

export default function HomePage() {
  return (
    <div className="min-h-screen min-w-0">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl min-w-0 items-center justify-between gap-2 px-4 sm:px-6 2xl:px-8">
          <Link
            className="min-w-0"
            href="/"
            aria-label="Calculadora de Sueldo — inicio"
          >
            <BrandLogo />
          </Link>
          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
          >
            <Link className="hover:text-foreground" href="#calculadora">
              Calculadora
            </Link>
            <Link className="hover:text-foreground" href="#metodologia">
              Metodología
            </Link>
            <Link className="hover:text-foreground" href="#privacidad">
              Privacidad
            </Link>
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="icon">
              <a
                href="https://github.com/lukasotero/calculadora-sueldo"
                aria-label="Ver proyecto en GitHub"
              >
                <Github data-icon="inline-start" />
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main>
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,color-mix(in_oklab,var(--primary)_15%,transparent),transparent_36%)]"
          />
          <div className="mx-auto max-w-7xl min-w-0 px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20 2xl:px-8">
            <div className="grid min-w-0 items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-6 xl:gap-10">
              <div className="relative z-10 min-w-0 max-w-4xl">
                <Badge className="mb-5 gap-2 border-primary/25 bg-primary/10 px-3 py-1.5 font-bold uppercase tracking-[.12em] text-primary [&>svg]:size-3.5">
                  <ShieldCheck data-icon="inline-start" /> Gratis, privado y
                  open source
                </Badge>
                <h1 className="max-w-3xl text-[clamp(2.35rem,12vw,3rem)] font-bold leading-[1.05] tracking-[-.04em] break-words sm:text-6xl lg:text-6xl xl:text-7xl">
                  Tu sueldo,{" "}
                  <span className="text-primary">sin letra chica.</span>
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                  Calculá cuánto cobrás en mano, descubrí qué bruto necesitás y
                  entendé cada línea de tu recibo. Tus datos nunca salen de tu
                  dispositivo.
                </p>
                <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
                  <Button
                    asChild
                    size="lg"
                    className="w-full min-[420px]:w-auto"
                  >
                    <a href="#calculadora">Calcular mi sueldo</a>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full min-[420px]:w-auto"
                  >
                    <a href="#metodologia">Cómo calculamos</a>
                  </Button>
                </div>
              </div>
              <div className="hero-art relative hidden min-h-[380px] min-w-0 lg:block xl:min-h-[430px]">
                <div
                  data-overflow-allow="decorative"
                  className="absolute -inset-8 rounded-[3rem] bg-primary/10 blur-3xl xl:-inset-10"
                />
                <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#071b20] shadow-[0_36px_100px_-42px_rgba(3,18,22,.9)]">
                  <Image
                    src={heroEditorial}
                    alt="Ilustración editorial de un recibo de sueldo claro junto a una calculadora y una línea de balance"
                    className="aspect-[4/3] w-full object-cover object-right dark:brightness-125"
                    sizes="(min-width: 1024px) 52vw, 0px"
                    priority
                    unoptimized
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
                </div>
                <p className="absolute -bottom-4 left-8 rounded-full border bg-background/90 px-4 py-2 text-xs font-semibold text-muted-foreground shadow-lg backdrop-blur-xl">
                  Claridad para decidir mejor
                </p>
              </div>
            </div>
            <div className="mt-10 grid min-w-0 max-w-3xl gap-3 sm:grid-cols-3 lg:mt-12">
              <Feature
                icon={<Calculator />}
                title="Bruto ↔ neto"
                text="Calculá en ambas direcciones."
              />
              <Feature
                icon={<LockKeyhole />}
                title="PDF privado"
                text="Se procesa en tu navegador."
              />
              <Feature
                icon={<Scale />}
                title="Reglas visibles"
                text="Fuentes y supuestos claros."
              />
            </div>
          </div>
        </section>
        <section id="calculadora" className="scroll-mt-24 border-y bg-muted/45">
          <div className="mx-auto max-w-7xl min-w-0 px-4 py-10 sm:px-6 sm:py-14 2xl:px-8">
            <SalaryCalculator />
          </div>
        </section>
        <section id="metodologia" className="scroll-mt-20 border-y bg-card/40">
          <div className="mx-auto grid max-w-7xl min-w-0 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)] xl:gap-14 2xl:px-8">
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-[.14em] text-primary">
                Metodología abierta
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Mostramos las cuentas, no una cifra mágica.
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                La estimación aplica aportes generales, topes previsionales y
                deducciones personales del período seleccionado.
              </p>
            </div>
            <div className="grid min-w-0 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3">
              <Method
                number="01"
                title="Sumamos haberes"
                text="Básico, antigüedad, extras, bonos y conceptos no remunerativos."
              />
              <Method
                number="02"
                title="Aplicamos descuentos"
                text="Jubilación, obra social, PAMI, sindicato y deducciones manuales."
              />
              <Method
                number="03"
                title="Estimamos Ganancias"
                text="Usamos los acumulados y cargas de familia que nos informás."
              />
            </div>
          </div>
        </section>
        <section
          id="privacidad"
          className="mx-auto max-w-7xl min-w-0 scroll-mt-20 px-4 py-16 sm:px-6 2xl:px-8"
        >
          <div className="rounded-3xl border border-primary/25 bg-primary/[.06] p-6 sm:p-10">
            <div className="grid min-w-0 gap-8 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] xl:gap-10">
              <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <LockKeyhole />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Tus recibos son tuyos.</h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  Los PDF se leen localmente. No los subimos, almacenamos ni
                  enviamos a una inteligencia artificial.
                </p>
              </div>
              <div>
                <h3 className="font-semibold">Alcance orientativo</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  La herramienta ayuda a entender y comparar. No reemplaza la
                  liquidación del empleador ni el asesoramiento profesional ante
                  situaciones particulares.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <Separator />
        <div className="mx-auto flex max-w-7xl min-w-0 flex-col gap-5 px-4 py-8 text-center text-xs leading-5 text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between md:text-left 2xl:px-8">
          <div className="flex flex-col gap-1">
            <p>
              © {new Date().getFullYear()} Calculadora de Sueldo · v
              {packageJson.version}
            </p>
            <p>Proyecto open source bajo licencia MIT.</p>
          </div>
          <nav
            className="flex flex-wrap justify-center gap-x-5 gap-y-2 md:justify-end"
            aria-label="Fuentes y créditos"
          >
            <a
              className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="https://www.arca.gob.ar/gananciasYBienes/ganancias/personas-humanas-sucesiones-indivisas/deducciones/deducciones-personales.asp"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fuente: ARCA
            </a>
            <a
              className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="https://www.anses.gob.ar"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fuente: ANSES
            </a>
            <span>
              Powered by{" "}
              <a
                href="https://www.linkedin.com/in/lukas-otero/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lukas Otero
              </a>
            </span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-card/70 p-3">
      <span
        data-feature-icon
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary [&>svg]:size-5"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
function Method({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <article className="bg-card p-6">
      <span className="font-mono text-sm font-bold text-primary">{number}</span>
      <h3 className="mt-8 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}
