import { expect, test } from "@playwright/test";

function pdfFromLines(lines: string[]) {
  const content = lines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function paystubPdf() {
  return pdfFromLines([
    "BT /F1 10 Tf",
    "1 0 0 1 30 760 Tm (PERIODO AGOSTO 2026) Tj",
    "1 0 0 1 30 720 Tm (REMUNERATIVO) Tj",
    "1 0 0 1 30 700 Tm (001 SUELDO BASICO) Tj",
    "1 0 0 1 400 700 Tm (1.000.000,00) Tj",
    "1 0 0 1 30 680 Tm (002 PREMIO PRODUCTIVIDAD) Tj",
    "1 0 0 1 400 680 Tm (50.000,00) Tj",
    "1 0 0 1 30 640 Tm (DEDUCCIONES) Tj",
    "1 0 0 1 30 620 Tm (101 JUBILACION) Tj",
    "1 0 0 1 400 620 Tm (110.000,00) Tj",
    "1 0 0 1 30 600 Tm (102 CUOTA SINDICAL) Tj",
    "1 0 0 1 400 600 Tm (10.000,00) Tj",
    "1 0 0 1 30 560 Tm (NETO A COBRAR) Tj",
    "1 0 0 1 400 560 Tm (930.000,00) Tj ET",
  ]);
}

function mixedSacPaystubPdf() {
  return pdfFromLines([
    "BT /F1 10 Tf",
    "1 0 0 1 30 780 Tm (PERIODO JUNIO 2024) Tj",
    "1 0 0 1 30 750 Tm (REMUNERATIVO) Tj",
    "1 0 0 1 30 730 Tm (001 S.A.C.) Tj",
    "1 0 0 1 400 730 Tm (530.024,00) Tj",
    "1 0 0 1 30 700 Tm (NO REMUNERATIVO) Tj",
    "1 0 0 1 30 680 Tm (002 SAC S/INCREMENTO N/REM) Tj",
    "1 0 0 1 400 680 Tm (47.414,00) Tj",
    "1 0 0 1 30 650 Tm (DEDUCCIONES) Tj",
    "1 0 0 1 30 630 Tm (101 JUBILACION) Tj",
    "1 0 0 1 400 630 Tm (58.302,64) Tj",
    "1 0 0 1 30 610 Tm (102 LEY 19.032 3 %) Tj",
    "1 0 0 1 400 610 Tm (15.900,72) Tj",
    "1 0 0 1 30 590 Tm (103 S.E.C. 2%) Tj",
    "1 0 0 1 400 590 Tm (11.548,76) Tj",
    "1 0 0 1 30 570 Tm (104 F.A.E.C.Y.S. 0.5%) Tj",
    "1 0 0 1 400 570 Tm (2.887,19) Tj",
    "1 0 0 1 30 550 Tm (105 OSECAC-OS DE LOS EMPLEADOS DE) Tj",
    "1 0 0 1 400 550 Tm (17.323,14) Tj",
    "1 0 0 1 30 510 Tm (NETO A COBRAR) Tj",
    "1 0 0 1 400 510 Tm (471.475,55) Tj ET",
  ]);
}

test("hydrates persisted theme and scenarios without React errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem(
      "salary-scenarios:v1",
      JSON.stringify([
        {
          id: "persisted",
          name: "Escenario guardado",
          period: "2026-08",
          basicSalary: 1_800_000,
          seniority: 0,
          overtime50Hours: 0,
          overtime100Hours: 0,
          holidayHours: 0,
          commissions: 0,
          bonuses: 0,
          nonRemunerative: 0,
          sac: 0,
          unionMode: "rate",
          unionValue: 0,
          spouse: false,
          children: 0,
          otherDeductions: 0,
          ytd: { taxableIncome: 0, generalDeductions: 0, withheldTax: 0 },
        },
      ]),
    );
  });

  await page.goto("./");

  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.getByRole("tab", { name: "Escenarios · 1" })).toBeVisible();
  expect(
    errors.filter((message) =>
      /hydration|didn't match|script tag while rendering/i.test(message),
    ),
  ).toEqual([]);
});

