import { expect, test, type Page } from "@playwright/test";
import type { Escalation } from "../lib/api";

// Exercise MapLibre workers with software WebGL on headless CI machines.
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

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
    const data = path === "/api/requests" && route.request().method() === "GET" ? [request] : path === "/api/operator/session" ? { authenticated: true, demo: true }
      : path === "/api/config" ? { demo: true, operator_auth_required: false, llm: "Rules only", languages: ["UAE Sign Language"], domains: ["medical"] }
      : path === "/api/metrics" ? { requests: 1, filled: 1, median_confirm_s: 2, replans: 0 }
      : path === "/api/places" ? {}
      : path === "/api/parse" ? { ...request.appointment, hidden: 1 }
      : path === "/api/interpreters" || path === "/api/escalations" ? []
      : request;
    if (path === "/api/stream") return route.fulfill({ contentType: "text/event-stream", body: ": test\n\n" });
    return route.fulfill({ json: data });
  });
}

async function openMenu(page: Page, lang = "en") {
  await page.getByRole("button", { name: lang === "ar" ? "القائمة" : "Menu", exact: true }).click();
}

async function coordinatorView(page: Page, lang = "en") {
  const coordinator = page.getByRole("button", { name: lang === "ar" ? "المنسق" : "Coordinator", exact: true });
  await coordinator.click();
  await expect(coordinator).toHaveAttribute("aria-pressed", "true");
}

async function openSettings(page: Page, lang = "en") {
  await openMenu(page, lang);
  await page.getByRole("button", { name: lang === "ar" ? "العرض وإمكانية الوصول" : "Display & accessibility", exact: true }).click();
}

test.beforeEach(async ({ page }) => { await mockService(page); });

test("requester history retains private links across new requests and reloads", async ({ page }) => {
  const earlier = { ...request, id: "earlier", token: "earlier-token", status: "dispatching", appointment: { ...request.appointment, entity: "Dubai school" } };
  await page.route("**/api/r/earlier-token", route => route.fulfill({ json: earlier }));
  await page.goto("/r/earlier-token");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ishara.requests") ?? "[]"))).toEqual(["earlier-token"]);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByLabel("Your appointment message", { exact: true }).fill("Appointment at Rashid Hospital, 12 November at 10:30 AM");
  await page.getByRole("button", { name: "Review appointment", exact: true }).click();
  await expect(page).toHaveURL(/\/r\/preview-token$/);
  await page.reload();
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Your requests", exact: true });
  await expect(history.getByRole("link")).toHaveCount(2);
  await expect(history.getByRole("link", { name: /Dubai school/ })).toHaveAttribute("href", "/r/earlier-token");
  await expect(history).toContainText("Finding an interpreter");
  await history.getByRole("button", { name: "Remove Dubai school from this browser", exact: true }).click();
  await expect(history.getByRole("link")).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ishara.requests")!))).toEqual(["preview-token"]);
});

