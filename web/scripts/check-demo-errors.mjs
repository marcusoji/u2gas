#!/usr/bin/env node
/**
 * Demo error crawl.
 *
 * Visits every route in the demo (VITE_USE_MOCKS=true), as each role, and
 * fails if any page logs a console error/warning, throws, or fails a request.
 *
 * The dev server must already be on :12001.
 *
 *   node scripts/check-demo-errors.mjs
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:12001";

/** Routes per role. Roles are selected through the demo `?as=` switch. */
const ROUTES = {
  customer: [
    "/", "/home", "/shop", "/shop/product/p1", "/cart", "/checkout",
    "/history", "/profile", "/profile/details", "/notifications", "/addresses",
    "/auth/login", "/auth/sent",
  ],
  staff: [
    "/staff", "/staff/queue", "/staff/walk-in", "/staff/lookup", "/staff/shift",
    "/staff/notifs", "/staff/me",
  ],
  driver: [
    "/driver", "/driver/scan", "/driver/me",
  ],
  admin: [
    "/admin", "/admin/tank", "/admin/tank/update", "/admin/tank/history",
    "/admin/products", "/admin/bundles/new", "/admin/orders", "/admin/people",
    "/admin/settings", "/admin/reports", "/admin/audit", "/admin/notifs", "/admin/me",
  ],
};

/** Console noise that is not an app defect. */
const IGNORE = [
  /favicon/i,
  /Download the React DevTools/i,
  /Failed to load resource: the server responded with a status of 404 .*__boards/i,
];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

let failures = 0;
const report = [];

for (const [role, paths] of Object.entries(ROUTES)) {
  for (const path of paths) {
    const page = await browser.newPage();
    await page.setViewport({ width: 440, height: 900 });
    const problems = [];

    page.on("console", (msg) => {
      const type = msg.type();
      if (type !== "error" && type !== "warning") return;
      const text = msg.text();
      if (IGNORE.some((re) => re.test(text))) return;
      problems.push(`[console.${type}] ${text}`);
    });
    page.on("pageerror", (err) => problems.push(`[pageerror] ${err.message}`));
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (IGNORE.some((re) => re.test(url))) return;
      problems.push(`[requestfailed] ${url} — ${req.failure()?.errorText}`);
    });

    const url = `${BASE}${path}?as=${role}`;
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
      // Let async data settle and effects run.
      await new Promise((r) => setTimeout(r, 900));
    } catch (e) {
      problems.push(`[navigation] ${e.message}`);
    }

    if (problems.length) {
      failures += problems.length;
      report.push(`\n${role.toUpperCase()} ${path}`);
      for (const p of problems) report.push(`   ${p}`);
    }
    await page.close();
  }
}

await browser.close();

if (report.length) {
  console.log("DEMO ERRORS FOUND:");
  console.log(report.join("\n"));
  console.log(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log("DEMO CLEAN — no console errors, page errors or failed requests.");
