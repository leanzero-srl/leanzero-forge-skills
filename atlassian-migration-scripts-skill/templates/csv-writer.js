"use strict";

/**
 * Streaming RFC-4180 CSV writer. Zero deps.
 *
 *   const { CsvWriter } = require("./csv-writer");
 *   const w = new CsvWriter("logs/plan_123.csv",
 *     ["source_id", "operation", "field", "old_value", "new_value"]);
 *   await w.writeRow({ source_id: "X-1", operation: "update", ... });
 *   await w.close();
 *
 * Quoting rules (RFC 4180):
 *   - Always quote values containing comma, quote, CR, or LF.
 *   - Escape embedded quotes by doubling them.
 *   - Other values may be unquoted; we still quote anything non-empty
 *     to keep diffs stable.
 *
 * Header is written on the first `writeRow` call. UTF-8 BOM is prepended
 * so Excel and Numbers open the file correctly.
 */

const fs = require("fs");

const NEED_QUOTE = /[",\r\n]/;

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s === "") return "";
  if (NEED_QUOTE.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatRow(columns, row) {
  return columns.map((c) => csvEscape(row[c])).join(",") + "\r\n";
}

class CsvWriter {
  /**
   * @param {string} filePath
   * @param {string[]} columns - the column names, in order
   * @param {object} [opts]
   * @param {boolean} [opts.bom=true]  - emit a UTF-8 BOM (Excel/Numbers friendly)
   * @param {boolean} [opts.append=false] - append to an existing file (no header)
   */
  constructor(filePath, columns, opts = {}) {
    this.filePath = filePath;
    this.columns = columns;
    this.append = !!opts.append;
    this.bom = opts.bom !== false;
    this.rowsWritten = 0;
    this.stream = fs.createWriteStream(filePath, { flags: this.append ? "a" : "w" });
    this._closed = false;
    if (!this.append) {
      if (this.bom) this.stream.write("﻿");
      this.stream.write(formatRow(columns, Object.fromEntries(columns.map((c) => [c, c]))));
    }
  }

  writeRow(row) {
    if (this._closed) throw new Error("CsvWriter is closed");
    const line = formatRow(this.columns, row);
    if (!this.stream.write(line)) {
      // backpressure: pause caller until the buffer drains
      return new Promise((resolve) => this.stream.once("drain", resolve));
    }
    this.rowsWritten++;
    return undefined;
  }

  /**
   * Append a comment line (prefixed with `#`). Not valid CSV per spec but
   * widely supported as a summary footer convention.
   */
  writeComment(text) {
    if (this._closed) throw new Error("CsvWriter is closed");
    this.stream.write(`# ${text}\r\n`);
  }

  close() {
    if (this._closed) return Promise.resolve();
    this._closed = true;
    return new Promise((resolve, reject) => {
      this.stream.end((err) => (err ? reject(err) : resolve()));
    });
  }
}

module.exports = { CsvWriter, csvEscape };