test("blocked browser storage never claims a private link was saved or removed", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ishara.requests", JSON.stringify(["preview-token"]));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "ishara.requests" || key === "ishara.requests.archived") throw new DOMException("Storage blocked", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/r/preview-token");
  await expect(page.locator("main").getByRole("alert")).toContainText("could not save your link");
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Your requests", exact: true });
  await history.getByRole("button", { name: "Archive Rashid Hospital", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("Could not save the archive change");
  await history.getByRole("button", { name: "Remove Rashid Hospital from this browser", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("could not be removed");
  await expect(history.getByRole("link")).toHaveCount(1);
});

test("requester can archive, filter, restore and remove saved requests", async ({ page }) => {
  const earlier = { ...request, id: "earlier", token: "earlier-token", status: "dispatching", appointment: { ...request.appointment, entity: "Dubai school", starts_at: Date.parse("2026-11-16T06:30:00Z") / 1000 } };
  await page.addInitScript(() => localStorage.setItem("ishara.requests", JSON.stringify(["preview-token", "earlier-token"])));
  await page.route("**/api/r/earlier-token", route => route.fulfill({ json: earlier }));
  await page.goto("/");
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  let history = page.getByRole("dialog", { name: "Your requests", exact: true });
  await expect(history.getByRole("link")).toHaveCount(2);
  await history.getByRole("button", { name: "Current", exact: true }).click();
  await expect(history.getByRole("link")).toHaveCount(2);
  await history.getByLabel("Search requests", { exact: true }).fill("school");
  await history.getByLabel("Request status", { exact: true }).selectOption("dispatching");
  await history.getByRole("button", { name: "Filters", exact: true }).click();
  await history.getByLabel("From", { exact: true }).fill("2026-11-16");
  await history.getByLabel("To", { exact: true }).fill("2026-11-16");
  await history.getByLabel("Sort by", { exact: true }).selectOption("soonest");
  await expect(history.getByRole("link")).toHaveCount(1);
  await expect(history.getByRole("link")).toContainText("Dubai school");
  await history.getByRole("button", { name: "Archive Dubai school", exact: true }).click();
  await expect(history).toContainText("Matching and support continue");
  await expect(history.getByRole("button", { name: "Current", exact: true })).toBeFocused();
  await expect(history.getByRole("link")).toHaveCount(0);
  await history.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(history.getByRole("link")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  history = page.getByRole("dialog", { name: "Your requests", exact: true });
  await expect(history.getByRole("link")).toHaveCount(1);
  await history.getByRole("button", { name: "Archived", exact: true }).click();
  await history.getByRole("button", { name: "Restore Dubai school", exact: true }).click();
  await expect(history.getByRole("link")).toHaveCount(0);
  await history.getByRole("button", { name: "Current", exact: true }).click();
  await expect(history.getByRole("link")).toHaveCount(2);
  await history.getByLabel("Request status", { exact: true }).selectOption("escalated");
  await expect(history).toContainText("No requests match these filters");
  await history.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(history.getByRole("link")).toHaveCount(2);
});

test("coordinator archive failures retain work and successful archives can be restored", async ({ page }) => {
  let archived = false;
  let fail = true;
  let saves = 0;
  await page.route("**/api/requests*", route => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/requests") return route.fallback();
    return route.fulfill({ json: (url.searchParams.get("archived") === "true") === archived ? [request] : [] });
  });
  await page.route("**/api/requests/layout-test/archive", route => {
    saves++;
    if (fail) return route.fulfill({ status: 503, json: { detail: "Archive unavailable" } });
    archived = route.request().postDataJSON().archived;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await coordinatorView(page);
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Recent requests", exact: true });
  await history.getByRole("button", { name: "Archive Rashid Hospital", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("Archive unavailable");
  await expect(history.locator(".history-request")).toHaveCount(1);
  fail = false;
  await history.getByRole("button", { name: "Archive Rashid Hospital", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(history).toContainText("Request archived");
  expect(saves).toBe(2);
  await expect(history.locator(".history-request")).toHaveCount(0);
  await history.getByRole("button", { name: "Archived", exact: true }).click();
  await history.getByRole("button", { name: "Restore Rashid Hospital", exact: true }).click();
  await expect(history.locator(".history-request")).toHaveCount(0);
  await history.getByRole("button", { name: "Current", exact: true }).click();
  await expect(history.locator(".history-request")).toHaveCount(1);
  await history.getByRole("button", { name: "Filters", exact: true }).click();
  await history.getByLabel("Search requests", { exact: true }).fill("Test resident");
  await history.getByLabel("Request status", { exact: true }).selectOption("completed");
  await history.getByLabel("From", { exact: true }).fill("2026-11-12");
  await history.getByLabel("To", { exact: true }).fill("2026-11-16");
  const response = page.waitForRequest(r => new URL(r.url()).searchParams.get("sort") === "soonest");
  await history.getByLabel("Sort by", { exact: true }).selectOption("soonest");
  const query = new URL((await response).url()).searchParams;
  expect(Object.fromEntries(query)).toEqual({ q: "Test resident", status: "completed", date_from: "2026-11-12", date_to: "2026-11-16", sort: "soonest" });
});

for (const lang of ["en", "ar"]) test(`request history filters fit a narrow viewport with large text (${lang})`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(lang => {
    localStorage.setItem("ishara.prefs", JSON.stringify({ lang, theme: "dark", size: 2 }));
    localStorage.setItem("ishara.requests", JSON.stringify(["preview-token"]));
  }, lang);
  await page.goto("/");
  await page.getByRole("button", { name: lang === "ar" ? "الطلبات" : "Requests", exact: true }).click();
  const history = page.getByRole("dialog");
  await history.getByRole("button", { name: lang === "ar" ? "عوامل التصفية" : "Filters", exact: true }).click();
  await expect(history.locator(".history-request")).toHaveCount(1);
  await expect.poll(() => history.evaluate(el => [...el.querySelectorAll("input, select, button")].filter(x => x.getClientRects().length).filter(x => { const r = x.getBoundingClientRect(), b = el.getBoundingClientRect(); return r.left < b.left || r.right > b.right; }).map(x => x.getAttribute("aria-label") || x.textContent))).toEqual([]);
  await history.getByRole("button", { name: lang === "ar" ? "أرشفة Rashid Hospital" : "Archive Rashid Hospital", exact: true }).click();
  await expect(history).toContainText(lang === "ar" ? "تمت أرشفة الطلب" : "Request archived");
});

test("requester bulk archive uses only shown rows and cancel changes nothing", async ({ page }) => {
  const school = { ...request, id: "school", token: "school-token", appointment: { ...request.appointment, entity: "Dubai school" } };
  await page.addInitScript(() => localStorage.setItem("ishara.requests", JSON.stringify(["preview-token", "school-token"])));
  await page.route("**/api/r/school-token", route => route.fulfill({ json: school }));
  await page.goto("/");
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Your requests", exact: true });
  const icon = history.getByRole("button", { name: "Archive Rashid Hospital", exact: true });
  await expect(icon).toHaveText("");
  await expect(icon).toHaveAttribute("title", "Archive request");
  await history.getByRole("button", { name: "Archive all shown", exact: true }).click();
  let confirm = page.getByRole("dialog", { name: "Archive 2 requests?", exact: true });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(history.getByRole("link")).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem("ishara.requests.archived"))).toBeNull();
  await history.getByLabel("Search requests", { exact: true }).fill("school");
  await expect(history.getByRole("link")).toHaveCount(1);
  await history.getByRole("button", { name: "Archive all shown", exact: true }).click();
  confirm = page.getByRole("dialog", { name: "Archive 1 request?", exact: true });
  await confirm.getByRole("button", { name: "Archive requests", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(history.getByRole("link")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ishara.requests.archived")!))).toEqual(["school-token"]);
  await history.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(history.getByRole("link")).toHaveCount(1);
  await expect(history.getByRole("link")).toContainText("Rashid Hospital");
});

test("coordinator bulk archive retains the selection on failure and submits once", async ({ page }) => {
  const second = { ...request, id: "second", requester_name: "Another resident" };
  let archived = false;
  let fail = true;
  let submissions = 0;
  await page.route("**/api/requests", route => route.fulfill({ json: archived ? [] : [request, second] }));
  await page.route("**/api/requests/archive", route => {
    submissions++;
    expect(route.request().postDataJSON()).toEqual({ request_ids: [request.id, second.id] });
    if (fail) return route.fulfill({ status: 503, json: { detail: "Archive unavailable" } });
    archived = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await coordinatorView(page);
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Recent requests", exact: true });
  await history.getByRole("button", { name: "Archive all shown", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Archive 2 requests?", exact: true });
  await confirm.getByRole("button", { name: "Archive requests", exact: true }).click();
  await expect(confirm.getByRole("alert")).toContainText("Archive unavailable");
  expect(archived).toBe(false);
  fail = false;
  await confirm.getByRole("button", { name: "Archive requests", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(confirm).toBeHidden();
  await expect(history.locator(".history-request")).toHaveCount(0);
  await expect(history).toContainText("2 requests archived");
  expect(submissions).toBe(2);
});

test("production coordinator shows read-only interpreter responses", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { demo: false, operator_auth_required: true } }));
  await page.route("**/api/requests/latest", route => route.fulfill({ json: { ...request, status: "dispatching", offers: [{ id: 1, interpreter_id: "one", status: "pending", expires_at: request.now + 300, sent_at: request.now, wave: 1, reasons: ["certified"] }] } }));
  await page.route("**/api/interpreters", route => route.fulfill({ json: [{ id: "one", name: "Mariam A.", token: "private-invite" }] }));
  await page.goto("/");
  await coordinatorView(page);
  await expect(page.locator(".dock")).toContainText("Awaiting interpreter response");
  await expect(page.locator(".dock").getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
  await expect(page.locator(".dock").getByRole("button", { name: "Decline", exact: true })).toHaveCount(0);
});

test("coordinator can resume older pending work and polling keeps that selection", async ({ page }) => {
  await page.clock.install();
  const earlier = { ...request, id: "earlier", requester_name: "Earlier resident", status: "reviewing" };
  await page.route("**/api/requests", route => route.fulfill({ json: [request, earlier] }));
  await page.route("**/api/requests/earlier", route => route.fulfill({ json: earlier }));
  await page.goto("/");
  await coordinatorView(page);
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Recent requests", exact: true });
  await history.getByRole("button", { name: /Needs your review/ }).click();
  await expect(history).toBeHidden();
  await expect(page.locator(".sheet-head h2")).toHaveText("Earlier resident");
  await page.clock.fastForward(4000);
  await expect(page.locator(".sheet-head h2")).toHaveText("Earlier resident");
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await expect(page.locator(".request-form")).toContainText("Your previous request stays active");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".sheet-head h2")).toHaveText("Earlier resident");
});

test("repeated form submissions send one create request and a failed draft survives", async ({ page }) => {
  let submissions = 0;
  let release!: () => void;
  const response = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/requests", async route => {
    submissions++;
    await response;
    await route.fulfill({ status: 503, json: { detail: "Please retry" } });
  });
  await page.goto("/");
  await page.getByLabel("Your appointment message", { exact: true }).fill("Appointment at Rashid Hospital, 12 November at 10:30 AM");
  await expect(page.getByRole("button", { name: "Review appointment", exact: true })).toBeEnabled();
  await page.locator(".request-form").evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect.poll(() => submissions).toBe(1);
  release();
  await expect(page.locator(".request-form").getByRole("alert")).toHaveText("Please retry");
  await expect(page.getByLabel("Your appointment message", { exact: true })).toHaveValue(/Rashid Hospital/);
  expect(submissions).toBe(1);
});

test("offer explanations stay in the viewport and simultaneous demo actions send one response", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  const offers = [1, 2].map(id => ({ id, request_id: request.id, interpreter_id: String(id), status: "pending", role: "primary", wave: 1, sent_at: request.now, expires_at: request.now + 300, travel_min: 8, reasons: ["8 min away", "certified", "medical experience"] }));
  let responded = false;
  let submissions = 0;
  let release!: () => void;
  const response = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/requests/latest", route => route.fulfill({ json: { ...request, status: responded ? "confirmed" : "dispatching", offers: responded ? [] : offers } }));
  await page.route("**/api/interpreters", route => route.fulfill({ json: [{ id: "1", name: "Mariam A.", token: "one" }, { id: "2", name: "Omar K.", token: "two" }] }));
  await page.route("**/offers/*/accept", async route => { submissions++; await response; responded = true; await route.fulfill({ json: { ok: true } }); });
  await page.goto("/");
  await coordinatorView(page);
  await page.getByRole("button", { name: "Why Mariam A.", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "Why Mariam A.", exact: true });
  await expect(detail).toContainText("Medical experience");
  const bounds = (await detail.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(16);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(484);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Why Mariam A.", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Accept", exact: true }).first()).toBeEnabled();
  await page.getByRole("button", { name: "Accept", exact: true }).evaluateAll(buttons => buttons.forEach(button => (button as HTMLButtonElement).click()));
  await expect.poll(() => submissions).toBe(1);
  release();
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
  expect(submissions).toBe(1);
});

for (const lang of ["en", "ar"]) for (const size of [0, 2]) {
  test(`coordinator header reflows without collisions (${lang}, text size ${size})`, async ({ page }) => {
    await page.addInitScript(prefs => localStorage.setItem("ishara.prefs", JSON.stringify(prefs)), { lang, size, theme: "dark" });
    await page.goto("/");
    await coordinatorView(page, lang);
    await expect(page.locator(".progress")).toBeVisible();
    await expect(page.locator(".header-main").getByRole("button")).toHaveCount(5);
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
      if (size === 0) await expect.poll(async () => (await page.locator(".header-main").boundingBox())!.height, { message: `${width}px compact toolbar` }).toBeLessThanOrEqual(width <= 899 ? 104 : 56);
    }
  });
}

test("landing starts with the message form and an example can be reviewed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start a request", exact: true })).toHaveCount(0);
  await page.getByLabel("Your appointment message").click();
  await expect(page.getByLabel("Your appointment message")).toBeFocused();
  await page.getByRole("button", { name: "Hospital", exact: true }).click();
  await expect(page.getByLabel("Your appointment message")).toBeFocused();
  await expect(page.getByLabel("Your appointment message")).toHaveValue(/Rashid Hospital/);
  await page.locator(".optional-name summary").click();
  await page.getByLabel("Your name", { exact: true }).fill("Amal");
  const submitted = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/requests");
  await page.getByRole("button", { name: "Review appointment", exact: true }).click();
  expect((await submitted).postDataJSON()).toMatchObject({ requester_name: "Amal", text: expect.stringContaining("Rashid Hospital") });
  await expect(page).toHaveURL(/\/r\/preview-token$/);
});

