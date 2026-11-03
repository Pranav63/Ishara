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
  await page.locator(".request-examples summary").click();
  await page.getByRole("button", { name: "Hospital", exact: true }).click();
  await expect(page.getByLabel("Your appointment message")).toHaveValue(/Rashid Hospital/);
  await page.locator(".optional-name summary").click();
  await page.getByLabel("Your name", { exact: true }).fill("Amal");
  const submitted = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/requests");
  await page.getByRole("button", { name: "Review details", exact: true }).click();
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

test("new request shows the task, keeps extras collapsed, and Cancel preserves the draft", async ({ page }) => {
  await page.route("**/api/places", route => route.fulfill({ json: { "Oud Metha": [25.24, 55.31] } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Coordinator", exact: true }).click();
  await expect(page.locator('.progress [aria-current="step"]')).toHaveText("Done");
  await expect(page.locator(".map-full").getByText("Rashid Hospital", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await expect(page.locator(".progress")).toBeHidden();
  await expect(page.locator(".map-full").getByText("Rashid Hospital", { exact: true })).toBeHidden();
  const sheet = page.locator(".sheet");
  await expect(sheet.getByRole("heading", { name: "New request", exact: true })).toBeVisible();
  await expect(sheet.getByRole("textbox")).toHaveCount(1);
  await expect(sheet.locator(".agent-copy, .companion-choices")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Hospital", exact: true })).toBeHidden();
  await expect(sheet.getByLabel("Your name", { exact: true })).toBeHidden();
  await expect(sheet.locator(".request-privacy p")).toBeHidden();
  await expect(sheet.getByRole("button", { name: "Review details", exact: true })).toBeDisabled();
  await expect(sheet.getByLabel("Your appointment message")).toBeFocused();
  await sheet.getByLabel("Your appointment message").fill("My appointment draft");
  await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sheet.getByRole("heading", { name: "Test resident", exact: true })).toBeVisible();
  await expect(page.locator('.progress [aria-current="step"]')).toHaveText("Done");
  await expect(page.locator(".map-full").getByText("Rashid Hospital", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New request", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await expect(sheet.getByLabel("Your appointment message")).toHaveValue("My appointment draft");
});

test("a new submission uses its own status while the latest snapshot catches up", async ({ page }) => {
  const created = { ...request, id: "new-request", token: "new-token", requester_name: "New resident", status: "reviewing" };
  let latest = request;
  await page.route("**/api/requests/latest", route => route.fulfill({ json: latest }));
  await page.route("**/api/requests", route => route.fulfill({ json: created }));
  await page.goto("/");
  await page.getByRole("button", { name: "Coordinator", exact: true }).click();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByLabel("Your appointment message").fill("Appointment at Rashid Hospital, 12 November at 10:30 AM.");
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/requests/latest");
  await page.getByRole("button", { name: "Review details", exact: true }).click();
  await refreshed;
  await expect(page.locator('.progress [aria-current="step"]')).toHaveText("Review");
  await expect(page.getByRole("heading", { name: "New resident", exact: true })).toBeVisible();
  latest = { ...created, status: "dispatching" };
  await expect(page.locator('.progress [aria-current="step"]')).toHaveText("Matching", { timeout: 8000 });
});

test("resetting a collapsed conversation leaves the new request form editable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Coordinator", exact: true }).click();
  await page.getByRole("button", { name: "Collapse conversation", exact: true }).click();
  await page.route("**/api/requests/latest", route => route.fulfill({ json: null }));
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Your appointment message")).toBeVisible();
});

for (const lang of ["en", "ar"]) for (const theme of ["light", "dark"]) {
  test(`new request stays usable with enlarged text (${lang}, ${theme})`, async ({ page }) => {
    await page.addInitScript(prefs => localStorage.setItem("ishara.prefs", JSON.stringify(prefs)), { lang, theme, size: 2 });
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: lang === "ar" ? "المنسق" : "Coordinator", exact: true }).click();
    await page.getByRole("button", { name: lang === "ar" ? "طلب جديد" : "New request", exact: true }).click();
    await page.getByLabel(lang === "ar" ? "رسالة موعدك" : "Your appointment message").fill("Appointment at Rashid Hospital, 12 November at 10:30 AM.");
    const review = page.getByRole("button", { name: lang === "ar" ? "مراجعة التفاصيل" : "Review details", exact: true });
    await expect(review).toBeEnabled();
    await review.scrollIntoViewIfNeeded();
    const privacy = page.locator(".request-privacy summary");
    await privacy.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".request-privacy p")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const rect = await review.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    const settings = lang === "ar" ? "العرض وإمكانية الوصول" : "Display & accessibility";
    await page.getByRole("button", { name: settings, exact: true }).click();
    await expect(page.getByRole("dialog", { name: settings, exact: true })).toHaveCSS("opacity", "1");
    const popup = await page.getByRole("dialog", { name: settings, exact: true }).boundingBox();
    expect(popup!.x).toBeGreaterThanOrEqual(0);
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(320);
  });
}

test("companion choice lives in display settings and text-first mode keeps entry simple", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Coordinator", exact: true }).click();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByRole("button", { name: "Display & accessibility", exact: true }).click();
  const bounds = await page.getByRole("dialog", { name: "Display & accessibility", exact: true }).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect.poll(async () => {
    const rect = await page.getByRole("dialog", { name: "Display & accessibility", exact: true }).boundingBox();
    return rect!.x >= 0 && rect!.x + rect!.width <= 390;
  }).toBe(true);
  await page.getByRole("button", { name: "Pearl", exact: true }).click();
  await expect(page.locator(".sheet-head .companion-pearl")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Coordinator", exact: true }).click();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await expect(page.locator(".sheet-head .companion-pearl")).toBeVisible();
  await page.getByRole("button", { name: "Display & accessibility", exact: true }).click();
  await page.getByLabel("Text-first mode", { exact: true }).check();
  await expect(page.locator(".sheet-head .companion-touch")).toHaveCount(0);
  await expect(page.getByLabel("Your appointment message")).toBeVisible();
});
