"use strict";

/**
 * DatacenterConfluenceClient — zero-dep native-http(s) client for
 * Confluence Data Center / Server.
 *
 *   new DatacenterConfluenceClient("https://confluence.example.com", "admin", "password");
 *   new DatacenterConfluenceClient("https://confluence.example.com", null, null, { pat: "..." });
 *
 * Auto-selects http vs https based on the URL scheme. Same retry contract
 * as the Cloud client (separate counters for 429 / 5xx / network).
 *
 * Pagination on DC uses `start`+`limit`; a `size < limit` page signals
 * end of results. Some DC versions don't return `totalCount` reliably on
 * CQL — we always check the size signal.
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");

class DatacenterConfluenceClient {
  constructor(baseUrl, username, password, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const parsed = new URL(this.baseUrl);
    this.protocol = parsed.protocol === "https:" ? https : http;
    this.hostname = parsed.hostname;
    this.port = parsed.port || (parsed.protocol === "https:" ? 443 : 80);
    this.basePath = parsed.pathname.replace(/\/$/, "");

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
            console.log(`  [DC Confluence] 429, retrying in ${delay / 1000}s`);
            return setTimeout(() => retry({ ...state, rateLimitAttempts: state.rateLimitAttempts + 1 }), delay);
          }
          if (res.statusCode >= 500 && res.statusCode < 600 && state.serverErrorAttempts < maxServerRetries) {
            const delay = Math.min(1000 * Math.pow(2, state.serverErrorAttempts), 10000);
            // eslint-disable-next-line no-console
            console.log(`  [DC Confluence] ${res.statusCode}, retrying in ${delay / 1000}s`);
            return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
          }
          if (res.statusCode >= 400) {
            this.errorCount++;
            const e = new Error(`DC Confluence ${method} ${path} → ${res.statusCode}: ${data.substring(0, 500)}`);
            e.statusCode = res.statusCode;
            return reject(e);
          }
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      });
      req.on("error", (err) => {
        this.errorCount++;
        if (state.serverErrorAttempts < maxServerRetries) {
          const delay = 2000 * (state.serverErrorAttempts + 1);
          // eslint-disable-next-line no-console
          console.log(`  [DC Confluence] connection error: ${err.message}, retrying in ${delay / 1000}s`);
          return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
        }
        reject(err);
      });
      req.on("timeout", () => {
        req.destroy();
        if (state.serverErrorAttempts < maxServerRetries) {
          const delay = 2000 * (state.serverErrorAttempts + 1);
          // eslint-disable-next-line no-console
          console.log(`  [DC Confluence] timeout, retrying in ${delay / 1000}s`);
          return setTimeout(() => retry({ ...state, serverErrorAttempts: state.serverErrorAttempts + 1 }), delay);
        }
        reject(new Error(`DC Confluence request timeout: ${method} ${path}`));
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
      console.error(`  [DC Confluence] connection test failed: ${err.message}`);
      return false;
    }
  }

  async searchContentByCql(cql, expand = "body.storage,version,space", onPage) {
    const encoded = encodeURIComponent(cql);
    let startAt = 0;
    const limit = 25;
    let total = 0;

    while (true) {
      const path = `/rest/api/content/search?cql=${encoded}&expand=${expand}&limit=${limit}&start=${startAt}`;
      let response;
      try { response = await this.makeRequest("GET", path); }
      catch (err) {
        if (err.statusCode === 400) {
          // eslint-disable-next-line no-console
          console.log(`  [DC Confluence] CQL 400, stopping. CQL: ${cql}`);
          return total;
        }
        throw err;
      }

      const results = response.results || [];
      if (results.length === 0) break;

      const result = await onPage(results);
      total += results.length;
      if (result === false) break;

      startAt += results.length;
      const size = response.size || 0;
      if (size > 0 && size < limit) break;
      if (startAt >= 100000) {
        // eslint-disable-next-line no-console
        console.log(`  [DC Confluence] reached pagination safety limit`);
        break;
      }
    }
    return total;
  }

  async getPageContent(pageId) {
    return await this.makeRequest(
      "GET",
      `/rest/api/content/${pageId}?expand=body.storage,version,space`,
    );
  }

  async getAllSpaces() {
    const spaces = [];
    let startAt = 0;
    const limit = 100;
    while (true) {
      const response = await this.makeRequest("GET", `/rest/api/space?limit=${limit}&start=${startAt}`);
      const results = response.results || [];
      if (results.length === 0) break;
      for (const s of results) spaces.push({ key: s.key, name: s.name });
      if (results.length < limit) break;
      startAt += results.length;
    }
    return spaces;
  }

  getStats() {
    return { requestCount: this.requestCount, errorCount: this.errorCount };
  }
}

module.exports = DatacenterConfluenceClient;
