"use strict";

/**
 * IdentityResolver — map any Data Center user/group token to a Cloud
 * `accountId` / `groupId`. Handles four source token types and negative
 * caching to avoid retry loops on unresolvable identities.
 *
 * Strategy, in priority order:
 *   1. Cloud accountId passthrough — if the token is already a 24+ char
 *      hex-shaped accountId (e.g. `557058:f5fcdba9-...`), return it as-is.
 *   2. Manual CSV override (`--user-mapping users.csv` / `--group-mapping groups.csv`)
 *   3. On-disk cache (`logs/cache_users.json`, `logs/cache_groups.json`)
 *      — includes negative entries (`null`) so we don't re-query
 *      unresolvable tokens on every run.
 *   4. Email lookup (preferred — emails *usually* survive migrations)
 *   5. Display-name search (last resort — ambiguous; may return multi-match)
 *
 * Supported source token types:
 *   - Cloud accountId (kept as-is)
 *   - Email address ("alice@example.com")
 *   - DC username / displayName ("alice")
 *   - Legacy DC userkey ("jirauser80900") — usually unresolvable, falls back to override CSV
 *
 * Usage:
 *
 *   const resolver = new IdentityResolver(cloudClient, {
 *     cacheDir: "logs",
 *     userMappingCsv: "users.csv",
 *     groupMappingCsv: "groups.csv",
 *   });
 *
 *   const u = await resolver.resolveUser({
 *     accountId: maybeNullAlready,                     // returned as-is if set
 *     email: "alice@example.com",
 *     displayName: "Alice Smith",
 *     userKey: "alice123",                              // optional, used for CSV/cache lookup
 *   });
 *   // → { accountId, source: "passthrough|override|cache|email|displayName|miss",
 *   //     multiMatch?, negativeCached? }
 *
 *   // Or — single-token convenience for legacy code paths
 *   const u2 = await resolver.resolveUserToken("alice@example.com");
 *
 * The client must implement:
 *   - searchUsers(query) → [{ accountId, emailAddress, displayName }, ...]
 *   - getGroupByName(name) → { id, name } | null
 */

const fs = require("fs");
const path = require("path");

// Cloud accountIds look like: 557058:f5fcdba9-1234-... (24+ chars, with a colon)
const ACCOUNT_ID_RE = /^[0-9a-f]{1,8}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readCsvOverride(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return new Map();
  const text = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return new Map();

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const out = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const row = {};
    header.forEach((h, idx) => (row[h] = cols[idx] || ""));
    // accept multiple key column names
    const key = (row.source || row.email || row.name || row.username || row.userkey || "").toLowerCase();
    const dest = row.dest || row.accountid || row.groupid || "";
    if (key && dest) out.set(key, dest);
  }
  return out;
}