test("starts dark and calculates salary with shadcn controls", async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-08-13T12:00:00"));
  await page.goto("./");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByText("Sueldo neto estimado")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tu sueldo/ })).toBeVisible();
  await expect(page.locator('input[type="month"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Seleccionar período" }).click();
  await expect(
    page.getByRole("combobox", { name: "Año del período" }),
  ).toHaveText("2026");
  await page.getByRole("button", { name: "Ir al mes actual" }).click();
  await expect(
    page.getByRole("button", { name: "Seleccionar período" }),
  ).toContainText("agosto de 2026");
  await page.getByRole("button", { name: "Seleccionar período" }).click();
  await expect(page.getByRole("button", { name: "sep." })).toBeEnabled();
  await page.getByRole("button", { name: "sep." }).click();
  await expect(page.getByText("Cálculo con reglas estimadas")).toBeVisible();
  await page.getByRole("button", { name: "Seleccionar período" }).click();
  await page.getByRole("combobox", { name: "Año del período" }).click();
  await page.getByRole("option", { name: "2019" }).click();
  await page.getByRole("button", { name: "ene." }).click();
  await expect(page.getByText("Reglas 2019-01")).toBeVisible();
  await page.getByRole("button", { name: "Seleccionar período" }).click();
  await page.getByRole("combobox", { name: "Año del período" }).click();
  await page.getByRole("option", { name: "2026" }).click();
  await page.getByRole("button", { name: "ago." }).click();
  await expect(
    page.getByRole("button", { name: "Seleccionar período" }),
  ).toContainText("agosto de 2026");

  await page.getByRole("combobox", { name: "Tipo de cuota sindical" }).click();
  await page.getByRole("option", { name: "Importe fijo" }).click();

  await expect(
    page.getByRole("button", { name: /Tu sueldo podría pagar Ganancias/ }),
  ).toHaveCount(0);
  await page
    .getByRole("spinbutton", { name: "Sueldo básico", exact: true })
    .fill("4000000");
  await page
    .getByRole("button", { name: /Tu sueldo podría pagar Ganancias/ })
    .click();
  await page.getByRole("checkbox", { name: "¿Deducís cónyuge?" }).click();
  await expect(
    page.getByRole("checkbox", { name: "¿Deducís cónyuge?" }),
  ).toBeChecked();

  await expect(
    page.getByRole("button", { name: "Más información sobre Período" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Más información sobre Sueldo básico" }),
  ).toHaveCount(0);
  if (testInfo.project.name === "desktop") {
    await page
      .locator('label[for="scenario-basicSalary"]')
      .hover({ force: true });
    await expect(page.getByRole("tooltip")).toContainText(
      "Importe mensual bruto",
    );
  }

  await page.getByRole("radio", { name: "Neto → bruto" }).click();
  await expect(page.getByText("Sueldo bruto estimado")).toBeVisible();
  await expect(
    page.getByText("Básico equivalente", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "Sueldo básico", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Calculado con reglas de Agosto de 2026/ })
    .click();
  await page.getByRole("checkbox", { name: "Agregar cuota sindical" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Porcentaje sindical" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Revisar recibo" }).click();
  await expect(page.getByText("Arrastrá tus recibos acá")).toBeVisible();

  await page
    .getByRole("button", { name: "Cambiar tema claro u oscuro" })
    .click();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("shows version, credit and stays within a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");

  await expect(page.getByText("v1.1.0")).toBeVisible();
  await expect(page.getByRole("link", { name: "Lukas Otero" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/lukas-otero/",
  );

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const featureIconsFit = await page
    .locator("[data-feature-icon]")
    .evaluateAll((icons) =>
      icons.every((icon) => {
        const svg = icon.querySelector("svg");
        if (!svg) return false;
        const container = icon.getBoundingClientRect();
        const drawing = svg.getBoundingClientRect();
        return (
          drawing.width <= container.width && drawing.height <= container.height
        );
      }),
    );
  expect(featureIconsFit).toBe(true);
});

test("does not duplicate and confirms deletion of unnamed saved scenarios", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "Guardar escenario" }).click();
  await expect(page.getByRole("button", { name: "Guardado" })).toBeVisible();
  await page.getByRole("tab", { name: /Escenarios/ }).click();

  await expect(page.getByText("Bruto", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Deducciones", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nombre del escenario" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Duplicar" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Ver detalle de Agosto de 2026/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: /Ver detalle de Agosto de 2026/ })
    .click();

  await page
    .getByRole("button", { name: "Eliminar escenario de Agosto de 2026" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "¿Eliminar escenario?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("El escenario seleccionado");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).not.toBeVisible();

  await page
    .getByRole("button", { name: "Eliminar escenario de Agosto de 2026" })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Eliminar escenario" }).click();
  await expect(page.getByText("Todavía no guardaste escenarios")).toBeVisible();
});

test("merges an individual SAC into a monthly scenario", async ({ page }) => {
  await page.addInitScript(() => {
    const base = {
      period: "2026-06",
      seniority: 0,
      overtime50Hours: 0,
      overtime100Hours: 0,
      holidayHours: 0,
      commissions: 0,
      bonuses: 0,
      nonRemunerative: 0,
      sac: 0,
      unionMode: "rate",
      unionValue: 0,
      spouse: false,
      children: 0,
      otherDeductions: 0,
      ytd: { taxableIncome: 0, generalDeductions: 0, withheldTax: 0 },
    };
    localStorage.setItem(
      "salary-scenarios:v1",
      JSON.stringify([
        {
          ...base,
          id: "monthly",
          basicSalary: 2_000_000,
          sourcePaystubIds: ["monthly-file"],
          exchangeRate: { rate: 1400, date: "2026-06-30", source: "BCRA" },
        },
        {
          ...base,
          id: "sac",
          basicSalary: 0,
          sac: 500_000,
          scenarioType: "sac",
          sourcePaystubIds: ["sac-file"],
          exchangeRate: { rate: 1500, date: "2026-07-01", source: "BCRA" },
        },
      ]),
    );
  });
  await page.goto("./");
  await page.getByRole("tab", { name: "Escenarios · 2" }).click();
  await expect(
    page.getByRole("combobox", { name: "Filtrar escenarios por año" }),
  ).toContainText("Todos los años");
  await page
    .getByRole("combobox", { name: "Filtrar escenarios por año" })
    .click();
  await page.getByRole("option", { name: "2026" }).click();
  await page.getByRole("radio", { name: "SAC", exact: true }).click();
  await expect(page.getByText("1 de 2 escenarios")).toBeVisible();
  await expect(page.getByText("SAC individual")).toBeVisible();
  await page.getByRole("tab", { name: "Calculadora", exact: true }).click();
  await page.getByRole("tab", { name: "Escenarios · 2" }).click();
  await expect(
    page.getByRole("radio", { name: "SAC", exact: true }),
  ).toBeChecked();
  await expect(page.getByText("1 de 2 escenarios")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Escenarios · 2" }).click();
  await expect(
    page.getByRole("radio", { name: "SAC", exact: true }),
  ).toBeChecked();
  await expect(page.getByText("1 de 2 escenarios")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("salary-scenario-filters:v1") ?? "null",
        ),
      ),
    )
    .toEqual({ year: "2026", type: "sac" });
  await page.getByRole("radio", { name: "Todos", exact: true }).click();
  await page
    .getByRole("button", { name: /Ver detalle de Junio de 2026/ })
    .nth(1)
    .click();
  await page
    .getByRole("button", { name: "Unir con escenario mensual" })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Unir SAC con escenario mensual",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Escenario mensual" }),
  ).toContainText("Neto");
  await dialog.getByRole("button", { name: "Unir SAC", exact: true }).click();

  await expect(page.getByText("SAC individual")).toHaveCount(0);
  const scenarios = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("salary-scenarios:v1") ?? "[]"),
  );
  expect(scenarios).toHaveLength(1);
  expect(scenarios[0]).toMatchObject({
    id: "monthly",
    sac: 500_000,
    sourcePaystubIds: ["monthly-file", "sac-file"],
    exchangeRate: { rate: 1400, date: "2026-06-30", source: "BCRA" },
  });
  await page.getByRole("radio", { name: "SAC", exact: true }).click();
  await expect(page.getByText("1 de 1 escenarios")).toBeVisible();
  await expect(page.getByText("Incluye SAC", { exact: true })).toBeVisible();
});