test("Arabic landing reflows at 320px and help works with a keyboard", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ishara.prefs", JSON.stringify({ lang: "ar", size: 2, theme: "light" })));
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".resident-help, .resident-questions")).toHaveCount(0);
  await openMenu(page, "ar");
  await page.getByRole("button", { name: "كيف تعمل إشارة", exact: true }).focus();
  await page.keyboard.press("Enter");
  const question = page.getByText("من يستخدم عرض المنسق؟", { exact: true });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".how details", { hasText: "من يستخدم عرض المنسق؟" })).toHaveAttribute("open", "");
  await expect(page.locator(".prototype-note")).toBeVisible();
});

for (const lang of ["en", "ar"]) {
  test(`landing fits desktop and phone screens (${lang})`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem("ishara.prefs", JSON.stringify({ lang, theme: "light" })), lang);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[390, 844], [1280, 720], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => page.evaluate(() => document.querySelector(".resident-request")!.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
      await expect(page.getByRole("button", { name: lang === "ar" ? "مراجعة الموعد" : "Review appointment", exact: true })).toBeInViewport();
      await expect(page.locator(".pass-stage")).toBeVisible({ visible: width >= 900 });
    }
  });
}

for (const lang of ["en", "ar"]) {
  test(`offline form stays compact and preserves the message on recovery (${lang})`, async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(lang => localStorage.setItem("ishara.prefs", JSON.stringify({ lang, theme: "dark" })), lang);
    let available = false;
    let submissions = 0;
    page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/requests") submissions++; });
    await page.route("**/api/config", route => route.fulfill(available
      ? { json: { demo: true, operator_auth_required: false } }
      : { status: 503, json: { detail: "Unavailable" } }));
    await page.goto("/");
    const button = page.getByRole("button", { name: lang === "ar" ? "الخدمة غير متاحة" : "Service unavailable", exact: true });
    const message = page.locator("#msg");
    await expect(button).toBeDisabled();
    await page.evaluate(() => document.fonts.ready);
    await message.fill("Appointment at Rashid Hospital, 12 November at 10:30 AM");
    await page.locator(".request-form").evaluate(form => (form as HTMLFormElement).requestSubmit());
    await expect(page.locator("#request-service")).toHaveText(lang === "ar" ? "الخدمة غير متاحة. يمكنك متابعة الكتابة." : "Service unavailable. You can keep writing.");
    for (const [width, height] of [[390, 844], [1280, 720]]) {
      await page.setViewportSize({ width, height });
      await expect(button).toBeInViewport();
      await expect.poll(() => page.evaluate(() => ({ width: Math.max(0, document.documentElement.scrollWidth - innerWidth), height: Math.max(0, Math.ceil(document.querySelector(".resident-request")!.getBoundingClientRect().bottom - innerHeight)) }))).toEqual({ width: 0, height: 0 });
    }
    expect(submissions).toBe(0);
    const retry = page.getByRole("button", { name: lang === "ar" ? "حاول مجدداً" : "Try again", exact: true });
    await retry.click();
    await expect(button).toBeDisabled();
    available = true;
    await retry.click();
    const review = page.getByRole("button", { name: lang === "ar" ? "مراجعة الموعد" : "Review appointment", exact: true });
    await expect(review).toBeEnabled();
    await expect(retry).toBeHidden();
    available = false;
    await page.clock.fastForward(15000);
    await expect(button).toBeDisabled();
    available = true;
    await page.clock.fastForward(15000);
    await expect(review).toBeEnabled();
    await expect(message).toHaveValue("Appointment at Rashid Hospital, 12 November at 10:30 AM");
    expect(submissions).toBe(0);
  });
}

