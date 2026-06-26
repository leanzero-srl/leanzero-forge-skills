"use strict";

/**
 * XLSX workbook mapping reader — the operator-editable alternative to a JSON
 * mapping config.
 *
 * Distilled from the dc-cloud-field-report / DC_to_Cloud_Field_Mapping_*.xlsx
 * workflow (OpenBet/McLaren DC->Cloud). See docs/16-config-driven-multi-field.md.
 *
 * WHY an XLSX and not JSON: a field/project/status mapping is reviewed and
 * EDITED by humans (migration leads, project admins) who live in spreadsheets,
 * not JSON. A generator (e.g. dc-cloud-field-report) emits the workbook with the
 * DC side filled and the Cloud side auto-matched by name; the operator corrects
 * the rows the auto-match got wrong, then this reader loads it back for the
 * apply scripts. Sheets per category keep concerns separated and reviewable.
 *
 * Expected workbook shape (sheet name -> rows). Sheet/column names are
 * configurable; defaults below match the field-report layout:
 *
 *   Sheet "CustomFields":  DC Field ID | DC Field Name | Cloud Field ID | Cloud Field Name | Notes
 *   Sheet "Projects":      DC ID | Key | Name | Cloud ID
 *   Sheet "IssueTypes":    DC ID | Name | Cloud ID
 *   Sheet "Statuses":      DC ID | Name | Category | Cloud ID
 *   Sheet "Users":         DC accountId/userKey | Email | Display Name | Cloud accountId
 *
 * Output: a mappings object shaped like the JSON the apply scripts already use:
 *   { customFieldMapping:{dcId:cloudId}, customFieldNameMapping:{cloudId:name},
 *     projectMapping, issueTypeMapping, statusMapping, userMapping, unresolved:[...] }
 *
 * Requires `exceljs` (the same optional dep used by templates/excel-report-writer.js).
 * No emoji (CI-safe). Header-row matching is case/space-insensitive so minor
 * operator edits to column titles don't break the load.
 */

// Lazy require so scripts that don't use XLSX mapping don't need exceljs installed.
function loadExcelJS() {
  try {
    // eslint-disable-next-line global-require
    return require("exceljs");
  } catch (_) {
    throw new Error("xlsx-mapping-reader requires 'exceljs' (npm i exceljs).");
  }
}

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");

// Build a { normalizedHeader -> columnIndex(1-based) } map from a worksheet's first row.
function headerIndex(ws) {
  const idx = {};
  const row = ws.getRow(1);
  row.eachCell({ includeEmpty: false }, (cell, col) => { idx[norm(cellText(cell))] = col; });
  return idx;
}

function cellText(cell) {
  if (cell == null) return "";
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.text != null) return String(v.text);          // rich text
    if (v.result != null) return String(v.result);       // formula result
    if (v.hyperlink != null) return String(v.text || v.hyperlink);
  }
  return String(v).trim();
}

// Resolve a column by trying several candidate header names (first hit wins).
function col(idx, ...candidates) {
  for (const c of candidates) {
    const k = norm(c);
    if (idx[k] != null) return idx[k];
  }
  return null;
}

// Iterate data rows (skipping the header) yielding a getter `g(...headerNames)`.
function eachDataRow(ws, idx, fn) {
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (...names) => {
      const c = col(idx, ...names);
      return c ? cellText(row.getCell(c)) : "";
    };
    // skip fully-empty rows
    if (!row.values || row.values.filter((v) => v != null && String(v).trim() !== "").length === 0) continue;
    fn(g, r);
  }
}

/**
 * @param {string} filePath
 * @param {object} [opts] - { sheets: { customFields, projects, issueTypes, statuses, users },
 *                            log }
 * @returns {Promise<object>} mappings
 */
async function readMappingWorkbook(filePath, opts = {}) {
  const ExcelJS = loadExcelJS();
  const log = opts.log || (() => {});
  const sheets = Object.assign(
    { customFields: "CustomFields", projects: "Projects", issueTypes: "IssueTypes", statuses: "Statuses", users: "Users" },
    opts.sheets || {},
  );

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const out = {
    customFieldMapping: {},      // dcId -> cloudId
    customFieldNameMapping: {},  // cloudId -> name
    projectMapping: {},          // dcId -> cloudId
    issueTypeMapping: {},
    statusMapping: {},
    userMapping: {},             // dc accountId/userKey -> cloud accountId
    unresolved: [],              // rows missing a Cloud value (operator must fix)
  };

  const getSheet = (name) =>
    wb.getWorksheet(name) || wb.worksheets.find((w) => norm(w.name) === norm(name)) || null;

  // CustomFields
  const cf = getSheet(sheets.customFields);
  if (cf) {
    const idx = headerIndex(cf);
    eachDataRow(cf, idx, (g) => {
      const dcId = g("DC Field ID", "DC ID", "dcFieldId");
      const cloudId = g("Cloud Field ID", "Cloud ID", "cloudFieldId");
      const cloudName = g("Cloud Field Name", "Cloud Name");
      if (dcId && cloudId) {
        out.customFieldMapping[dcId] = cloudId;
        if (cloudName) out.customFieldNameMapping[cloudId] = cloudName;
      } else if (dcId) {
        out.unresolved.push({ category: "customField", dcId, name: g("DC Field Name", "DC Name") });
      }
    });
  }

  // Generic dcId->cloudId sheets
  const simple = [
    ["projects", "projectMapping", ["DC ID", "datacenter_id"], ["Cloud ID", "cloud_id"]],
    ["issueTypes", "issueTypeMapping", ["DC ID"], ["Cloud ID"]],
    ["statuses", "statusMapping", ["DC ID"], ["Cloud ID"]],
    ["users", "userMapping", ["DC accountId", "DC userKey", "DC ID"], ["Cloud accountId", "Cloud ID"]],
  ];
  for (const [sheetKey, mapKey, dcCols, cloudCols] of simple) {
    const ws = getSheet(sheets[sheetKey]);
    if (!ws) continue;
    const idx = headerIndex(ws);
    eachDataRow(ws, idx, (g) => {
      const dcId = g(...dcCols);
      const cloudId = g(...cloudCols);
      if (dcId && cloudId) out[mapKey][dcId] = cloudId;
      else if (dcId) out.unresolved.push({ category: sheetKey, dcId, name: g("Name", "Display Name", "Key", "Email") });
    });
  }

  log(`readMappingWorkbook: customFields=${Object.keys(out.customFieldMapping).length} ` +
    `projects=${Object.keys(out.projectMapping).length} issueTypes=${Object.keys(out.issueTypeMapping).length} ` +
    `statuses=${Object.keys(out.statusMapping).length} users=${Object.keys(out.userMapping).length} ` +
    `unresolved=${out.unresolved.length}`);
  if (out.unresolved.length) {
    log(`  WARNING: ${out.unresolved.length} row(s) have no Cloud value — fix the workbook before apply.`);
  }
  return out;
}

module.exports = { readMappingWorkbook };
