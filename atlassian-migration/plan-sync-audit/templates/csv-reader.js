"use strict";

/**
 * csv-reader — RFC-4180-aware CSV reader for scope filtering, identity
 * overrides, and other CSV inputs to migration scripts. Zero deps.
 *
 *   const { readCsv, readCsvAsScope } = require("../src/csvReader");
 *
 *   // Parse a CSV into row objects keyed by the header
 *   const rows = await readCsv("scope.csv");
 *   // → [{ issue_key: "ABC-1", reason: "missing parent" }, ...]
 *
 *   // Or read just one column as a Set of values (common scope-filter pattern)
 *   const issueKeys = await readCsvAsScope("scope.csv", "issue_key");
 *   // → Set { "ABC-1", "ABC-2", ... }
 *
 * Quoting rules:
 *   - Quoted fields preserve internal commas, CRs, LFs.
 *   - Embedded `""` decodes to `"`.
 *   - Leading UTF-8 BOM is stripped automatically.
 *
 * The reader buffers the whole file in memory — fine for scope CSVs of
 * <100k rows. For multi-million-row inputs, stream the file via `readline`
 * and call `parseLine()` on each.
 */

const fs = require("fs");

/**
 * Read a whole CSV file into row objects.
 *
 * @param {string} filePath
 * @param {object} [opts]
 * @param {string[]} [opts.columns]  if provided, used instead of the file's header row
 * @returns {Promise<Array<Record<string, string>>>}
 */
async function readCsv(filePath, opts = {}) {
  const text = await fs.promises.readFile(filePath, "utf8");
  return parseCsvText(text, opts);
}

/**
 * Parse a CSV string (already-loaded; no I/O) into row objects.
 */
function parseCsvText(text, opts = {}) {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = _splitLogicalLines(text);
  if (lines.length === 0) return [];

  let header;
  let start = 0;
  if (opts.columns) {
    header = opts.columns;
  } else {
    header = _parseLine(lines[0]).map((c) => c.trim());
    start = 1;
  }

  const out = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line === "" || line.startsWith("#")) continue;
    const cells = _parseLine(line);
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cells[j] != null ? cells[j] : "";
    out.push(row);
  }
  return out;
}

/**
 * Read a single column from a CSV as a Set. Useful for scope filtering:
 *
 *   const scope = await readCsvAsScope("scope.csv", "issue_key");
 *   const filtered = allIssues.filter((i) => scope.has(i.key));
 *
 * The column lookup is case-insensitive on the header name.
 */
async function readCsvAsScope(filePath, column) {
  const rows = await readCsv(filePath);
  const col = column.toLowerCase();
  const out = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === col && row[k]) {
        out.add(row[k].trim());
        break;
      }
    }
  }
  return out;
}

/**
 * Split a CSV string into logical lines — handles embedded newlines
 * inside quoted fields. Returns array of line strings (no trailing
 * line breaks).
 */
function _splitLogicalLines(text) {
  const out = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      buf += c;
      if (c === '"' && text[i + 1] === '"') { buf += text[++i]; continue; }
      if (c === '"') inQ = false;
      continue;
    }
    if (c === '"') { buf += c; inQ = true; continue; }
    if (c === "\r" && text[i + 1] === "\n") {
      out.push(buf); buf = ""; i++; continue;
    }
    if (c === "\n" || c === "\r") {
      out.push(buf); buf = ""; continue;
    }
    buf += c;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

/**
 * Parse a single CSV line into cell strings. Respects RFC-4180 quoting:
 * `""` inside a quoted field decodes to `"`; commas, CRs, LFs inside
 * quotes are literal.
 */
function _parseLine(line) {
  const cells = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { buf += '"'; i++; continue; }
      if (c === '"') { inQ = false; continue; }
      buf += c;
      continue;
    }
    if (c === '"' && buf === "") { inQ = true; continue; }
    if (c === ",") { cells.push(buf); buf = ""; continue; }
    buf += c;
  }
  cells.push(buf);
  return cells;
}

module.exports = { readCsv, readCsvAsScope, parseCsvText, parseLine: _parseLine };