test("filters vacation receipts and keeps the filter after reloading", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const base = {
      period: "2025-07",
      basicSalary: 0,
      seniority: 0,
      overtime50Hours: 0,
      overtime100Hours: 0,
      holidayHours: 0,
      commissions: 0,
      bonuses: 0,
      nonRemunerative: 24_509.21,
      reimbursements: 0,
      sac: 0,
      vacation: 628_444.09,
      unionMode: "fixed",
      unionValue: 16_323.81,
      spouse: false,
      children: 0,
      otherDeductions: 1,
      ytd: { taxableIncome: 0, generalDeductions: 0, withheldTax: 0 },
      sourcePaystubIds: ["vacation-paystub"],
    };
    localStorage.setItem(
      "salary-scenarios:v1",
      JSON.stringify([
        { ...base, id: "vacation", scenarioType: "vacation" },
        {
          ...base,
          id: "monthly",
          basicSalary: 1_000_000,
          vacation: 0,
          scenarioType: "salary",
        },
      ]),
    );
  });
  await page.goto("./");
  await page.getByRole("tab", { name: "Escenarios · 2" }).click();
  await page.getByRole("radio", { name: "Vacaciones", exact: true }).click();
  await expect(page.getByText("1 de 2 escenarios")).toBeVisible();
  await expect(
    page.getByText("Vacaciones", { exact: true }).last(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Escenarios · 2" }).click();
  await expect(
    page.getByRole("radio", { name: "Vacaciones", exact: true }),
  ).toBeChecked();
});

