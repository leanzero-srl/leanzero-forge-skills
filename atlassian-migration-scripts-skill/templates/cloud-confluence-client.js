"use strict";

/**
 * CloudConfluenceClient — zero-dep native-https client for Confluence Cloud.
 *
 *   const cf = new CloudConfluenceClient(
 *     "https://your-site.atlassian.net/wiki",   // include /wiki
 *     "you@example.com",
 *     process.env.CLOUD_API_TOKEN,
 *   );
 *
 * Supports both API surfaces:
 *   - v1: /rest/api/...                CQL search, storage-format bodies (legacy but reliable)
 *   - v2: /api/v2/...                   cursor pagination via Link header (faster, but newer)
 *
 * Use v2 for new code (`getPagesV2`, `getPageByIdV2`). Use v1 (`searchContentByCql`)
 * when you need CQL or the storage representation of page bodies for
 * surgical XHTML rewrites.
 *
 * Version conflicts on PUT (HTTP 409) are auto-retried once: the client
 * re-fetches the page, bumps to the new version, and replays the write.
 */

const https = require("https");
const { URL } = require("url");

function buildBasic(email, apiToken) {
  const t = (apiToken || "").trim();
  if (/^[A-Za-z0-9+/]+=*$/.test(t) && t.length % 4 === 0) {
    try {
      const decoded = Buffer.from(t, "base64").toString("utf8");
      if (decoded.includes(":")) return t;
    } catch { /* fall through */ }
  }
  return Buffer.from(`${email}:${t}`).toString("base64");
}

class CloudConfluenceClient {
  /**
   * @param {string} baseUrl   e.g. "https://your-site.atlassian.net/wiki"
   * @param {string} email
   * @param {string} apiToken
   */
  constructor(baseUrl, email, apiToken) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const parsed = new URL(this.baseUrl);
    this.hostname = parsed.hostname;
    this.basePath = parsed.pathname.replace(/\/$/, ""); // typically "/wiki"
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

          if (res.statusCode === 429) {
            this.rateLimitCount++;
            if (state.rateLimitAttempts >= maxRateLimitRetries) {
              const e = new Error(`Confluence rate-limited after ${maxRateLimitRetries} retries: ${method} ${path}`);
              e.statusCode = 429;
              e.isRateLimit = true;
              return reject(e);
            }
            const retryAfter = res.headers["retry-after"];
            const delay = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : Math.min(5000 * Math.pow(2, state.rateLimitAttempts), 60000);
            // eslint-disable-next-line no-console
            console.log(`  [Cloud Confluence] 429, waiting ${delay / 1000}s`);
            return setTimeout(() => retry({ ...state, rateLimitAttempts: state.rateLimitAttempts + 1 }), delay);
          }

          if (res.statusCode >= 500 && res.statusCode < 600 && state.serverErrorAttempts < maxServerRetries) {
            const delay = Math.min(1000 * Math.pow(2, state.serverErrorAttempts), 10000);
            // eslint-disable-next-line no-console
            console.log(`  [Cloud Confluence] ${res.statusCode}, retrying in ${delay / 1000}s`);
            return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
          }

          if (res.statusCode === 204) return resolve(null);

          if (res.statusCode >= 400) {
            this.errorCount++;
            const e = new Error(`Confluence ${method} ${path} → ${res.statusCode}: ${data.substring(0, 500)}`);
            e.statusCode = res.statusCode;
            e.responseLink = res.headers["link"] || null;
            return reject(e);
          }