test("form waits for the initial service check before allowing submission", async ({ page }) => {
  let release!: () => void;
  const checked = new Promise<void>(resolve => { release = resolve; });
  let submissions = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/requests") submissions++; });
  await page.route("**/api/config", async route => {
    await checked;
    await route.fulfill({ json: { demo: true, operator_auth_required: false } });
  });
  await page.goto("/");
  await page.locator("#msg").fill("Appointment at Rashid Hospital, 12 November at 10:30 AM");
  await expect(page.getByRole("button", { name: "Checking service…", exact: true })).toBeDisabled();
  await page.locator(".request-form").evaluate(form => (form as HTMLFormElement).requestSubmit());
  release();
  await expect(page.getByRole("button", { name: "Review appointment", exact: true })).toBeEnabled();
  expect(submissions).toBe(0);
});

for (const lang of ["en", "ar"]) {
  test(`private review has one clear task and confirms the edited details (${lang})`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem("ishara.prefs", JSON.stringify({ lang, theme: "light" })), lang);
    let approved = false;
    let payload: unknown;
    await page.route("**/api/r/preview-token", route => route.fulfill({ json: { ...request, status: approved ? "dispatching" : "reviewing" } }));
    await page.route("**/api/places", route => route.fulfill({ json: { "Oud Metha": [25.24, 55.31] } }));
    await page.route("**/api/r/preview-token/approve", async route => {
      payload = route.request().postDataJSON();
      approved = true;
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto("/r/preview-token");
    await expect(page.getByRole("heading", { level: 1, name: lang === "ar" ? "راجع موعدك" : "Review your appointment", exact: true })).toBeVisible();
    await expect(page.locator(".status-card, .agent-copy, .fact")).toHaveCount(0);
    const confirm = page.getByRole("button", { name: lang === "ar" ? "تأكيد الطلب" : "Confirm request", exact: true });
    await expect(confirm).toBeEnabled();
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const guide = await page.locator(".review-heading .agent-orb").boundingBox();
      expect(guide!.width).toBeGreaterThanOrEqual(44);
      expect(guide!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator(".review-message")).toHaveText(request.message);
    expect(approved).toBe(false);
    await page.getByLabel(lang === "ar" ? "مكان الموعد" : "Appointment location", { exact: true }).fill("Rashid Clinic");
    await confirm.click();
    await expect(page.locator(".appointment-review")).toHaveCount(0);
    await expect(page.locator(".status-card h1")).toHaveText(lang === "ar" ? "نبحث عن مترجمك" : "Finding your interpreter");
    expect(payload).toMatchObject({ entity: "Rashid Clinic", area: "Oud Metha", duration_min: 60, language: "UAE Sign Language" });
  });
}

test("landing turns the draft into a booking pass and flags guesses", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let reads = 0;
  await page.route("**/api/parse", route => { reads++; const text = route.request().postDataJSON().text as string; return route.fulfill({ json: { ...request.appointment, entity: text.includes("Rashid") ? "Rashid Hospital" : "Appointment venue", assumed: text.includes("Rashid") ? [] : ["venue"], hidden: 1 } }); });
  await page.goto("/");
  await expect(page.getByRole("figure", { name: "Paste a message. Ishara turns it into a booking.", exact: true })).toBeVisible();
  await expect(page.locator(".pass").first()).toContainText("Example");
  expect(reads).toBe(0);
  await page.getByLabel("Your appointment message").fill("Need someone for my check-up soon");
  const pass = page.getByRole("figure", { name: "Your booking, as Ishara read it", exact: true });
  await expect(pass.locator(".pass-back")).toContainText("Appointment venue");
  await expect(pass.locator(".pass-back .pass-check")).toHaveCount(1);
  await page.getByRole("button", { name: "Hospital", exact: true }).click();
  await expect(pass.locator(".pass-back")).toContainText("Rashid Hospital");
  await expect(pass.locator(".pass-back")).toContainText("1 private detail hidden");
  await expect(pass.locator(".pass-back .pass-check")).toHaveCount(0);
  await expect(pass.locator(".pass").first()).toHaveAttribute("aria-hidden", "true");
  await page.getByLabel("Your appointment message").fill("");
  await expect(page.getByRole("figure", { name: "Paste a message. Ishara turns it into a booking.", exact: true })).toBeVisible();
  await openSettings(page);
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator(".brand")).toHaveCSS("color", "rgb(250, 250, 250)");
});

