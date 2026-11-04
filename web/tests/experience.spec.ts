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

async function openMenu(page: Page, lang = "en") {
  await page.getByRole("button", { name: lang === "ar" ? "القائمة" : "Menu", exact: true }).click();
}

async function coordinatorView(page: Page, lang = "en") {
  await openMenu(page, lang);
  await page.getByRole("button", { name: lang === "ar" ? "المنسق" : "Coordinator", exact: true }).click();
  await expect(page.getByRole("dialog", { name: lang === "ar" ? "القائمة" : "Menu", exact: true })).toBeHidden();
}

async function openSettings(page: Page, lang = "en") {
  await openMenu(page, lang);
  await page.getByRole("button", { name: lang === "ar" ? "العرض وإمكانية الوصول" : "Display & accessibility", exact: true }).click();
}

test.beforeEach(async ({ page }) => { await mockService(page); });

for (const lang of ["en", "ar"]) for (const size of [0, 2]) {
  test(`coordinator header reflows without collisions (${lang}, text size ${size})`, async ({ page }) => {
    await page.addInitScript(prefs => localStorage.setItem("ishara.prefs", JSON.stringify(prefs)), { lang, size, theme: "dark" });
    await page.goto("/");
    await coordinatorView(page, lang);
    await expect(page.locator(".progress")).toBeVisible();
    await expect(page.locator(".header-main").getByRole("button")).toHaveCount(2);
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
      if (size === 0) await expect.poll(async () => (await page.locator(".header-main").boundingBox())!.height, { message: `${width}px compact toolbar` }).toBeLessThanOrEqual(56);
    }
  });
}

test("landing starts with the message form and an example can be reviewed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start a request", exact: true })).toHaveCount(0);
  await page.getByLabel("Your appointment message").click();
  await expect(page.getByLabel("Your appointment message")).toBeFocused();
  await page.locator(".request-examples summary").click();
  await page.getByRole("button", { name: "Hospital", exact: true }).click();
  await expect(page.locator(".request-examples")).not.toHaveAttribute("open", "");
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
  await expect(page.locator(".how details").nth(1)).toHaveAttribute("open", "");
  await expect(page.locator(".prototype-note")).toBeVisible();
});

for (const lang of ["en", "ar"]) {
  test(`landing fits desktop and phone screens (${lang})`, async ({ page }) => {
    await page.addInitScript(lang => localStorage.setItem("ishara.prefs", JSON.stringify({ lang, theme: "light" })), lang);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[390, 844], [1280, 720], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      await expect(page.getByRole("button", { name: lang === "ar" ? "مراجعة الموعد" : "Review appointment", exact: true })).toBeInViewport();
      if (width > 560) {
        const alignment = await page.locator(".welcome-guide").evaluate(guide => {
          const icons = [...guide.querySelectorAll(".welcome-tile")].map(icon => icon.getBoundingClientRect());
          const labels = [...guide.querySelectorAll("li")].map(label => label.getBoundingClientRect());
          return labels.map((label, i) => Math.abs(label.left + label.width / 2 - icons[i].left - icons[i].width / 2));
        });
        expect(alignment.every(offset => offset < 1)).toBe(true);
      }
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
    await message.fill("Appointment at Rashid Hospital, 12 November at 10:30 AM");
    await page.locator(".request-form").evaluate(form => (form as HTMLFormElement).requestSubmit());
    await expect(page.locator("#request-service")).toHaveText(lang === "ar" ? "يمكنك تجهيز الرسالة. الإرسال غير متاح حالياً." : "You can prepare a message. Sending is unavailable.");
    for (const [width, height] of [[390, 844], [1280, 720]]) {
      await page.setViewportSize({ width, height });
      await expect(button).toBeInViewport();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(submissions).toBe(0);
    available = true;
    await page.clock.fastForward(15000);
    await expect(page.getByRole("button", { name: lang === "ar" ? "مراجعة الموعد" : "Review appointment", exact: true })).toBeEnabled();
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

test("welcome animation respects motion and text-first preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator(".welcome-ink")).toHaveCSS("animation-name", "welcome-connect");
  await page.evaluate(() => document.fonts.ready);
  const guide = page.locator(".welcome-guide");
  const initialBounds = await guide.boundingBox();
  const delays = await page.locator(".welcome-step").evaluateAll(steps => steps.map(step => parseFloat(getComputedStyle(step).animationDelay)));
  expect(delays).toHaveLength(3);
  expect(delays[0]).toBeLessThan(delays[1]);
  expect(delays[1]).toBeLessThan(delays[2]);
  await guide.evaluate(element => element.getAnimations({ subtree: true }).forEach(animation => animation.finish()));
  expect(await guide.boundingBox()).toEqual(initialBounds);
  for (const step of await page.locator(".welcome-step").all()) {
    await expect(step).toHaveCSS("opacity", "1");
    await expect(step).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expect(step).toHaveCSS("animation-iteration-count", "1");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".welcome-step").first()).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openSettings(page);
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator(".brand")).toHaveCSS("color", "rgb(250, 250, 250)");
  await page.getByLabel("Reduce motion", { exact: true }).check();
  await expect(page.locator(".welcome-ink")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".welcome-step").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator(".resident-flow li").first()).toHaveCSS("animation-name", "none");
  await page.getByLabel("Text-first mode", { exact: true }).check();
  await expect(page.locator(".welcome-art")).toBeHidden();
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
  await expect(sheet.locator(".agent-copy, .companion-choices")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Hospital", exact: true })).toBeHidden();
  await expect(sheet.getByLabel("Your name", { exact: true })).toBeHidden();
  await expect(sheet.locator(".request-privacy p")).toBeHidden();
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
    const privacy = page.locator(".request-privacy summary");
    await privacy.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".request-privacy p")).toBeVisible();
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

test("companion choice lives in display settings and text-first mode keeps entry simple", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/");
  await coordinatorView(page);
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await openSettings(page);
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
  await coordinatorView(page);
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await expect(page.locator(".sheet-head .companion-pearl")).toBeVisible();
  await openSettings(page);
  await page.getByLabel("Text-first mode", { exact: true }).check();
  await expect(page.locator(".sheet-head .companion-touch")).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "Requester view", exact: true })).toBeFocused();
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
  await openMenu(page);
  await page.getByRole("button", { name: "Requester view", exact: true }).click();
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
    const examples = page.locator(".request-examples");
    await expect(name.locator("summary")).toHaveCSS("list-style-type", "none");
    await expect(examples.locator("summary")).toHaveCSS("list-style-type", "none");
    await name.locator("summary").focus();
    await page.keyboard.press("Enter");
    await page.getByLabel(lang === "ar" ? "اسمك" : "Your name", { exact: true }).fill("Amal");
    await examples.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(name).not.toHaveAttribute("open", "");
    await expect(examples).toHaveAttribute("open", "");
    await page.getByRole("button", { name: lang === "ar" ? "مستشفى" : "Hospital", exact: true }).click();
    await expect(examples).not.toHaveAttribute("open", "");
    await expect(page.getByLabel(lang === "ar" ? "رسالة موعدك" : "Your appointment message")).toBeFocused();
    await name.locator("summary").click();
    await expect(page.getByLabel(lang === "ar" ? "اسمك" : "Your name", { exact: true })).toHaveValue("Amal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
