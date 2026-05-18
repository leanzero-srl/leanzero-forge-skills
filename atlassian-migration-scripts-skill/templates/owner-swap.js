"use strict";

/**
 * owner-swap — temporarily change ownership of a Jira entity (filter,
 * dashboard) to a privileged account, perform an operation that requires
 * ownership, then restore the original owner.
 *
 *   const { withOwnerSwap } = require("../src/ownerSwap");
 *
 *   await withOwnerSwap(jiraClient, "filter", filter.id, filter.owner.accountId, myAccountId, async () => {
 *     await jira.makeRequest("PUT", `/rest/api/3/filter/${filter.id}`, { jql: newJql });
 *   });
 *
 * The helper guarantees the owner gets restored even on failure, via
 * try/finally. If the restore itself fails, the orphaned swap is logged
 * to a CSV so an operator can manually re-restore. NEVER swallow restore
 * failures silently — that leaves the entity owned by the wrong account.
 *
 * Why this exists: Cloud filter/dashboard PUT endpoints reject requests
 * from non-owners with 403 even if the caller has site-admin. The standard
 * workaround is owner-swap → mutate → owner-restore.
 */

const fs = require("fs");
const path = require("path");

const ORPHAN_CSV_HEADER =
  "entity_kind,entity_id,original_owner,swapped_to,reason,swapped_at\r\n";

/**
 * Generic owner-swap state machine.
 *
 * @param {object} client                 instance of CloudJiraClient (or anything with `swapOwner`/`restoreOwner` methods)
 * @param {string} entityKind             "filter" or "dashboard"
 * @param {string|number} entityId
 * @param {string} originalAccountId      the existing owner's accountId
 * @param {string} swapTargetAccountId    the privileged accountId (yours)
 * @param {Function} mutator              async () => any — runs while you're the owner
 * @param {object} [opts]
 * @param {string} [opts.orphanCsv]       path to append orphaned-swap rows (default "logs/orphan_owner_swaps.csv")
 * @returns {Promise<{result, originalOwner, swappedTo, restored}>}
 */
async function withOwnerSwap(client, entityKind, entityId, originalAccountId, swapTargetAccountId, mutator, opts = {}) {
  const orphanCsv = opts.orphanCsv || path.join("logs", "orphan_owner_swaps.csv");
  if (originalAccountId === swapTargetAccountId) {
    // Caller is already the owner; no swap needed.
    const result = await mutator();
    return { result, originalOwner: originalAccountId, swappedTo: null, restored: true };
  }

  const swapper = _swapperFor(entityKind);
  await swapper.set(client, entityId, swapTargetAccountId);

  let mutatorErr = null;
  let result;
  try {
    result = await mutator();
  } catch (err) {
    mutatorErr = err;
  }

  // Always attempt restore, even if the mutator failed.
  let restored = false;
  let restoreErr = null;
  try {
    await swapper.set(client, entityId, originalAccountId);
    restored = true;
  } catch (err) {
    restoreErr = err;
  }

  if (!restored) {
    _appendOrphan(orphanCsv, {
      entity_kind: entityKind,
      entity_id: String(entityId),
      original_owner: originalAccountId,
      swapped_to: swapTargetAccountId,
      reason: restoreErr ? restoreErr.message : "unknown",
      swapped_at: new Date().toISOString(),
    });
  }

  if (mutatorErr) throw mutatorErr;
  if (restoreErr) {
    const e = new Error(
      `Mutation succeeded but owner restore failed for ${entityKind} ${entityId}: ` +
      `${restoreErr.message}. Orphan logged to ${orphanCsv}.`,
    );
    e.cause = restoreErr;
    e.orphanLogged = true;
    throw e;
  }

  return { result, originalOwner: originalAccountId, swappedTo: swapTargetAccountId, restored };
}

function _swapperFor(entityKind) {
  if (entityKind === "filter") {
    return {
      set: async (client, id, accountId) => {
        await client.makeRequest("PUT", `/rest/api/3/filter/${id}/owner`, { accountId });
      },
    };
  }
  if (entityKind === "dashboard") {
    return {
      set: async (client, id, accountId) => {
        // Cloud's dashboard owner endpoint is `PUT /rest/api/3/dashboard/{id}` with a body that includes owner.
        const existing = await client.makeRequest("GET", `/rest/api/3/dashboard/${id}`);
        await client.makeRequest("PUT", `/rest/api/3/dashboard/${id}`, {
          name: existing.name,
          description: existing.description,
          sharePermissions: existing.sharePermissions,
          editPermissions: existing.editPermissions,
          owner: { accountId },
        });
      },
    };
  }
  throw new Error(`owner-swap doesn't know how to swap a "${entityKind}"`);
}

function _appendOrphan(filePath, row) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, ORPHAN_CSV_HEADER);
    const line = [
      row.entity_kind,
      row.entity_id,
      row.original_owner,
      row.swapped_to,
      _csvEscape(row.reason),
      row.swapped_at,
    ].join(",") + "\r\n";
    fs.appendFileSync(filePath, line);
  } catch {
    // Last-resort: write to stderr so the operator at least sees it.
    process.stderr.write(`[owner-swap] ORPHAN: ${JSON.stringify(row)}\n`);
  }
}

function _csvEscape(s) {
  const str = String(s || "");
  if (!/[,"\r\n]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

module.exports = { withOwnerSwap };