test("visit prep saves questions on this device and offers them in conversation", async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { webkitSpeechRecognition: undefined, SpeechRecognition: undefined }));
  await page.route("**/api/r/preview-token", route => route.fulfill({ json: { ...request, status: "confirmed", timeline: [] } }));
  await page.goto("/r/preview-token");
  const prep = page.getByRole("region", { name: "Prepare for your visit", exact: true });
  await expect(prep.getByRole("link", { name: /Directions/ })).toHaveAttribute("href", /google\.com\/maps.*Rashid%20Hospital/);
  const download = page.waitForEvent("download");
  await prep.getByRole("button", { name: "Add to calendar", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("ishara-appointment.ics");
  await prep.getByLabel("New question", { exact: true }).fill("Can I eat before the test?");
  await prep.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(prep.getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("region", { name: "Prepare for your visit", exact: true }).getByRole("listitem")).toHaveText("Can I eat before the test?");
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  const bridge = page.getByRole("dialog", { name: "Conversation", exact: true });
  await bridge.getByRole("button", { name: "Can I eat before the test?", exact: true }).click();
  await expect(bridge.locator(".bridge-show p")).toHaveText("Can I eat before the test?");
});

test("new request shows the task, keeps extras collapsed, and Cancel preserves the draft", async ({ page }) => {
  await page.route("**/api/places", route => route.fulfill({ json: { "Oud Metha": [25.24, 55.31] } }));
  await page.goto("/");
  await coordinatorView(page);
  await expect(page.locator('.progress [aria-current="step"]')).toHaveText("Done");
  await expect(page.locator(".map-full").getByText("Rashid Hospital", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await expect(page.locator(".progress")).toBeHidden();
  await expect(page.locator(".map-full").getByText("Rashid Hospital", { exact: true })).toBeHidden();
  const sheet = page.locator(".sheet");
  await expect(sheet.getByRole("heading", { name: "New request", exact: true })).toBeVisible();
  await expect(sheet.getByRole("textbox")).toHaveCount(1);
  await expect(sheet.getByRole("button", { name: "Hospital", exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Your name", { exact: true })).toBeHidden();
  await expect(sheet.locator(".request-privacy .popover")).toBeHidden();
  await expect(sheet.getByRole("button", { name: "Review appointment", exact: true })).toBeDisabled();
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
  await page.route("**/api/requests/new-request", route => route.fulfill({ json: latest.id === created.id ? latest : created }));
  await page.goto("/");
  await coordinatorView(page);
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByLabel("Your appointment message").fill("Appointment at Rashid Hospital, 12 November at 10:30 AM.");
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/requests/latest");
  await page.getByRole("button", { name: "Review appointment", exact: true }).click();
  await refreshed;
  await expect(page.locator('.progress [aria-current="step"]')).toHaveText("Review");
  await expect(page.getByRole("heading", { name: "New resident", exact: true })).toBeVisible();
  latest = { ...created, status: "dispatching" };
  await expect(page.locator('.progress [aria-current="step"]')).toHaveText("Matching", { timeout: 8000 });
});

test("resetting a collapsed conversation leaves the new request form editable", async ({ page }) => {
  await page.goto("/");
  await coordinatorView(page);
  await page.getByRole("button", { name: "Collapse conversation", exact: true }).click();
  await page.route("**/api/requests/latest", route => route.fulfill({ json: null }));
  await openMenu(page);
  await page.locator(".workspace-reset summary").click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Your appointment message")).toBeVisible();
});

for (const lang of ["en", "ar"]) for (const theme of ["light", "dark"]) {
  test(`new request stays usable with enlarged text (${lang}, ${theme})`, async ({ page }) => {
    await page.addInitScript(prefs => localStorage.setItem("ishara.prefs", JSON.stringify(prefs)), { lang, theme, size: 2 });
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto("/");
    await coordinatorView(page, lang);
    await page.getByRole("button", { name: lang === "ar" ? "طلب جديد" : "New request", exact: true }).click();
    await page.getByLabel(lang === "ar" ? "رسالة موعدك" : "Your appointment message").fill("Appointment at Rashid Hospital, 12 November at 10:30 AM.");
    const review = page.getByRole("button", { name: lang === "ar" ? "مراجعة الموعد" : "Review appointment", exact: true });
    await expect(review).toBeEnabled();
    await review.scrollIntoViewIfNeeded();
    const privacy = page.locator(".request-privacy .pop-trigger");
    await privacy.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".request-privacy .popover")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const rect = await review.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    const settings = lang === "ar" ? "العرض وإمكانية الوصول" : "Display & accessibility";
    await openSettings(page, lang);
    await expect(page.getByRole("dialog", { name: settings, exact: true })).toHaveCSS("opacity", "1");
    const popup = await page.getByRole("dialog", { name: settings, exact: true }).boundingBox();
    expect(popup!.x).toBeGreaterThanOrEqual(0);
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(320);
  });
}

test("settings fit narrow screens and text-first mode keeps entry simple", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/");
  await coordinatorView(page);
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await expect(page.locator(".sheet-head .agent-orb")).toBeVisible();
  await openSettings(page);
  const bounds = await page.getByRole("dialog", { name: "Display & accessibility", exact: true }).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect.poll(async () => {
    const rect = await page.getByRole("dialog", { name: "Display & accessibility", exact: true }).boundingBox();
    return rect!.x >= 0 && rect!.x + rect!.width <= 390;
  }).toBe(true);
  await page.getByLabel("Text-first mode", { exact: true }).check();
  await expect(page.locator(".sheet-head .agent-orb")).toHaveCount(0);
  await expect(page.getByLabel("Your appointment message")).toBeVisible();
});

test("workspace menu is keyboard accessible and returns focus after actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await coordinatorView(page);
  const trigger = page.getByRole("button", { name: "Menu", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Activity & support", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".drawer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close activity", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".drawer")).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "How Ishara works", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "How Ishara works", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu", exact: true })).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const lang of ["en", "ar"]) {
  test(`help dialog keeps the guide readable and questions accessible (${lang})`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem("ishara.prefs", JSON.stringify({ lang, size: 2, theme: "dark" })), lang);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    await openMenu(page, lang);
    const trigger = page.getByRole("button", { name: lang === "ar" ? "كيف تعمل إشارة" : "How Ishara works", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const guide = page.getByRole("dialog", { name: lang === "ar" ? "كيف تعمل إشارة" : "How Ishara works", exact: true });
    const close = guide.getByRole("button", { name: lang === "ar" ? "إغلاق الدليل" : "Close guide", exact: true });
    const menu = page.getByRole("button", { name: lang === "ar" ? "القائمة" : "Menu", exact: true });
    await expect(page.getByRole("dialog", { name: lang === "ar" ? "القائمة" : "Menu", exact: true })).toBeHidden();
    await expect(close).toBeFocused();
    await expect(guide.locator(".how-steps li")).toHaveCount(3);
    await expect(guide.locator("details[open]")).toHaveCount(0);
    const questions = guide.locator(".how-questions details");
    await questions.first().locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(questions.first()).toHaveAttribute("open", "");
    await questions.last().locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(questions.last()).toHaveAttribute("open", "");
    await expect(questions.first()).not.toHaveAttribute("open", "");
    await expect(close).toBeInViewport();
    for (const [width, height] of [[320, 640], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(async () => {
        const bounds = (await guide.boundingBox())!;
        return bounds.x >= 15 && bounds.y >= 15 && bounds.x + bounds.width <= width - 15 && bounds.y + bounds.height <= height - 15;
      }).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.mouse.click(4, 4);
    await expect(guide).toBeHidden();
    await expect(menu).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await openMenu(page, lang);
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(guide).toBeHidden();
    await expect(menu).toBeFocused();
    await openMenu(page, lang);
    await trigger.click();
    await close.click();
    await expect(guide).toBeHidden();
    await expect(menu).toBeFocused();
  });
}

for (const lang of ["en", "ar"]) {
  test(`settings dialog dismisses, retains preferences, and restores keyboard focus (${lang})`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem("ishara.prefs", JSON.stringify({ lang, size: 2, theme: "dark" })), lang);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    await openSettings(page, lang);
    const dialog = page.getByRole("dialog", { name: lang === "ar" ? "العرض وإمكانية الوصول" : "Display & accessibility", exact: true });
    const menu = page.getByRole("button", { name: lang === "ar" ? "القائمة" : "Menu", exact: true });
    const close = dialog.getByRole("button", { name: lang === "ar" ? "إغلاق الإعدادات" : "Close settings", exact: true });
    await expect(page.getByRole("dialog", { name: lang === "ar" ? "القائمة" : "Menu", exact: true })).toBeHidden();
    await expect(close).toBeFocused();
    expect(await dialog.evaluate(element => element.matches(":modal"))).toBe(true);
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    for (const [width, height] of [[320, 640], [768, 600], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(async () => {
        const bounds = (await dialog.boundingBox())!;
        return bounds.x >= 15 && bounds.y >= 15 && bounds.x + bounds.width <= width - 15 && bounds.y + bounds.height <= height - 15;
      }).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await close.focus();
    await menu.evaluate(element => element.focus());
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel(lang === "ar" ? "المظهر" : "Appearance", { exact: true })).toBeFocused();
    await dialog.getByLabel(lang === "ar" ? "تقليل الحركة" : "Reduce motion", { exact: true }).check();
    await page.mouse.click(4, 4);
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await openSettings(page, lang);
    await expect(dialog.getByLabel(lang === "ar" ? "تقليل الحركة" : "Reduce motion", { exact: true })).toBeChecked();
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
    await openSettings(page, lang);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
  });
}

test("requester settings open directly as a modal and return focus to their button", async ({ page }) => {
  await page.goto("/r/preview-token");
  const trigger = page.getByRole("button", { name: "Display & accessibility", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Display & accessibility", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("demo reset stays behind confirmation and the menu retains presentation and view switching", async ({ page }) => {
  let resets = 0;
  await page.route("**/api/demo/reset", route => { resets++; return route.fulfill({ json: { ok: true } }); });
  await page.goto("/");
  await coordinatorView(page);
  await openMenu(page);
  await expect(page.getByRole("link", { name: "Presentation", exact: true })).toHaveAttribute("href", "/stage");
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeHidden();
  await page.locator(".workspace-reset summary").click();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeHidden();
  expect(resets).toBe(0);
  await page.locator(".workspace-reset summary").click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect.poll(() => resets).toBe(1);
  await expect(page.getByRole("dialog", { name: "Menu", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Requester", exact: true }).click();
  await expect(page.locator(".resident-intro")).toBeVisible();
});

test("coordinator sign in retains validation and sign out from the grouped menu", async ({ page }) => {
  let authenticated = false;
  await page.route("**/api/config", route => route.fulfill({ json: { demo: false, operator_auth_required: true, llm: "Rules only" } }));
  await page.route("**/api/operator/session", route => {
    const request = route.request();
    if (request.method() === "POST") {
      if (request.postDataJSON().key !== "test-key") return route.fulfill({ status: 401, json: { detail: "Invalid access key" } });
      authenticated = true;
    }
    if (request.method() === "DELETE") authenticated = false;
    return route.fulfill({ json: { authenticated, demo: false } });
  });
  await page.goto("/");
  await openMenu(page);
  await expect(page.getByRole("button", { name: "Coordinator", exact: true })).toHaveCount(0);
  await page.locator(".workspace-login summary").click();
  await page.getByLabel("Access key", { exact: true }).fill("wrong-key");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".workspace-login").getByRole("alert")).toHaveText("Invalid access key");
  await page.getByLabel("Access key", { exact: true }).fill("test-key");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".progress")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu", exact: true })).toBeHidden();
  await openMenu(page);
  await expect(page.locator(".workspace-reset")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".resident-intro")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu", exact: true })).toBeHidden();
  expect(authenticated).toBe(false);
});

test.describe("bundled map worker", () => {
  test.beforeEach(async ({ page }) => {
    // A local GeoJSON basemap exercises the actual worker without a tile-service dependency.
    await page.route("https://tiles.openfreemap.org/styles/positron", route => route.fulfill({ json: {
      version: 8,
      sources: { land: { type: "geojson", data: { type: "Feature", properties: {}, geometry: {
        type: "Polygon", coordinates: [[[55, 25], [55.5, 25], [55.5, 25.4], [55, 25.4], [55, 25]]],
      } } } },
      layers: [{ id: "background", type: "background", paint: { "background-color": "#faf8f5" } },
        { id: "land", type: "fill", source: "land", paint: { "fill-color": "#eee7de" } }],
    } }));
  });

  test("renders a GeoJSON basemap using the emitted worker", async ({ page }) => {
    const workerErrors: string[] = [];
    const workers: number[] = [];
    page.on("console", message => { if (/worker failed to load/i.test(message.text())) workerErrors.push(message.text()); });
    page.on("response", response => { if (/\.mjs(?:\?|$)/.test(response.url())) workers.push(response.status()); });
    await page.goto("/");
    await coordinatorView(page);
    const map = page.getByRole("region", { name: "Map of Dubai with interpreters and the appointment" });
    await expect(map).toHaveAttribute("aria-busy", "false", { timeout: 10000 });
    await expect(map.locator("canvas")).toBeVisible();
    expect(workers).toContain(200);
    expect(workers.every(status => status === 200)).toBe(true);
    expect(workerErrors).toEqual([]);
  });

  test("shows the offline map when the worker cannot load", async ({ page }) => {
    await page.route(/\.mjs(?:\?|$)/, route => route.abort());
    await page.goto("/");
    await coordinatorView(page);
    await expect(page.getByRole("img", { name: "Map of Dubai showing interpreters and the appointment", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  });
});


const supportQueue: Escalation[] = [
  { request_id: "R-842989A01853", requester_name: "Layla", status: "pending", created_at: 1793700000, acknowledged_at: null, note: null },
  { request_id: "R-3C646426D2C4", requester_name: "", status: "pending", created_at: 1793700100, acknowledged_at: null, note: null },
];

for (const lang of ["en", "ar"]) {
  test(`support list stays compact with enlarged text (${lang})`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem("ishara.prefs", JSON.stringify({ lang, theme: "dark", size: 2 })), lang);
    await page.route("**/api/escalations", route => route.fulfill({ json: supportQueue }));
    await page.route("**/api/metrics", route => route.fulfill({ json: { requests: 3, filled: 1, median_confirm_s: 12681.1, replans: 0 } }));
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    await coordinatorView(page, lang);
    await openMenu(page, lang);
    await page.getByRole("button", { name: lang === "ar" ? "النشاط والدعم" : "Activity & support", exact: true }).click();
    const drawer = page.locator(".drawer");
    await expect(drawer.locator(".support-request")).toHaveCount(2);
    await expect(drawer.getByRole("textbox")).toHaveCount(0);
    const first = drawer.locator(".support-request > summary").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(drawer.getByRole("textbox")).toHaveCount(1);
    await drawer.locator(".support-request > summary").nth(1).click();
    await expect(drawer.getByRole("textbox")).toHaveCount(1);
    await expect(drawer.locator(".support-request").first()).not.toHaveAttribute("open", "");
    await drawer.locator(".activity-disclosure > summary").last().click();
    await expect(drawer.locator(".activity-metrics")).toBeVisible();
    await expect(drawer.locator(".activity-metrics")).not.toContainText("12681");
    expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await drawer.locator(".activity").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("button", { name: lang === "ar" ? "القائمة" : "Menu", exact: true })).toBeFocused();
  });
}

test("support acknowledgment retains a failed draft and shows the saved server update", async ({ page }) => {
  let queue = supportQueue.map(item => ({ ...item }));
  let attempts = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/escalations", route => route.fulfill({ json: queue }));
  await page.route("**/api/escalations/*/acknowledge", async route => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ note: "Checking remote support. Call 050 123 4567." });
    if (attempts === 1) { await pending; return route.fulfill({ status: 503, json: { detail: "Please try again." } }); }
    queue = queue.map((item, index) => index ? item : { ...item, status: "acknowledged" as const, note: "Checking remote support. Call [redacted].", acknowledged_at: 1793700200 });
    return route.fulfill({ json: queue[0] });
  });
  await page.goto("/");
  await coordinatorView(page);
  await openMenu(page);
  await page.getByRole("button", { name: "Activity & support", exact: true }).click();
  const row = page.locator(".support-request").first();
  await row.locator("summary").click();
  await row.getByRole("textbox").fill("Checking remote support. Call 050 123 4567.");
  await row.getByRole("button", { name: "Acknowledge", exact: true }).click();
  const saving = row.getByRole("button", { name: "Saving…", exact: true });
  await expect(saving).toHaveAttribute("aria-disabled", "true");
  await expect.poll(() => attempts).toBe(1);
  await saving.click({ force: true });
  expect(attempts).toBe(1);
  release();
  await expect(row.getByRole("alert")).toHaveText("Please try again.");
  await expect(row.getByRole("button", { name: "Acknowledge", exact: true })).toBeFocused();
  await expect(row.getByRole("textbox")).toHaveValue("Checking remote support. Call 050 123 4567.");
  await row.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(row.getByRole("textbox")).toHaveCount(0);
  await expect(row.locator("summary")).toBeFocused();
  await expect(row.locator(".support-status")).toHaveText("Acknowledged");
  await expect(row.locator(".support-response")).toContainText("Call [redacted]");
  await expect(row.locator(".support-response")).not.toContainText("050 123 4567");
  expect(attempts).toBe(2);
});


for (const lang of ["en", "ar"]) {
  test(`request options open with a keyboard and retain the optional name (${lang})`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem("ishara.prefs", JSON.stringify({ lang, size: 2, theme: "dark" })), lang);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    const name = page.locator(".optional-name");
    await expect(name.locator("summary")).toHaveCSS("list-style-type", "none");
    await name.locator("summary").focus();
    await page.keyboard.press("Enter");
    await page.getByLabel(lang === "ar" ? "اسمك" : "Your name", { exact: true }).fill("Amal");
    await page.getByRole("button", { name: lang === "ar" ? "مستشفى" : "Hospital", exact: true }).click();
    await expect(page.getByLabel(lang === "ar" ? "رسالة موعدك" : "Your appointment message")).toBeFocused();
    await expect(page.getByLabel(lang === "ar" ? "اسمك" : "Your name", { exact: true })).toHaveValue("Amal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("conversation captions staff speech and shows the resident's replies", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = ""; continuous = false; interimResults = false; started = 0;
      onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
      constructor() { (window as unknown as { __rec: FakeRecognition }).__rec = this; }
      start() { this.started++; }
      stop() { this.onend?.(); }
      abort() {}
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: undefined });
  });
  await page.route("**/api/r/preview-token", route => route.fulfill({ json: { ...request, status: "dispatching", timeline: [] } }));
  await page.goto("/r/preview-token");
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  const bridge = page.getByRole("dialog", { name: "Conversation", exact: true });
  await expect(bridge).toBeVisible();
  await bridge.getByRole("button", { name: "Start captions", exact: true }).click();
  await expect(bridge.getByRole("status")).toContainText("Listening");
  const say = (results: [boolean, string][]) => page.evaluate(results => {
    const rec = (window as unknown as { __rec: { lang: string; onresult: (e: unknown) => void } }).__rec;
    rec.onresult({ resultIndex: 0, results: results.map(([isFinal, transcript]) => ({ isFinal, 0: { transcript } })) });
    return rec.lang;
  }, results);
  expect(await say([[false, "Please take"]])).toBe("en-US");
  await expect(bridge.locator(".bridge-line.interim")).toHaveText("Please take");
  await expect(bridge.locator(".bridge-line.interim")).toBeVisible();
  await say([[true, "Please take a seat."]]);
  await expect(bridge.locator(".bridge-line.from-staff", { hasText: "Please take a seat." })).toBeVisible();
  await expect(bridge.locator(".bridge-line.interim")).toHaveCount(0);
  await bridge.getByRole("button", { name: "Repeat", exact: true }).click();
  await expect(bridge.locator(".bridge-show p")).toHaveText("Could you repeat that, please?");
  const flip = bridge.getByRole("button", { name: "Turn to staff", exact: true });
  await flip.click();
  await expect(flip).toHaveAttribute("aria-pressed", "true");
  await bridge.getByLabel("Your reply", { exact: true }).fill("Thank you");
  await bridge.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bridge.locator(".bridge-show p")).toHaveText("Thank you");
  await expect(flip).toHaveAttribute("aria-pressed", "false");
  await bridge.getByRole("combobox").selectOption("ar-AE");
  expect(await say([[true, "تفضل بالجلوس"]])).toBe("ar-AE");
  await bridge.getByRole("button", { name: "Repeat", exact: true }).click();
  await expect(bridge.locator(".bridge-show p")).toHaveText("هل يمكنك الإعادة من فضلك؟");
  await page.evaluate(() => (window as unknown as { __rec: { onerror: (e: unknown) => void } }).__rec.onerror({ error: "not-allowed" }));
  await expect(bridge.getByRole("alert")).toContainText("Microphone access is blocked");
  await bridge.getByRole("button", { name: "Close conversation", exact: true }).click();
  await expect(bridge).toBeHidden();
});

