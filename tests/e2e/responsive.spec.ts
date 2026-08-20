import { expect, test, type Page } from "@playwright/test";

const viewports = [
  [320, 568],
  [360, 800],
  [375, 812],
  [390, 844],
  [412, 915],
  [600, 960],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [3440, 1440],
] as const;

async function expectNoPageOverflow(page: Page, context: string) {
  const report = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const hasClippingAncestor = (element: Element) => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const overflow = getComputedStyle(parent).overflowX;
        if (
          overflow === "hidden" ||
          overflow === "clip" ||
          overflow === "auto"
        ) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    };

    const offenders = [...document.body.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        if (element.closest("[data-overflow-allow]")) return false;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || hasClippingAncestor(element))
          return false;
        return rect.left < -1 || rect.right > viewportWidth + 1;
      })
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName,
        text: element.textContent?.trim().slice(0, 60),
        className: element.className?.toString().slice(0, 100),
      }));

    return {
      html: [document.documentElement.scrollWidth, viewportWidth],
      body: [document.body.scrollWidth, viewportWidth],
      offenders,
    };
  });

  expect(report, context).toEqual({
    html: [report.html[1], report.html[1]],
    body: [report.body[1], report.body[1]],
    offenders: [],
  });
}

test("all responsive tiers remain inside the viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "notebook", "The matrix runs once.");
  test.setTimeout(120_000);

  for (const [width, height] of viewports) {
    const label = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.goto("./");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expectNoPageOverflow(page, `${label}: calculator dark`);

    await page.getByRole("button", { name: "Seleccionar período" }).click();
    await expect(page.getByRole("dialog")).toBeInViewport();
    await expectNoPageOverflow(page, `${label}: period picker open`);
    await page.keyboard.press("Escape");

    await page
      .getByRole("spinbutton", { name: "Sueldo básico", exact: true })
      .fill("4000000");
    await page
      .getByRole("button", { name: /Tu sueldo podría pagar Ganancias/ })
      .click();
    await page.getByRole("radio", { name: "Neto → bruto" }).click();
    await page
      .getByRole("button", { name: /Calculado con reglas de Agosto de 2026/ })
      .click();
    await expect(
      page.getByRole("button", { name: "Más información sobre Período" }),
    ).toHaveCount(0);

    await page
      .getByRole("checkbox", { name: "Agregar cuota sindical" })
      .click();
    await page
      .getByRole("spinbutton", { name: "Porcentaje sindical" })
      .fill("2");
    await expectNoPageOverflow(page, `${label}: union option open`);

    const saveButton = page.getByRole("button", {
      name: "Guardar escenario",
    });
    await saveButton.click();
    await expect(
      page.getByRole("button", { name: "Guardando…" }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Guardado" })).toBeVisible();
    await page.getByRole("tab", { name: /Escenarios/ }).click();
    await expect(page.locator("p").filter({ hasText: /^Neto$/ })).toBeVisible();
    await expectNoPageOverflow(page, `${label}: saved scenarios`);

    await page.getByRole("tab", { name: "Revisar recibo" }).click();
    await page
      .getByLabel("Seleccionar recibos de sueldo en PDF")
      .setInputFiles({
        name: "recibo-invalido.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not a pdf"),
      });
    await expect(page.getByText("No pudimos leer el archivo")).toBeVisible();
    await expectNoPageOverflow(page, `${label}: receipt error`);

    await page
      .getByRole("button", { name: "Cambiar tema claro u oscuro" })
      .click();
    await expect(page.locator("html")).toHaveClass(/light/);
    await expectNoPageOverflow(page, `${label}: receipt light`);
  }
});

test("reports local storage failures without adding a scenario", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    localStorage.clear();
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });

  await page.getByRole("button", { name: "Guardar escenario" }).click();
  await expect(page.getByRole("button", { name: "Guardando…" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "No se pudo guardar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Escenarios", exact: true }),
  ).toBeVisible();
});
