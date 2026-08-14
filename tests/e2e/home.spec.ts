import { expect, test } from "@playwright/test";

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
}) => {
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
  await expect(page.getByRole("button", { name: "sep." })).toBeDisabled();
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
  await page.getByText("Sueldo básico", { exact: true }).hover({ force: true });
  await expect(page.getByRole("tooltip")).toContainText(
    "Importe mensual bruto",
  );

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

  await expect(page.getByText("v1.0.1")).toBeVisible();
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

  await expect(page.getByText("Bruto", { exact: true })).toBeVisible();
  await expect(page.getByText("Deducciones", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nombre del escenario" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Duplicar" })).toHaveCount(0);
  await expect(page.getByText("Neto estimado")).toHaveCount(1);

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
  await expect(page.getByText("Neto estimado")).toHaveCount(0);
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
      "Si guardaste más de un escenario para el mismo mes, mostramos el promedio.",
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