test("shows the official USD conversion and frozen salary history", async ({
  page,
}) => {
  await page.route(
    "**/estadisticas/v4.0/Monetarias/4?Limit=30",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: 200,
          results: [
            {
              idVariable: 4,
              detalle: [{ fecha: "2026-08-13", valor: 1460.5 }],
            },
          ],
        }),
      });
    },
  );
  await page.addInitScript(() => localStorage.clear());
  await page.goto("./");

  await expect(page.getByText("Neto equivalente en dólares")).toBeVisible();
  await expect(page.getByText(/Dólar oficial vendedor BCRA/)).toBeVisible();
  await expect(
    page.getByText(/Dólar oficial vendedor BCRA.*13\/08\/2026/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar escenario" }).click();
  await expect(page.getByRole("button", { name: "Guardado" })).toBeVisible();

  const savedRate = await page.evaluate(() => {
    const scenarios = JSON.parse(
      localStorage.getItem("salary-scenarios:v1") ?? "[]",
    );
    return scenarios[0]?.exchangeRate;
  });
  expect(savedRate).toEqual({
    rate: 1460.5,
    date: "2026-08-13",
    source: "BCRA",
    period: "2026-08",
    reference: "latest",
  });

  await page.getByRole("tab", { name: /Escenarios/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tu sueldo neto en el tiempo" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Los recibos guardados del mismo mes se suman. Las simulaciones manuales se promedian sólo cuando ese mes no tiene recibos.",
    ),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Dólares" }).click();
  await expect(page.locator('linearGradient[id="salary-fill"]')).toHaveCount(1);
  await page.locator("[data-chart] svg circle").first().hover();
  await expect(page.getByText("Primer período")).toBeVisible();
  await expect(
    page.getByText(
      "La serie usa la cotización congelada al guardar cada escenario.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Ver detalle de Agosto de 2026/ })
    .click();
  await expect(
    page.getByText(
      "Conversión calculada con la cotización disponible al guardar el escenario.",
    ),
  ).toBeVisible();
});

test("updates legacy scenarios with the historical month close", async ({
  page,
}) => {
  await page.route(
    "**/estadisticas/v4.0/Monetarias/4?Desde=*",
    async (route) => {
      expect(route.request().url()).toContain("Desde=2026-06-01");
      expect(route.request().url()).toContain("Hasta=2026-06-30");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: 200,
          results: [
            {
              idVariable: 4,
              detalle: [
                { fecha: "2026-06-29", valor: 1390 },
                { fecha: "2026-06-30", valor: 1400 },
              ],
            },
          ],
        }),
      });
    },
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "salary-scenarios:v1",
      JSON.stringify([
        {
          id: "legacy",
          period: "2026-06",
          basicSalary: 1_800_000,
          seniority: 0,
          overtime50Hours: 0,
          overtime100Hours: 0,
          holidayHours: 0,
          commissions: 0,
          bonuses: 0,
          nonRemunerative: 0,
          sac: 0,
          unionMode: "rate",
          unionValue: 0,
          spouse: false,
          children: 0,
          otherDeductions: 0,
          ytd: { taxableIncome: 0, generalDeductions: 0, withheldTax: 0 },
          exchangeRate: {
            rate: 1500,
            date: "2026-08-01",
            source: "BCRA",
          },
        },
      ]),
    );
  });

  await page.goto("./");
  await page.getByRole("tab", { name: "Escenarios · 1" }).click();
  await page
    .getByRole("button", { name: /Ver detalle de Junio de 2026/ })
    .click();
  await expect(
    page.getByText("Cotización de cierre del período."),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const scenarios = JSON.parse(
          localStorage.getItem("salary-scenarios:v1") ?? "[]",
        );
        return scenarios[0]?.exchangeRate;
      }),
    )
    .toMatchObject({
      rate: 1400,
      date: "2026-06-30",
      period: "2026-06",
      reference: "month-close",
    });
});

test("shows drag state and validates dropped files", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("tab", { name: "Revisar recibo" }).click();
  const dropzone = page.getByRole("region", {
    name: "Zona de carga de recibos PDF",
  });

  await dropzone.dispatchEvent("dragenter");
  await expect(page.getByText("Soltá los PDF para empezar")).toBeVisible();
  await dropzone.dispatchEvent("dragleave");
  await expect(page.getByText("Arrastrá tus recibos acá")).toBeVisible();

  await page.getByLabel("Seleccionar recibos de sueldo en PDF").setInputFiles({
    name: "recibo-invalido.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos leer el archivo" }),
  ).toContainText("Usá archivos PDF de hasta 10 MB.");
});

