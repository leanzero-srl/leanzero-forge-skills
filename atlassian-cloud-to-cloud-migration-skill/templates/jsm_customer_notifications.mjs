#!/usr/bin/env node
// jsm_customer_notifications.mjs — turn a JSM desk's CUSTOMER notifications (portal e-mails: request created,
// public comment added, request resolved, ...) OFF before a migration load and back ON afterwards, exactly as they were.
//
// There is NO public REST API for these rules, so this drives the project settings page in a real browser.
// DEPENDENCY: Playwright (`npm i playwright` + `npx playwright install chromium`) — the one non-stdlib template here.
// AUTH: a persistent browser profile that is already logged in as a site/JSM admin (log in once, headed, with MFA).
//
//   node jsm_customer_notifications.mjs <site> <KEY> status|off|on [--profile ./.auth/profile] [--expect <accountId>]
//
// off : records every rule's state to ./state/jsm-notif/<host>-<KEY>.json ONLY IF NO RECORD EXISTS (a second `off`
//       must never overwrite the true before-state), unticks every enabled rule, reloads, re-reads (≤ 3 passes)
// on  : re-enables exactly the rules the record says were enabled — never "all"; refuses without a record
// Writes ./state/jsm-notif/<host>-<KEY>.ok only when the read-back equals the wanted state, plus before/after
// screenshots. Exit 1 if any rule is not in the wanted state.
//
// Field-proven (company- and team-managed desks share the page; ~10 rules per desk; off/on idempotent; restore =
// recorded state). UI selectors change over time: confidence MEDIUM — run `status` first and look at the screenshot.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [SITE0, KEY, MODE = "status"] = process.argv.slice(2);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (!SITE0 || !KEY || !["status", "off", "on"].includes(MODE)) {
  console.error("usage: node jsm_customer_notifications.mjs <site> <KEY> status|off|on [--profile DIR] [--expect accountId]");
  process.exit(2);
}
const SITE = SITE0.replace(/\/$/, "");
const host = new URL(SITE).host.split(".")[0];
const OUT = path.resolve("state", "jsm-notif");
fs.mkdirSync(OUT, { recursive: true });
const REC = path.join(OUT, `${host}-${KEY}.json`);
const OK = path.join(OUT, `${host}-${KEY}.ok`);
const ts = () => new Date().toISOString().replace(/[:.]/g, "-");

const ctx = await chromium.launchPersistentContext(arg("--profile", "./.auth/profile"), { headless: !process.env.HEADED });
const page = ctx.pages()[0] || (await ctx.newPage());
const fail = async (m) => {
  console.error("FAIL", KEY, m);
  await page.screenshot({ path: path.join(OUT, `${host}-${KEY}-error-${ts()}.png`), fullPage: true }).catch(() => {});
  await ctx.close();
  process.exit(1);
};

// two URL shapes have existed for this settings page
async function openPage() {
  for (const url of [`${SITE}/jira/servicedesk/projects/${KEY}/settings/customer-notifications`,
                     `${SITE}/jira/servicedesk/projects/${KEY}/settings/notifications/customer-notifications`]) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    for (let i = 0; i < 20; i++) {
      if (await page.locator("tr:has(input[type=checkbox])").count()) return url;
      await page.waitForTimeout(1000);
    }
  }
  return null;
}

async function readRules() {
  return page.locator("tr:has(input[type=checkbox])").evaluateAll((trs) => trs.map((tr) => {
    const box = tr.querySelector("input[type=checkbox]");
    // once a rule is off, a "Disabled" badge joins the name cell - strip it so names stay stable
    const name = (tr.querySelector("td,th")?.innerText || "").split("\n")[0].replace(/\s*disabled\s*$/i, "").trim();
    return { name, enabled: !!box.checked };
  }));
}

if (!(await openPage())) await fail("customer-notification rules table not found (checked both URLs)");
const me = await page.evaluate(async () => {
  const r = await fetch("/rest/api/3/myself"); return r.ok ? (await r.json()).accountId : `HTTP ${r.status}`;
});
if (arg("--expect") && me !== arg("--expect")) await fail(`logged in as ${me}, expected ${arg("--expect")}`);
let rules = await readRules();
if (!rules.length) await fail("no rules read");
const show = (label, rs) => console.log(`${KEY} ${label}: ` + rs.map((r) => `${r.name}=${r.enabled ? "ON" : "off"}`).join(" | "));
show("now", rules);
if (MODE === "status") { await ctx.close(); process.exit(0); }

await page.screenshot({ path: path.join(OUT, `${host}-${KEY}-before-${MODE}-${ts()}.png`), fullPage: true });
let want;
if (MODE === "off") {
  if (!fs.existsSync(REC)) fs.writeFileSync(REC, JSON.stringify({ site: SITE, key: KEY, by: me, taken: new Date().toISOString(), rules }, null, 1));
  want = Object.fromEntries(rules.map((r) => [r.name, false]));
} else {
  if (!fs.existsSync(REC)) await fail(`no before-state record ${REC} - refusing to guess which rules were on`);
  want = Object.fromEntries(JSON.parse(fs.readFileSync(REC, "utf8")).rules.map((r) => [r.name, r.enabled]));
}

for (let pass = 0; pass < 3; pass++) {
  rules = await readRules();
  let changed = 0;
  for (const r of rules) {
    if (!(r.name in want) || r.enabled === want[r.name]) continue;
    const row = page.locator("tr:has(input[type=checkbox])").filter({ hasText: r.name }).first();
    await row.locator("input[type=checkbox]").first().click({ force: true })
      .catch(async () => { await row.locator("label").first().click({ force: true }); });
    await page.waitForTimeout(1500);
    const dlg = page.getByRole("dialog");                       // a confirmation, if the product asks for one
    if (await dlg.isVisible().catch(() => false)) {
      const b = dlg.getByRole("button", { name: /disable|enable|confirm|turn off|turn on|yes/i }).first();
      if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(1500); }
    }
    changed++;
  }
  if (!changed) break;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
}

rules = await readRules();
show("after", rules);
await page.screenshot({ path: path.join(OUT, `${host}-${KEY}-after-${MODE}-${ts()}.png`), fullPage: true });
await ctx.close();
const bad = rules.filter((r) => r.name in want && r.enabled !== want[r.name]);
if (bad.length) { console.error("NOT REACHED", KEY, bad.map((r) => r.name).join(", ")); process.exit(1); }
fs.writeFileSync(OK, `${MODE} ${new Date().toISOString()} ${rules.length} rules read back\n`);
console.log(`${KEY} ${MODE.toUpperCase()} OK (${rules.length} rules) -> ${OK}`);