test("conversation falls back to staff typing when the browser has no speech recognition", async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { webkitSpeechRecognition: undefined, SpeechRecognition: undefined }));
  await page.route("**/api/r/preview-token", route => route.fulfill({ json: { ...request, status: "confirmed", timeline: [] } }));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/r/preview-token");
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  const bridge = page.getByRole("dialog", { name: "Conversation", exact: true });
  await expect(bridge.getByRole("button", { name: "Start captions" })).toHaveCount(0);
  await expect(bridge).toContainText("Live captions are not available in this browser");
  await bridge.getByLabel("Staff message", { exact: true }).fill("Room 4, please.");
  await bridge.getByRole("button", { name: "Add", exact: true }).click();
  await expect(bridge.locator(".bridge-line.from-staff", { hasText: "Room 4, please." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("the journey starts only when asked, steps by keyboard and returns to the pass", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const story = page.getByRole("group", { name: "How a request works", exact: true });
  await expect(story).toHaveCount(0);
  await page.getByRole("button", { name: "See the journey", exact: true }).click();
  await expect(story.locator('.deck-card:not([aria-hidden="true"]) h3')).toHaveText("You paste the message");
  await expect(story.locator(".backstage")).toContainText("reading it and hiding phone numbers");
  await story.getByRole("button", { name: "Next step", exact: true }).click();
  await story.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(story.locator('.deck-card:not([aria-hidden="true"]) h3')).toHaveText("Ishara finds your interpreter");
  await story.getByRole("button", { name: "Next step", exact: true }).press("ArrowRight");
  await expect(story.locator('.deck-card:not([aria-hidden="true"]) h3')).toHaveText("Mariam is confirmed");
  await story.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(story.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await story.getByRole("button", { name: "Close the journey", exact: true }).click();
  await expect(page.getByRole("button", { name: "See the journey", exact: true })).toBeVisible();
});

test("with reduced motion the story is a plain list and the closing button returns to the form", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const story = page.getByRole("region", { name: "How Ishara works for you", exact: true });
  await expect(story.locator(".story-list > li")).toHaveCount(5);
  await expect(story.locator(".story-sticky")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Ready for the visit", exact: true }).locator(".ready-tile")).toHaveCount(4);
  await page.getByRole("button", { name: "Paste your appointment", exact: true }).click();
  await expect(page.getByLabel("Your appointment message")).toBeFocused();
});

test("scrolling the pinned journey flips to the next chapter", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const section = page.locator("#how-it-works");
  await expect(section.locator(".story-sticky")).toHaveCount(1);
  const [top, height] = await section.evaluate(e => [e.getBoundingClientRect().top + scrollY, e.offsetHeight]);
  await page.evaluate(y => scrollTo(0, y), top + 20);
  await expect(section.locator(".story-chapter h3")).toHaveText("You paste the message");
  await page.evaluate(y => scrollTo(0, y), top + (height - 900) * 0.7);
  await expect(section.locator(".story-chapter h3")).toHaveText("Mariam is confirmed");
  await expect(section.locator(".story-sticky")).toBeInViewport();
  await expect(section.locator(".sr-only .story-list > li")).toHaveCount(5);
});
