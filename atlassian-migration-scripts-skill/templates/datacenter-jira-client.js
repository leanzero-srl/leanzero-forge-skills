"use strict";

/**
 * DatacenterJiraClient — zero-dep native-http(s) client for Jira Data
 * Center / Server. Used as the SOURCE side of a DC→Cloud migration.
 *
 *   // Basic auth (legacy DC)
 *   new DatacenterJiraClient("https://jira.example.com", "admin", "password");
 *
 *   // Personal Access Token (DC 8.14+)
 *   new DatacenterJiraClient("https://jira.example.com", null, null, { pat: process.env.DC_PAT });
 *
 * DC uses the v2 REST API at `/rest/api/2/`, classic `startAt`+`maxResults`
 * pagination, and returns a `total` field. Cloud's v3 API is mostly
 * compatible but the user identity model differs — DC has `username` and
 * `userKey`; Cloud has only `accountId`.
 *
 * The retry contract matches the Cloud clients (separate counters for
 * 429 / 5xx / network) but with slightly more generous DC limits — many
 * DC instances throttle aggressively.
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");

class DatacenterJiraClient {
  constructor(baseUrl, username, password, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const parsed = new URL(this.baseUrl);
    this.protocol = parsed.protocol === "https:" ? https : http;
    this.hostname = parsed.hostname;
    this.port = parsed.port || (parsed.protocol === "https:" ? 443 : 80);
    this.basePath = parsed.pathname.replace(/\/$/, "");

    // Accept either Basic (username+password) or PAT (Bearer)
    const pat = options.pat || (username ? null : password);
    if (pat) {
      this.authHeader = "Bearer " + pat;
    } else {
      this.authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    }

    this.requestCount = 0;
    this.errorCount = 0;
  }

  makeRequest(method, path, body = null, retryState = null) {
    const state = retryState || { rateLimitAttempts: 0, serverErrorAttempts: 0 };
    const maxRateLimitRetries = 5;
    const maxServerRetries = 3;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.hostname,
        port: this.port,
        path: this.basePath + path,
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      };
      let bodyStr = null;
      if (body !== null && body !== undefined) {
        bodyStr = typeof body === "string" ? body : JSON.stringify(body);
        options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
      }

      const retry = (newState) =>
        this.makeRequest(method, path, body, newState).then(resolve).catch(reject);

      const req = this.protocol.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          this.requestCount++;
          if (res.statusCode === 429 && state.rateLimitAttempts < maxRateLimitRetries) {
            const retryAfter = res.headers["retry-after"];
            const delay = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : Math.min(5000 * Math.pow(2, state.rateLimitAttempts), 120000);
            // eslint-disable-next-line no-console
            console.log(`  [DC Jira] 429, retrying in ${delay / 1000}s`);
            return setTimeout(() => retry({ ...state, rateLimitAttempts: state.rateLimitAttempts + 1 }), delay);
          }
          if (res.statusCode >= 500 && res.statusCode < 600 && state.serverErrorAttempts < maxServerRetries) {
            const delay = Math.min(1000 * Math.pow(2, state.serverErrorAttempts), 10000);
            // eslint-disable-next-line no-console
            console.log(`  [DC Jira] ${res.statusCode}, retrying in ${delay / 1000}s`);
            return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
          }
          if (res.statusCode === 204) return resolve(null);
          if (res.statusCode >= 400) {
            this.errorCount++;
            const e = new Error(`DC Jira ${method} ${path} → ${res.statusCode}: ${data.substring(0, 500)}`);
            e.statusCode = res.statusCode;
            return reject(e);
          }
          try { resolve(data ? JSON.parse(data) : null); }
          catch { resolve(data); }
        });
      });
      req.on("error", (err) => {
        this.errorCount++;
        if (state.serverErrorAttempts < maxServerRetries) {
          const delay = 2000 * (state.serverErrorAttempts + 1);
          // eslint-disable-next-line no-console
          console.log(`  [DC Jira] connection error: ${err.message}, retrying in ${delay / 1000}s`);
          return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
        }
        reject(err);
      });
      req.on("timeout", () => {
        req.destroy();
        if (state.serverErrorAttempts < maxServerRetries) {
          const delay = 2000 * (state.serverErrorAttempts + 1);
          // eslint-disable-next-line no-console
          console.log(`  [DC Jira] timeout, retrying in ${delay / 1000}s`);
          return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
        }
        reject(new Error(`DC Jira request timeout: ${method} ${path}`));
      });
      if (bodyStr !== null) req.write(bodyStr);
      req.end();
    });
  }

  async testConnection() {
    try {
      await this.makeRequest("GET", "/rest/api/2/myself");
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`  [DC Jira] connection test failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Search by JQL via v2 `GET /rest/api/2/search`. Pagination uses
   * `startAt`+`maxResults` and a `total` field — unchanged on DC.
   *
   * @param {string} jql
   * @param {object} opts                e.g. { fields: ["summary"], maxResults: 100 }
   * @param {Function} onPage            async (issues[]) => boolean|undefined
   */
  async searchIssuesByJql(jql, opts, onPage) {
    const fields = (opts.fields || ["summary"]).join(",");
    const expand = opts.expand ? `&expand=${encodeURIComponent(opts.expand)}` : "";
    const maxResults = opts.maxResults || 100;
    let startAt = 0;
    let total = 0;

    while (true) {
      const path = `/rest/api/2/search?jql=${encodeURIComponent(jql)}` +
        `&startAt=${startAt}&maxResults=${maxResults}&fields=${fields}${expand}`;
      const response = await this.makeRequest("GET", path);
      const issues = response.issues || [];
      if (issues.length === 0) break;

      const result = await onPage(issues);
      total += issues.length;
      if (result === false) break;

      startAt += issues.length;
      if (response.total !== undefined && startAt >= response.total) break;
      if (issues.length < maxResults) break;
    }
    return total;
  }

  async getIssue(issueKey, fields = "", expand = "") {
    const qs = new URLSearchParams();
    if (fields) qs.set("fields", fields);
    if (expand) qs.set("expand", expand);
    const tail = qs.toString();
    return await this.makeRequest(
      "GET",
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}${tail ? `?${tail}` : ""}`,
    );
  }

  async fetchCustomFields() {
    return await this.makeRequest("GET", "/rest/api/2/field");
  }

  /**
   * Build a map of `{normalizedName: { id, type }}` from DC custom
   * fields. Pair with the same map from CloudJiraClient to build a
   * `sourceFieldId → destFieldId` translation table at plan time.
   */
  async buildCustomFieldNameMap() {
    const fields = await this.fetchCustomFields();
    const map = new Map();
    for (const f of fields) {
      if (!f.custom) continue;
      const key = (f.name || "").trim().toLowerCase();
      const type = f.schema?.custom || f.schema?.type || "unknown";
      if (key) map.set(key, { id: f.id, type, name: f.name });
    }
    return map;
  }

  /**
   * DC user lookup. Returns `{ name, key, emailAddress, displayName }` — note
   * that DC users have `name` (username) and `key`, neither of which
   * survive migration to Cloud.
   */
  async findUserByUsername(username) {
    const q = encodeURIComponent(username);
    try {
      return await this.makeRequest("GET", `/rest/api/2/user?username=${q}`);
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  getStats() {
    return { requestCount: this.requestCount, errorCount: this.errorCount };
  }
}

module.exports = DatacenterJiraClient;