test("classifies, excludes and persists receipt concepts", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Covered once in the desktop flow",
  );
  await page.goto("./");
  const reviewTab = page.getByRole("tab", { name: "Revisar recibo" });
  await expect
    .poll(() =>
      reviewTab.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
  await reviewTab.click();
  await expect(reviewTab).toHaveAttribute("data-state", "active");
  await page.getByLabel("Seleccionar recibos de sueldo en PDF").setInputFiles({
    name: "recibo-agosto-2026.pdf",
    mimeType: "application/pdf",
    buffer: paystubPdf(),
  });

  await expect(page.getByText("SUELDO BASICO", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Clasificación pendiente de revisión"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Naturaleza de SUELDO BASICO" }),
  ).toHaveText("Sueldo básico");
  await page
    .getByRole("combobox", { name: "Naturaleza de SUELDO BASICO" })
    .click();
  const natureList = page.getByRole("listbox");
  await expect(natureList).toBeVisible();
  expect((await natureList.boundingBox())?.height).toBeLessThanOrEqual(288);
  expect(
    await natureList
      .locator("[data-radix-select-viewport]")
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page
    .getByRole("checkbox", {
      name: "Incluir PREMIO PRODUCTIVIDAD en el cálculo",
    })
    .click();
  await page
    .getByRole("combobox", { name: "Tratamiento de SUELDO BASICO" })
    .click();
  await page.getByRole("option", { name: "No remunerativo" }).click();
  await expect(
    page.getByText("No remunerativos", { exact: true }).locator(".."),
  ).toContainText("1.000.000");

  await expect(
    page.getByRole("button", { name: "Usar valores detectados" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Confirmar que revisé las diferencias",
    })
    .click();
  await page.getByRole("button", { name: "Usar valores detectados" }).click();
  await expect(page.getByRole("tab", { name: "Escenarios · 1" })).toBeVisible();
  await expect(page.locator('[data-view-panel="saved"]')).toHaveClass(
    /view-panel-enter/,
  );
  const chartHeading = page.getByRole("heading", {
    name: "Tu sueldo neto en el tiempo",
  });
  await expect(chartHeading).toBeVisible();
  await expect
    .poll(async () => {
      const box = await chartHeading.boundingBox();
      return box != null && box.y >= 0 && box.y < 1080;
    })
    .toBe(true);
  await page
    .getByRole("button", { name: /Ver detalle de Agosto de 2026/ })
    .click();
  await expect(page.getByText("4 conceptos del recibo")).toBeVisible();
  await expect(page.getByText("PREMIO PRODUCTIVIDAD")).toBeVisible();
  await expect(
    page.getByText(/Bono \/ premio · Remunerativo · Excluido/),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("salary-scenarios:v1") ?? "[]"),
  );
  expect(saved[0].sourceConcepts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "SUELDO BASICO",
        nature: "basic-salary",
        treatment: "non-remunerative",
      }),
      expect.objectContaining({
        name: "PREMIO PRODUCTIVIDAD",
        selected: false,
      }),
    ]),
  );
  expect(saved[0].sourceReconciliation).toMatchObject({
    status: "mismatch",
    confirmed: true,
  });
});

test("imports a mixed SAC without leaking the calculator demo salary", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Covered once in the desktop flow",
  );
  await page.goto("./");
  const reviewTab = page.getByRole("tab", { name: "Revisar recibo" });
  await expect
    .poll(() =>
      reviewTab.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
  await reviewTab.click();
  await expect(reviewTab).toHaveAttribute("data-state", "active");
  await page.getByLabel("Seleccionar recibos de sueldo en PDF").setInputFiles({
    name: "sac-junio-2024.pdf",
    mimeType: "application/pdf",
    buffer: mixedSacPaystubPdf(),
  });

  await expect(page.getByText("S.A.C.", { exact: true })).toBeVisible();
  await expect(page.getByText("Revisá Jubilación")).toHaveCount(0);
  await expect(page.getByText("Revisá Obra social")).toHaveCount(0);
  await expect(page.getByText("Revisá PAMI")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Usar valores detectados" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Usar valores detectados" }).click();
  await expect(page.getByRole("tab", { name: "Escenarios · 1" })).toBeVisible();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("salary-scenarios:v1") ?? "[]"),
  );
  expect(saved[0]).toMatchObject({
    period: "2024-06",
    basicSalary: 0,
    sac: 530_024,
    nonRemunerative: 47_414,
    scenarioType: "sac",
  });
});
