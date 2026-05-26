"use strict";

/**
 * CloudJiraClient — zero-dep native-https client for Jira Cloud REST v3.
 *
 *   const jira = new CloudJiraClient(
 *     "https://your-site.atlassian.net",
 *     "you@example.com",
 *     process.env.CLOUD_API_TOKEN,
 *   );
 *
 * The client owns three independent retry counters per request:
 *   - rateLimitAttempts:   triggered by 429; honors `Retry-After`, exp-backoff to 60s, max 3
 *   - serverErrorAttempts: triggered by 5xx; exp-backoff to 10s, max 3
 *   - serverErrorAttempts: also drives network/timeout retries (linear backoff, max 3)
 *
 * On 4xx (except 429), the client rejects with a tagged error
 * (`error.statusCode`) so callers can distinguish bug-in-payload from
 * transient failures.
 *
 * Pagination uses the post-Aug-1-2025 API: `POST /rest/api/3/search/jql`
 * with `nextPageToken`. There is no `total` field — count as you go.
 *
 * Bulk endpoints:
 *   - searchIssuesByJql:      pagination via nextPageToken
 *   - bulkFetchIssues:        POST /rest/api/3/issue/bulkfetch (≤100 keys per call)
 *   - bulkFetchChangelogs:    POST /rest/api/3/changelog/bulkfetch (≤100)
 *   - bulkCreateIssues:       POST /rest/api/3/issue/bulk (≤50 issues per call)
 *
 * March 2026 rate-limit headers (Beta- prefix drops on enforcement):
 *   - Retry-After
 *   - X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset
 */

const https = require("https");
const { URL } = require("url");

function buildBasic(email, apiToken) {
  const t = (apiToken || "").trim();
  // If CLOUD_API_TOKEN is already "email:token" base64-encoded, accept it.
  if (/^[A-Za-z0-9+/]+=*$/.test(t) && t.length % 4 === 0) {
    try {
      const decoded = Buffer.from(t, "base64").toString("utf8");
      if (decoded.includes(":")) return t;
    } catch { /* fall through */ }
  }
  return Buffer.from(`${email}:${t}`).toString("base64");
}

class CloudJiraClient {
  constructor(baseUrl, email, apiToken) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const parsed = new URL(this.baseUrl);
    this.hostname = parsed.hostname;
    this.basePath = parsed.pathname.replace(/\/$/, "");
    this.authHeader = "Basic " + buildBasic(email, apiToken);

