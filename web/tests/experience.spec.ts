import { expect, test, type Page } from "@playwright/test";

const request = {
  id: "layout-test", token: "preview-token", now: 1793700000, created_at: 1793700000,
  status: "completed", requester_name: "Test resident", message: "An appointment message.",
  appointment: { entity: "Rashid Hospital", area: "Oud Metha", starts_at: 1794479400, duration_min: 60, domain: "medical", language: "UAE Sign Language", assumed: [], source: "rules" },
  assigned: null, confirmation: null, summary: null, arrival: null, offers: [], events: [],
  confirmation_video_url: null, remote_interpreter_url: null,
};

async function mockService(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/operator/session" ? { authenticated: true, demo: true }
      : path === "/api/config" ? { demo: true, operator_auth_required: false, llm: "Rules only", languages: ["UAE Sign Language"], domains: ["medical"] }
      : path === "/api/metrics" ? { requests: 1, filled: 1, median_confirm_s: 2, replans: 0 }
      : path === "/api/places" ? {}
      : path === "/api/interpreters" || path === "/api/escalations" ? []
      : request;
    if (path === "/api/stream") return route.fulfill({ contentType: "text/event-stream", body: ": test\n\n" });
    return route.fulfill({ json: data });
  });
}

test.beforeEach(async ({ page }) => { await mockService(page); });

for (const lang of ["en", "ar"]) for (const size of [0, 2]) {
  test(`coordinator header reflows without collisions (${lang}, text size ${size})`, async ({ page }) => {
    await page.addInitScript(prefs => localStorage.setItem("ishara.prefs", JSON.stringify(prefs)), { lang, size, theme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: lang === "ar" ? "المنسق" : "Coordinator", exact: true }).click();
    await expect(page.locator(".progress")).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1181, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => {
        const header = document.querySelector(".header")!.getBoundingClientRect();
        return document.querySelector(".sheet")!.getBoundingClientRect().top >= header.bottom + 6;
      })).toBe(true);
      const collisions = await page.locator(".header").evaluate(header => {
        // Measure the content itself; a shrinking parent can hide overflowing children.
        const items = [...header.querySelectorAll("a, button, .p-label")].filter(el => el.getClientRects().length).map(el => ({ label: el.textContent || el.getAttribute("aria-label"), rect: el.getBoundingClientRect() }));
        const errors: string[] = [];
        for (let i = 0; i < items.length; i++) {
          const a = items[i];
          if (a.rect.left < 0 || a.rect.right > innerWidth) errors.push(`Clipped: ${a.label}`);
          for (const b of items.slice(i + 1)) {
            if (Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 1 && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 1) errors.push(`${a.label} overlaps ${b.label}`);
          }
        }
        return errors;
      });
      expect(collisions, `${width}px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflow`).toBe(true);
    }
  });
}

test("landing start action focuses the message and an example can be reviewed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Start a request", exact: true }).click();
  await expect(page.getByLabel("Your appointment message")).toBeFocused();
  await page.getByRole("button", { name: "Hospital", exact: true }).click();
  await expect(page.getByLabel("Your appointment message")).toHaveValue(/Rashid Hospital/);
  await page.locator(".optional-name summary").click();
  await page.getByLabel("Your name", { exact: true }).fill("Amal");
  const submitted = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/requests");
  await page.getByRole("button", { name: "Review my appointment", exact: true }).click();
  expect((await submitted).postDataJSON()).toMatchObject({ requester_name: "Amal", text: expect.stringContaining("Rashid Hospital") });
  await expect(page).toHaveURL(/\/r\/preview-token$/);
});

test("Arabic landing reflows at 320px and help works with a keyboard", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ishara.prefs", JSON.stringify({ lang: "ar", size: 2, theme: "light" })));
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const question = page.locator(".resident-questions summary").first();
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".resident-questions details").first()).toHaveAttribute("open", "");
  await expect(page.locator(".prototype-note")).toBeVisible();
});
