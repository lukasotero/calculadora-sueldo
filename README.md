# Calculadora de Sueldo Argentina

Aplicación web open source para estimar sueldos de empleados en relación de
dependencia en Argentina y comprender mejor un recibo de sueldo.

**Aplicación pública:**
[lukasotero.github.io/calculadora-sueldo](https://lukasotero.github.io/calculadora-sueldo/)

Permite calcular un sueldo de bruto a neto, estimar el bruto necesario para
alcanzar un neto objetivo y revisar recibos en PDF sin subir información a un
servidor.

> [!IMPORTANT]
> Los resultados son orientativos. La aplicación no reemplaza una liquidación
> oficial ni el asesoramiento de un profesional contable o legal.

## Funcionalidades

- Cálculo de sueldo bruto a neto.
- Estimación de sueldo bruto a partir de un neto objetivo.
- Desglose de jubilación, obra social, PAMI, cuota sindical, Ganancias y otras
  deducciones.
- Carga manual de cuota sindical como porcentaje o importe fijo.
- Conceptos habituales: antigüedad, horas extra al 50 % y 100 %, feriados,
  comisiones, bonos, sumas no remunerativas y SAC.
- Cálculo orientativo de Ganancias mediante acumulados del año.
- Lectura local de recibos de sueldo en PDF digital.
- Identificación y revisión de conceptos extraídos del recibo.
- Clasificación por naturaleza y tratamiento legal, con inclusión manual y
  trazabilidad en escenarios guardados.
- Comparación orientativa entre el recibo y el resultado calculado.
- Escenarios guardados localmente en el navegador.
- Tema oscuro predeterminado con opción de tema claro.
- Interfaz responsive y accesible construida con shadcn/ui.

## Privacidad

Los recibos se procesan íntegramente en el navegador mediante PDF.js:

- El PDF no se envía a un servidor.
- No se utilizan servicios externos de inteligencia artificial.
- El archivo original no se persiste.
- Los escenarios normalizados se guardan únicamente en `localStorage` cuando
  el usuario decide conservarlos.

La primera versión admite solamente PDF con texto digital. Las fotografías,
los documentos escaneados y los PDF protegidos no son compatibles.

## Stack tecnológico

- Next.js 16 nativo con App Router y Turbopack.
- React 19 y TypeScript estricto.
- Tailwind CSS 4.
- shadcn/ui con primitives de Radix UI.
- Lucide para iconografía.
- `next-themes` para administrar el tema visual.
- PDF.js para leer recibos localmente.
- Vitest para pruebas unitarias del motor salarial.
- Playwright para pruebas de los flujos reales en navegador.

El proyecto no utiliza Vite, Vinext, Wrangler, Cloudflare Workers ni un runtime
alternativo a Next.js.

## Publicación

La aplicación se exporta como HTML, CSS y JavaScript estáticos mediante la
opción nativa `output: "export"` de Next.js. No requiere un servidor Node.js en
producción.

Cada push a la rama `master` ejecuta automáticamente los controles de formato,
lint, tipos y pruebas unitarias. Si todos finalizan correctamente, GitHub
Actions genera la carpeta `out` y la publica en GitHub Pages.

Para habilitar el primer despliegue:

1. Abrí `Settings → Pages` en el repositorio de GitHub.
2. En `Build and deployment`, seleccioná `GitHub Actions` como fuente.
3. Ejecutá nuevamente el workflow `Deploy GitHub Pages` o realizá un push a
   `master`.

El workflow configura `/calculadora-sueldo` como ruta base de producción. El
desarrollo local continúa disponible directamente en `http://localhost:3000`.

## Requisitos

- Node.js 22.13 o superior.
- npm 10 o superior.

## Instalación

```bash
git clone https://github.com/lukasotero/calculadora-sueldo.git
cd calculadora-sueldo
npm install
npm run dev
```

La aplicación estará disponible normalmente en
[`http://localhost:3000`](http://localhost:3000).

## Comandos

| Comando                    | Descripción                                      |
| -------------------------- | ------------------------------------------------ |
| `npm run dev`              | Inicia el entorno local de Next.js.              |
| `npm run build`            | Genera la compilación de producción.             |
| `npm run start`            | Ejecuta la compilación de producción.            |
| `npm run test`             | Ejecuta las pruebas unitarias con Vitest.        |
| `npm run test:watch`       | Mantiene las pruebas unitarias en ejecución.     |
| `npm run test:e2e`         | Ejecuta las pruebas de navegador con Playwright. |
| `npm run lint`             | Analiza el código con ESLint.                    |
| `npm run typecheck`        | Comprueba los tipos de TypeScript.               |
| `npm run format`           | Aplica el formato de Prettier.                   |
| `npm run format:check`     | Comprueba el formato sin modificar archivos.     |
| `npm run doctor`           | Ejecuta React Doctor y Knip.                     |
| `npm run doctor:react`     | Analiza la salud de la aplicación React.         |
| `npm run doctor:dead-code` | Detecta código y dependencias sin uso.           |
| `npm run check`            | Ejecuta los controles principales y el build.    |

Para ejecutar Playwright por primera vez puede ser necesario instalar su
navegador:

```bash
npx playwright install chromium
```

## Arquitectura

```text
src/
├── app/                    # Rutas, layout y estilos globales
├── components/
│   ├── ui/                 # Componentes de shadcn/ui
│   └── salary-calculator   # Experiencia principal de cálculo y recibos
└── lib/
    ├── rules/              # Parámetros legales versionados por período
    ├── salary-engine.ts    # Motor de cálculo puro
    ├── paystub-parser.ts   # Extracción y auditoría de recibos PDF
    └── types.ts            # Contratos del dominio

tests/
├── salary-engine.test.ts   # Casos del motor salarial
├── paystub-parser.test.ts  # Casos de auditoría
└── e2e/                    # Flujos de navegador con Playwright
```

La lógica salarial está separada de la interfaz y se implementa con funciones
puras. Esto permite validar las reglas sin depender del navegador y facilita
incorporar nuevos períodos.

## Reglas salariales

La cobertura histórica corresponde a Argentina desde enero de 2019 hasta el
último período oficial confirmado. Los parámetros legales viven en
`src/lib/rules` e incluyen:

- Período de vigencia.
- Porcentajes generales de aportes.
- Topes previsionales.
- Deducciones personales acumuladas.
- Fuente oficial y fecha de verificación.

Las fuentes primarias utilizadas deben ser ARCA, ANSES, el Boletín Oficial u
otros organismos públicos competentes.

Ganancias se resuelve por la fecha de pago usando las tablas históricas de
ARCA; los aportes se resuelven por período devengado usando las bases
imponibles publicadas por ANSES. La aplicación valida que no falte ningún mes
en la serie. Los recibos anteriores a 2019 se pueden leer, pero no se convierten
en cálculos. Los períodos posteriores al último confirmado usan la última regla
disponible y se identifican expresamente como estimados.

### Actualizar una regla

Toda modificación normativa debe:

1. Indicar el período exacto de vigencia.
2. Enlazar una fuente oficial.
3. Actualizar la fecha de verificación.
4. Incorporar pruebas para valores normales, límites y topes.
5. Evitar modificar períodos anteriores que ya fueron publicados.

## Alcance y limitaciones

- No determina automáticamente el convenio colectivo ni el sindicato
  aplicable.
- No contiene un catálogo de escalas salariales por convenio.
- La cuota sindical debe ingresarse manualmente.
- Ganancias depende de los acumulados y deducciones informados por el usuario.
- No contempla inicialmente monotributo, autónomos, indemnizaciones ni
  liquidaciones finales.
- La lectura de recibos utiliza heurísticas y siempre requiere confirmación.
- Una diferencia detectada es una señal para revisar, no una afirmación de
  incumplimiento.

## Contribuir

Las contribuciones son bienvenidas. Antes de enviar un cambio, consultá
[CONTRIBUTING.md](CONTRIBUTING.md) y ejecutá:

```bash
npm run check
npm run test:e2e
```

No adjuntes recibos reales, CUIL, nombres, empleadores ni ningún otro dato
personal en issues, fixtures o pull requests.

El proyecto también cuenta con un [código de conducta](CODE_OF_CONDUCT.md) y
una [política de seguridad](SECURITY.md).

## Licencia

Distribuido bajo la licencia MIT. Consultá [LICENSE](LICENSE) para conocer los
detalles.