    this.requestCount = 0;
    this.errorCount = 0;
    this.rateLimitCount = 0;
  }

  // ──────────────────────────────────────────────────────────────────
  //  Core request with retry state machine
  // ──────────────────────────────────────────────────────────────────

  makeRequest(method, path, body = null, retryState = null) {
    const state = retryState || { rateLimitAttempts: 0, serverErrorAttempts: 0 };
    const maxRateLimitRetries = 3;
    const maxServerRetries = 3;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.hostname,
        port: 443,
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

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          this.requestCount++;

          // 429: honor Retry-After, exp-backoff fallback to 60s
          if (res.statusCode === 429) {
            this.rateLimitCount++;
            if (state.rateLimitAttempts >= maxRateLimitRetries) {
              const e = new Error(
                `Jira rate-limited after ${maxRateLimitRetries} retries: ${method} ${path}`,
              );
              e.statusCode = 429;
              e.isRateLimit = true;
              return reject(e);
            }
            const retryAfter = res.headers["retry-after"];
            const delay = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : Math.min(5000 * Math.pow(2, state.rateLimitAttempts), 60000);
            // eslint-disable-next-line no-console
            console.log(`  [Cloud Jira] 429, waiting ${delay / 1000}s (attempt ${state.rateLimitAttempts + 1}/${maxRateLimitRetries})`);
            return setTimeout(
              () => retry({ ...state, rateLimitAttempts: state.rateLimitAttempts + 1 }),
              delay,
            );
          }

          // 5xx: exp-backoff to 10s
          if (res.statusCode >= 500 && res.statusCode < 600 && state.serverErrorAttempts < maxServerRetries) {
            const delay = Math.min(1000 * Math.pow(2, state.serverErrorAttempts), 10000);
            // eslint-disable-next-line no-console
            console.log(`  [Cloud Jira] ${res.statusCode}, retrying in ${delay / 1000}s (attempt ${state.serverErrorAttempts + 1}/${maxServerRetries})`);
            return setTimeout(
              () => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }),
              delay,
            );
          }

          if (res.statusCode === 204) return resolve(null);

          if (res.statusCode >= 400) {
            this.errorCount++;
            const e = new Error(
              `Jira ${method} ${path} → ${res.statusCode}: ${data.substring(0, 500)}`,
            );
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
          console.log(`  [Cloud Jira] connection error: ${err.message}, retrying in ${delay / 1000}s`);
          return setTimeout(
            () => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }),
            delay,
          );
        }
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        if (state.serverErrorAttempts < maxServerRetries) {
          const delay = 2000 * (state.serverErrorAttempts + 1);
          // eslint-disable-next-line no-console
          console.log(`  [Cloud Jira] timeout, retrying in ${delay / 1000}s`);
          return setTimeout(
            () => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }),
            delay,
          );
        }
        reject(new Error(`Jira request timeout: ${method} ${path}`));
      });

      if (bodyStr !== null) req.write(bodyStr);
      req.end();
    });
  }

  async testConnection() {
    try {
      await this.makeRequest("GET", "/rest/api/3/myself");
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`  [Cloud Jira] connection test failed: ${err.message}`);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────
  //  ISSUE SEARCH — post-Aug 2025 API (nextPageToken, no `total`)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Paginate `POST /rest/api/3/search/jql` via `nextPageToken`.
   * Calls `onPage(issues)` for each page; if the callback returns
   * `false`, pagination stops.
   *
   *   await jira.searchIssuesByJql(
   *     'project = ABC AND status != "Done"',
   *     { fields: ["summary", "status"], maxResults: 100 },
   *     async (issues) => { for (const i of issues) ...; }
   *   );
   *
   * The new API does NOT return `total`. Track progress via elapsed time
   * or processed count, not percentage.
   */
  async searchIssuesByJql(jql, opts, onPage) {
    const body = {
      jql,
      fields: opts.fields || ["*navigable"],
      expand: opts.expand,
      maxResults: opts.maxResults || 100,
    };
    let total = 0;
    let pageToken = undefined;

    while (true) {
      if (pageToken) body.nextPageToken = pageToken; else delete body.nextPageToken;

      const response = await this.makeRequest("POST", "/rest/api/3/search/jql", body);
      const issues = response.issues || [];
      if (issues.length === 0) break;

      const result = await onPage(issues);
      total += issues.length;

      if (result === false) break;
      if (!response.nextPageToken) break;
      pageToken = response.nextPageToken;
    }
    return total;
  }

  /**
   * Bulk-fetch up to 100 issues at once. Returns the raw response
   * (`{ issues, expand }`); callers typically index by `issue.key`.
   */
  async bulkFetchIssues(issueIdsOrKeys, fields = ["*all"], expand = []) {
    const out = [];
    for (let i = 0; i < issueIdsOrKeys.length; i += 100) {
      const batch = issueIdsOrKeys.slice(i, i + 100);
      const response = await this.makeRequest("POST", "/rest/api/3/issue/bulkfetch", {
        issueIdsOrKeys: batch,
        fields,
        expand,
      });
      out.push(...(response.issues || []));
    }
    return out;
  }

  /**
   * Approximate issue count for a JQL. One call, ~1 point, no pagination.
   * Returns a number; throws if Atlassian's response shape is unexpected.
   *
   * Useful for population checks, empty-project detection, budgeting,
   * field-population audits. See `docs/17-post-jcma-audit-endpoints.md`.
   *
   * The endpoint's response key has shipped under several names over
   * different Cloud rollouts — try each known name and the first
   * `data.count` nested shape before giving up.
   */
  async approximateCount(jql) {
    const data = await this.makeRequest(
      "POST", "/rest/api/3/search/approximate-count", { jql },
    );
    const keys = ["count", "issueCount", "approximateIssueCount", "approximate_count", "total"];
    for (const k of keys) {
      if (typeof data?.[k] === "number") return data[k];
    }
    if (typeof data?.data?.count === "number") return data.data.count;
    throw new Error(`approximate-count: unexpected shape — ${JSON.stringify(data).slice(0, 400)}`);
  }

  async bulkFetchChangelogs(issueIdsOrKeys) {
    const out = [];
    for (let i = 0; i < issueIdsOrKeys.length; i += 100) {
      const batch = issueIdsOrKeys.slice(i, i + 100);
      const response = await this.makeRequest("POST", "/rest/api/3/changelog/bulkfetch", {
        issueIdsOrKeys: batch,
      });
      out.push(...(response.issueChangeLogs || []));
    }
    return out;
  }

  /**
   * Bulk-create up to 50 issues in one call. `issueUpdates[]` payloads
   * are the same shape as a single create — `{ fields: {...} }`.
   */
  async bulkCreateIssues(issueUpdates) {
    const out = { issues: [], errors: [] };
    for (let i = 0; i < issueUpdates.length; i += 50) {
      const batch = issueUpdates.slice(i, i + 50);
      const response = await this.makeRequest("POST", "/rest/api/3/issue/bulk", {
        issueUpdates: batch,
      });
      out.issues.push(...(response.issues || []));
      out.errors.push(...(response.errors || []));
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────
  //  ISSUE UPDATE — version-aware writes
  // ──────────────────────────────────────────────────────────────────

  /**
   * Issue update via `PUT /rest/api/3/issue/{key}`. Returns
   * `{ success, error, isRateLimit }`.
   *
   * The payload follows the `{ fields: {...}, update: {...} }` shape;
   * for ADF fields like `description` or comments, ALWAYS send the full
   * ADF document (no `add`-only ops).
   */
  async updateIssue(issueKey, payload) {
    try {
      await this.makeRequest("PUT", `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, payload);
      return { success: true, error: null, isRateLimit: false };
    } catch (err) {
      return { success: false, error: err.message, isRateLimit: !!err.isRateLimit };
    }
  }

  async getIssue(issueKey, fields = "*all", expand = "") {
    const qs = new URLSearchParams();
    if (fields) qs.set("fields", fields);
    if (expand) qs.set("expand", expand);
    return await this.makeRequest(
      "GET",
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?${qs.toString()}`,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  //  CUSTOM FIELDS
  // ──────────────────────────────────────────────────────────────────

  async fetchCustomFields() {
    const all = [];
    let startAt = 0;
    const maxResults = 100;
    while (true) {
      const response = await this.makeRequest(
        "GET",
        `/rest/api/3/field/search?type=custom&startAt=${startAt}&maxResults=${maxResults}&expand=key`,
      );
      const values = response.values || [];
      all.push(...values);
      if (response.isLast || values.length === 0) break;
      startAt += values.length;
    }
    return all;
  }

  /**
   * Build a map of `{normalizedName: { id, type }}` for matching custom
   * fields by display name + type at plan time. Both source and dest
   * call this; then build `sourceId → destId` mapping.
   */
  async buildCustomFieldNameMap() {
    const fields = await this.fetchCustomFields();
    const map = new Map();
    for (const f of fields) {
      const key = (f.name || "").trim().toLowerCase();
      const type = f.schema?.custom || f.schema?.type || "unknown";
      if (key) map.set(key, { id: f.id, type, name: f.name });
    }
    return map;
  }

  // ──────────────────────────────────────────────────────────────────
  //  USERS / GROUPS (identity resolution support)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Search Cloud users — used by IdentityResolver. Returns array of
   * `{ accountId, emailAddress, displayName, active }`.
   */
  async searchUsers(query) {
    const q = encodeURIComponent(query);
    const response = await this.makeRequest("GET", `/rest/api/3/user/search?query=${q}&maxResults=50`);
    return Array.isArray(response) ? response : [];
  }

  async getGroupByName(groupName) {
    const q = encodeURIComponent(groupName);
    try {
      const response = await this.makeRequest("GET", `/rest/api/3/group?groupname=${q}`);
      if (response && (response.groupId || response.name)) {
        return { id: response.groupId || null, name: response.name };
      }
      return null;
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Bulk user lookup by accountId. The endpoint takes repeated
   * `accountId=...` query params, max 90 per call.
   */
  async bulkGetUsers(accountIds) {
    const out = [];
    for (let i = 0; i < accountIds.length; i += 90) {
      const batch = accountIds.slice(i, i + 90);
      const qs = batch.map((id) => `accountId=${encodeURIComponent(id)}`).join("&");
      const response = await this.makeRequest("GET", `/rest/api/3/user/bulk?${qs}`);
      out.push(...(response.values || []));
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────
  //  ATTACHMENTS
  // ──────────────────────────────────────────────────────────────────

  /**
   * Upload an attachment via multipart/form-data.
   *
   * MUST send header `X-Atlassian-Token: no-check` or Jira's CSRF
   * filter rejects the request with 403.
   *
   * @param {string} issueKey
   * @param {string} filename
   * @param {Buffer} contents
   * @returns {Promise<object[]>} created attachment objects
   */
  uploadAttachment(issueKey, filename, contents) {
    const boundary = "----migration" + Math.random().toString(16).slice(2);
    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, "")}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, contents, tail]);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.hostname,
        port: 443,
        path: this.basePath + `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          "X-Atlassian-Token": "no-check", // CSRF — required
        },
        timeout: 60000,
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          this.requestCount++;
          if (res.statusCode >= 400) {
            const e = new Error(`Attachment upload ${issueKey} → ${res.statusCode}: ${data.substring(0, 500)}`);
            e.statusCode = res.statusCode;
            return reject(e);
          }
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      rateLimitCount: this.rateLimitCount,
    };
  }
}

module.exports = CloudJiraClient;
