"use strict";

/**
 * excel-report-writer — multi-sheet Excel workbook for operator review.
 * Optional dependency: `exceljs` (~3 MB unpacked). The rest of this skill
 * stays zero-dep; this template is the one place we step outside that.
 *
 * For most migrations, the CSV outputs (csv-writer.js / csv-reader.js)
 * are enough. Use this template only when:
 *   - Operators expect Excel for sign-off (status fills, frozen headers).
 *   - You need >1 sheet (e.g. one tab per category of failure).
 *   - You want auto-filtering on columns.
 *
 *   const { ExcelReportWriter } = require("../src/excelReportWriter");
 *   const wb = new ExcelReportWriter("logs/audit_<runId>.xlsx");
 *
 *   wb.addSheet("Summary", [
 *     { metric: "Total entries", value: 12340 },
 *     { metric: "Pass",           value: 12298 },
 *     { metric: "Fail",           value: 37 },
 *     { metric: "Missing",        value: 5 },
 *   ], ["metric", "value"]);
 *
 *   wb.addSheet("Failures", failureRows, ["entry_id", "field", "expected", "actual", "reason"], {
 *     statusColumn: "match",        // optional: a column whose value picks the fill color
 *     statusColors: { PASS: "C6EFCE", FAIL: "FFC7CE", MISSING: "FFEB9C" },
 *   });
 *
 *   await wb.save();
 *
 * To install: `npm install exceljs` in the sub-project. The require below
 * is wrapped so callers get a helpful error if it's missing.
 */

let ExcelJS;
try { ExcelJS = require("exceljs"); }
catch {
  ExcelJS = null;
}

class ExcelReportWriter {
  constructor(filePath) {
    if (!ExcelJS) {
      throw new Error(
        "excel-report-writer requires exceljs. Install it with `npm install exceljs` " +
        "in your sub-project, or stick to CSV outputs for zero-dep migrations.",
      );
    }
    this.filePath = filePath;
    this.wb = new ExcelJS.Workbook();
    this.wb.creator = "atlassian-migration-scripts-skill";
    this.wb.created = new Date();
  }

  /**
   * Add a worksheet.
   *
   * @param {string} name             worksheet name (will be sanitized to ≤31 chars, no `:/\\?*[]`)
   * @param {object[]} rows           row objects keyed by column name
   * @param {string[]} columns        column order (subset of row keys)
   * @param {object} [opts]
   * @param {string} [opts.statusColumn]   column name whose value picks the fill color
   * @param {object} [opts.statusColors]   { value: "RRGGBB" } map
   * @param {boolean} [opts.freezeHeader=true]
   * @param {boolean} [opts.autoFilter=true]
   */
  addSheet(name, rows, columns, opts = {}) {
    const safe = _sanitizeSheetName(name);
    const sheet = this.wb.addWorksheet(safe);

    // Header row
    sheet.columns = columns.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 2) }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    if (opts.freezeHeader !== false) sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Body
    for (const row of rows) {
      const added = sheet.addRow(row);
      // Auto-size columns based on content (capped at 60 to avoid runaway widths)
      for (const c of columns) {
        const v = row[c];
        const len = v == null ? 0 : String(v).length;
        const col = sheet.getColumn(c);
        if (len + 2 > col.width && len + 2 <= 60) col.width = len + 2;
      }
      // Status fill
      if (opts.statusColumn && opts.statusColors) {
        const status = row[opts.statusColumn];
        const argb = opts.statusColors[status];
        if (argb) {
          added.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + argb } };
        }
      }
    }

    if (opts.autoFilter !== false && rows.length > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to:   { row: rows.length + 1, column: columns.length },
      };
    }
    return sheet;
  }

  async save() {
    await this.wb.xlsx.writeFile(this.filePath);
  }
}

function _sanitizeSheetName(name) {
  // Excel rules: ≤31 chars, no : \ / ? * [ ]
  let s = String(name).replace(/[:\\/?*[\]]/g, "_");
  if (s.length > 31) s = s.slice(0, 31);
  return s || "Sheet";
}

module.exports = { ExcelReportWriter };