class IdentityResolver {
  constructor(cloudClient, opts = {}) {
    this.cloud = cloudClient;
    this.cacheDir = opts.cacheDir || "logs";
    this.userCacheFile = path.join(this.cacheDir, "cache_users.json");
    this.groupCacheFile = path.join(this.cacheDir, "cache_groups.json");
    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });

    this.userOverrides = readCsvOverride(opts.userMappingCsv);
    this.groupOverrides = readCsvOverride(opts.groupMappingCsv);

    this.userCache = this._loadCache(this.userCacheFile);
    this.groupCache = this._loadCache(this.groupCacheFile);

    // negativeCache stores keys we couldn't resolve, so we don't re-query
    // every run. Stored as { key: "miss" } in the same file as positive entries.
    this.negativeCacheEnabled = opts.negativeCache !== false;

    this.stats = {
      userHits: 0, userMisses: 0, userPassthrough: 0, userNegCacheHits: 0,
      groupHits: 0, groupMisses: 0, groupNegCacheHits: 0,
    };
  }

  _loadCache(file) {
    if (!fs.existsSync(file)) return {};
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return {}; }
  }

  _saveCache(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
    catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`  [resolver] cache save failed: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  //  USERS
  // ──────────────────────────────────────────────────────────────────

  /**
   * Resolve any user-identifier shape to a Cloud accountId.
   *
   * @param {{accountId?: string, email?: string|null, displayName?: string|null, userKey?: string|null}} src
   * @returns {Promise<{accountId: string|null, source: string, multiMatch?: boolean, negativeCached?: boolean}>}
   */
  async resolveUser(src) {
    // 1. accountId passthrough
    if (src.accountId && ACCOUNT_ID_RE.test(src.accountId)) {
      this.stats.userPassthrough++;
      return { accountId: src.accountId, source: "passthrough" };
    }
    if (src.accountId && typeof src.accountId === "string" && src.accountId.includes(":")) {
      // Looser shape — Cloud accountIds vary, so accept anything with a `:` and length ≥ 20.
      if (src.accountId.length >= 20) {
        this.stats.userPassthrough++;
        return { accountId: src.accountId, source: "passthrough" };
      }
    }

    const emailKey = (src.email || "").toLowerCase();
    const displayKey = (src.displayName || "").toLowerCase();
    const userKeyLc = (src.userKey || "").toLowerCase();

    // 2. CSV override — try all available keys in priority order
    for (const k of [emailKey, displayKey, userKeyLc]) {
      if (k && this.userOverrides.has(k)) {
        return { accountId: this.userOverrides.get(k), source: "override" };
      }
    }

    // 3. Cache (positive AND negative)
    const cacheKey = emailKey || displayKey || userKeyLc;
    if (cacheKey && Object.prototype.hasOwnProperty.call(this.userCache, cacheKey)) {
      const cached = this.userCache[cacheKey];
      if (cached === null || cached === "__neg__") {
        this.stats.userNegCacheHits++;
        return { accountId: null, source: "neg-cache", negativeCached: true };
      }
      this.stats.userHits++;
      return { accountId: cached, source: "cache" };
    }

    // 4. Email lookup
    if (src.email) {
      const matches = await this.cloud.searchUsers(src.email).catch(() => []);
      const byEmail = matches.find((u) => (u.emailAddress || "").toLowerCase() === emailKey);
      if (byEmail && byEmail.accountId) {
        this.userCache[cacheKey] = byEmail.accountId;
        this._saveCache(this.userCacheFile, this.userCache);
        return { accountId: byEmail.accountId, source: "email" };
      }
    }

    // 5. Display-name lookup (ambiguous if more than one exact match)
    if (src.displayName) {
      const matches = await this.cloud.searchUsers(src.displayName).catch(() => []);
      const exact = matches.filter((u) => (u.displayName || "").toLowerCase() === displayKey);
      if (exact.length === 1 && exact[0].accountId) {
        this.userCache[cacheKey] = exact[0].accountId;
        this._saveCache(this.userCacheFile, this.userCache);
        return { accountId: exact[0].accountId, source: "displayName" };
      }
      if (exact.length > 1) {
        // Don't negative-cache multi-matches — the override CSV can fix them.
        return { accountId: null, source: "displayName", multiMatch: true };
      }
    }

    // Record negative cache so we don't keep retrying
    this.stats.userMisses++;
    if (this.negativeCacheEnabled && cacheKey) {
      this.userCache[cacheKey] = "__neg__";
      this._saveCache(this.userCacheFile, this.userCache);
    }
    return { accountId: null, source: "miss" };
  }

  /**
   * Convenience: resolve a single token whose shape isn't known. Auto-detects:
   *   - accountId shape  → passthrough
   *   - "@" → email
   *   - everything else → displayName
   */
  async resolveUserToken(token) {
    if (!token) return { accountId: null, source: "miss" };
    if (ACCOUNT_ID_RE.test(token) || (token.includes(":") && token.length >= 20)) {
      return this.resolveUser({ accountId: token });
    }
    if (token.includes("@")) {
      return this.resolveUser({ email: token });
    }
    return this.resolveUser({ displayName: token });
  }

  // ──────────────────────────────────────────────────────────────────
  //  GROUPS
  // ──────────────────────────────────────────────────────────────────

  async resolveGroup(groupName) {
    const key = (groupName || "").toLowerCase();
    if (!key) return { groupId: null, source: "miss" };

    if (this.groupOverrides.has(key)) {
      return { groupId: this.groupOverrides.get(key), source: "override" };
    }

    if (Object.prototype.hasOwnProperty.call(this.groupCache, key)) {
      const cached = this.groupCache[key];
      if (cached === null || cached === "__neg__") {
        this.stats.groupNegCacheHits++;
        return { groupId: null, source: "neg-cache", negativeCached: true };
      }
      this.stats.groupHits++;
      return { groupId: cached, source: "cache" };
    }

    const found = await this.cloud.getGroupByName(groupName).catch(() => null);
    if (found && found.id) {
      this.groupCache[key] = found.id;
      this._saveCache(this.groupCacheFile, this.groupCache);
      return { groupId: found.id, source: "lookup" };
    }

    this.stats.groupMisses++;
    if (this.negativeCacheEnabled) {
      this.groupCache[key] = "__neg__";
      this._saveCache(this.groupCacheFile, this.groupCache);
    }
    return { groupId: null, source: "miss" };
  }

  /**
   * Forget a single cached entry. Useful when an operator adds a CSV
   * override for a previously-unresolvable user and wants the next run
   * to consult the override rather than the negative cache.
   */
  forgetUser(key) {
    delete this.userCache[(key || "").toLowerCase()];
    this._saveCache(this.userCacheFile, this.userCache);
  }
  forgetGroup(name) {
    delete this.groupCache[(name || "").toLowerCase()];
    this._saveCache(this.groupCacheFile, this.groupCache);
  }

  /** Clear all negative entries — re-run will re-query everything. */
  clearNegativeCache() {
    for (const k of Object.keys(this.userCache)) {
      if (this.userCache[k] === "__neg__" || this.userCache[k] === null) delete this.userCache[k];
    }
    for (const k of Object.keys(this.groupCache)) {
      if (this.groupCache[k] === "__neg__" || this.groupCache[k] === null) delete this.groupCache[k];
    }
    this._saveCache(this.userCacheFile, this.userCache);
    this._saveCache(this.groupCacheFile, this.groupCache);
  }

  getStats() { return { ...this.stats }; }
}

module.exports = IdentityResolver;