          try {
            const parsed = data ? JSON.parse(data) : null;
            if (parsed && typeof parsed === "object") {
              // Expose the v2 Link header on the response so callers can paginate.
              Object.defineProperty(parsed, "_linkHeader", {
                value: res.headers["link"] || null,
                enumerable: false,
              });
            }
            resolve(parsed);
          } catch {
            resolve(data);
          }
        });
      });

      req.on("error", (err) => {
        this.errorCount++;
        if (state.serverErrorAttempts < maxServerRetries) {
          const delay = 2000 * (state.serverErrorAttempts + 1);
          // eslint-disable-next-line no-console
          console.log(`  [Cloud Confluence] connection error: ${err.message}, retrying in ${delay / 1000}s`);
          return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
        }
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        if (state.serverErrorAttempts < maxServerRetries) {
          const delay = 2000 * (state.serverErrorAttempts + 1);
          // eslint-disable-next-line no-console
          console.log(`  [Cloud Confluence] timeout, retrying in ${delay / 1000}s`);
          return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
        }
        reject(new Error(`Confluence request timeout: ${method} ${path}`));
      });

      if (bodyStr !== null) req.write(bodyStr);
      req.end();
    });
  }

  async testConnection() {
    try {
      await this.makeRequest("GET", "/rest/api/space?limit=1");
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`  [Cloud Confluence] connection test failed: ${err.message}`);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────
  //  V1 — CQL search (cursor pagination via _links.next)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Paginated CQL search via /rest/api/content/search.
   *
   * Cloud's v1 CQL endpoint returns a relative URL at `_links.next`. The
   * legacy `start=N` pagination is unreliable for large result sets
   * (it can loop). We follow `_links.next` when present, and dedupe by
   * content ID as a safety belt.
   *
   * @param {string} cql
   * @param {string} expand    fields to expand (default: body.storage,version,space)
   * @param {Function} onPage  async (results[]) => boolean|undefined — return false to stop
   * @returns {number} total fresh results processed
   */
  async searchContentByCql(cql, expand = "body.storage,version,space", onPage) {
    const encoded = encodeURIComponent(cql);
    const limit = 50;
    const seen = new Set();
    let totalFound = 0;
    let nextPath = `/rest/api/content/search?cql=${encoded}&expand=${expand}&limit=${limit}`;
    let pageCount = 0;
    const maxPages = 5000;

    while (nextPath && pageCount < maxPages) {
      pageCount++;
      let response;
      try {
        response = await this.makeRequest("GET", nextPath);
      } catch (err) {
        if (err.statusCode === 400) {
          // eslint-disable-next-line no-console
          console.log(`  [Cloud Confluence] CQL 400, stopping. CQL: ${cql}`);
          return totalFound;
        }
        throw err;
      }

      const results = response.results || [];
      if (results.length === 0) break;

      const fresh = results.filter((r) => {
        const id = r.id || r.content?.id;
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      if (fresh.length === 0) {
        // Pagination loop detected — stop.
        // eslint-disable-next-line no-console
        console.log(`  [Cloud Confluence] pagination returned only duplicates on page ${pageCount}; stopping.`);
        break;
      }

      const pageResult = await onPage(fresh);
      totalFound += fresh.length;
      if (pageResult === false) break;

      const nextLink = response._links?.next;
      if (nextLink) {
        nextPath = nextLink.startsWith(this.basePath)
          ? nextLink.substring(this.basePath.length)
          : nextLink;
      } else {
        const size = response.size || results.length;
        if (size < limit) break;
        const url = new URL(`https://x${nextPath}`);
        const curStart = parseInt(url.searchParams.get("start") || "0", 10);
        url.searchParams.set("start", String(curStart + results.length));
        nextPath = url.pathname + url.search;
      }
    }

    return totalFound;
  }

  // ──────────────────────────────────────────────────────────────────
  //  V2 — pages list (cursor pagination via Link header)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Confluence v2 page listing. Pagination uses the `Link` header
   * (`<…rel="next"…>`) and the response's `_links.next` for compatibility.
   *
   * Note: v2 paths are under `/api/v2/...`, not `/rest/api/...`.
   *
   * @param {object} query        e.g. { "space-id": "12345", limit: 250 }
   * @param {Function} onPage     async (results[]) => boolean|undefined
   */
  async getPagesV2(query, onPage) {
    const qs = new URLSearchParams(query).toString();
    let next = `/api/v2/pages?${qs}`;
    let total = 0;
    let pageCount = 0;
    const maxPages = 5000;

    while (next && pageCount < maxPages) {
      pageCount++;
      const response = await this.makeRequest("GET", next);
      const results = response.results || [];
      if (results.length === 0) break;

      const result = await onPage(results);
      total += results.length;
      if (result === false) break;

      // Prefer the response's _links.next; fall back to the Link header.
      let nextHref = response._links?.next || null;
      if (!nextHref && response._linkHeader) {
        const m = String(response._linkHeader).match(/<([^>]+)>\s*;\s*rel="next"/);
        nextHref = m ? m[1] : null;
      }
      if (!nextHref) break;
      next = nextHref.startsWith(this.basePath)
        ? nextHref.substring(this.basePath.length)
        : nextHref;
    }

    return total;
  }

  async getPageByIdV2(pageId, bodyFormat = "atlas_doc_format") {
    const qs = bodyFormat ? `?body-format=${bodyFormat}` : "";
    return await this.makeRequest("GET", `/api/v2/pages/${pageId}${qs}`);
  }

  // ──────────────────────────────────────────────────────────────────
  //  V1 — page read/write (storage + ADF)
  // ──────────────────────────────────────────────────────────────────

  async getPageStorage(pageId) {
    return await this.makeRequest(
      "GET",
      `/rest/api/content/${pageId}?expand=body.storage,version,space`,
    );
  }

  async getPageAdf(pageId) {
    return await this.makeRequest(
      "GET",
      `/rest/api/content/${pageId}?expand=body.atlas_doc_format,version,space`,
    );
  }

  /**
   * Update a page using the storage (XHTML) representation. Handles 409
   * version conflicts by re-fetching and replaying once.
   *
   * @param {string|number} pageId
   * @param {string} title
   * @param {string} type            e.g. "page" / "blogpost"
   * @param {string} storageXml
   * @param {number} currentVersion
   * @param {string} versionMessage
   * @returns {Promise<{success: boolean, error: string|null, newVersion: number|null}>}
   */
  async updatePageStorage(pageId, title, type, storageXml, currentVersion, versionMessage) {
    const payload = {
      id: String(pageId),
      type: type || "page",
      title,
      body: { storage: { value: storageXml, representation: "storage" } },
      version: { number: currentVersion + 1, message: versionMessage || "Migration script update" },
    };
    const newVersionFrom = (resp) => resp?.version?.number ?? payload.version.number;

    try {
      const resp = await this.makeRequest("PUT", `/rest/api/content/${pageId}`, payload);
      return { success: true, error: null, newVersion: newVersionFrom(resp) };
    } catch (err) {
      if (err.statusCode === 409) {
        try {
          const page = await this.getPageStorage(pageId);
          payload.version.number = page.version.number + 1;
          const resp = await this.makeRequest("PUT", `/rest/api/content/${pageId}`, payload);
          return { success: true, error: null, newVersion: newVersionFrom(resp) };
        } catch (retryErr) {
          return { success: false, error: `Version conflict retry failed: ${retryErr.message}`, newVersion: null };
        }
      }
      return { success: false, error: err.message, newVersion: null };
    }
  }

  /**
   * Update a page using the ADF (atlas_doc_format) representation. Same
   * 409 retry contract as updatePageStorage.
   *
   * @param {string|number} pageId
   * @param {string} title
   * @param {string} type
   * @param {object} adf              ADF document object (will be JSON.stringify'd)
   * @param {number} currentVersion
   * @param {string} versionMessage
   */
  async updatePageAdf(pageId, title, type, adf, currentVersion, versionMessage) {
    const payload = {
      id: String(pageId),
      type: type || "page",
      title,
      body: { atlas_doc_format: { value: JSON.stringify(adf), representation: "atlas_doc_format" } },
      version: { number: currentVersion + 1, message: versionMessage || "Migration script update" },
    };
    const newVersionFrom = (resp) => resp?.version?.number ?? payload.version.number;

    try {
      const resp = await this.makeRequest("PUT", `/rest/api/content/${pageId}`, payload);
      return { success: true, error: null, newVersion: newVersionFrom(resp) };
    } catch (err) {
      if (err.statusCode === 409) {
        try {
          const page = await this.getPageAdf(pageId);
          payload.version.number = page.version.number + 1;
          const resp = await this.makeRequest("PUT", `/rest/api/content/${pageId}`, payload);
          return { success: true, error: null, newVersion: newVersionFrom(resp) };
        } catch (retryErr) {
          return { success: false, error: `Version conflict retry failed: ${retryErr.message}`, newVersion: null };
        }
      }
      return { success: false, error: err.message, newVersion: null };
    }
  }

  /**
   * Restore a prior page version atomically. Confluence creates a new
   * version that's a copy of the specified historical version.
   *
   *   POST /wiki/rest/api/content/{id}/version
   *   { "operationKey": "RESTORE", "params": { "versionNumber": N, "message": "..." } }
   *
   * This is the recommended rollback mechanism — atomic, audited.
   */
  async restoreVersion(pageId, prevVersionNumber, message) {
    const payload = {
      operationKey: "RESTORE",
      params: { versionNumber: prevVersionNumber, message: message || `Restore version ${prevVersionNumber}` },
    };
    try {
      await this.makeRequest("POST", `/rest/api/content/${pageId}/version`, payload);
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────────────────────────
  //  USERS / GROUPS (identity resolution support)
  // ──────────────────────────────────────────────────────────────────

  async searchUsers(query, limit = 10) {
    const safe = String(query).replace(/"/g, '\\"');
    const cql = `type=user AND user.fullname~"${safe}"`;
    const encoded = encodeURIComponent(cql);
    try {
      const response = await this.makeRequest("GET", `/rest/api/search?cql=${encoded}&limit=${limit}`);
      const results = response.results || [];
      return results.map((r) => r.user || r).filter((u) => u && u.accountId);
    } catch (err) {
      if (err.statusCode === 400) return [];
      throw err;
    }
  }

  /**
   * Look up a group by exact (case-insensitive) name via the picker.
   * The legacy `/rest/api/group/by-name` was removed (returns 410).
   */
  async getGroupByName(groupName) {
    const encoded = encodeURIComponent(groupName);
    try {
      const response = await this.makeRequest("GET", `/rest/api/group/picker?query=${encoded}&limit=200`);
      const results = (response && response.results) || [];
      const target = groupName.toLowerCase();
      const exact = results.find((g) => (g.name || "").toLowerCase() === target);
      if (!exact) return null;
      return { id: exact.id, name: exact.name, type: exact.usageType || "group" };
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      rateLimitCount: this.rateLimitCount,
    };
  }
}

module.exports = CloudConfluenceClient;
