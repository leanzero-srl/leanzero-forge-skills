# find-missing-issues — runnable skeleton

A staged recovery pipeline for issues JCMA left behind, distilled from the
14-script `find_missing_issues` suite (McLaren DC→Cloud). Each step is a
separate script writing an artifact the next reads — **run them in order, inspect
the output between stages.** See `docs/21-post-jcma-issue-recovery.md` for the
full rationale.

Copy this into `<job>/main/` as a set of small scripts (one per step). Reuse
`templates/datacenter-jira-client.js`, `templates/cloud-jira-client.js`,
`templates/plan-manager.js`, `templates/excel-report-writer.js`.

## Folder layout

```
find-missing-issues/
├── .env                       # DC_BASE_URL, DC_USERNAME, DC_PASSWORD, CLOUD_BASE_URL, CLOUD_API_TOKEN
├── main/                      # one script per step (below)
├── src/                       # jiraDcClient.js, jiraCloudClient.js, excelWriter.js
└── reports/                   # all artifacts land here
```

## .env

```
DC_BASE_URL=https://jira.dc.example.com
DC_USERNAME=svc-migration
DC_PASSWORD=...                # or a PAT via Bearer in the DC client
CLOUD_BASE_URL=https://your-tenant.atlassian.net
CLOUD_API_TOKEN=...            # base64(email:api_token) OR set CLOUD_EMAIL + token
MIGRATION_CUTOFF=2026-05-11    # issues created after this could never have migrated
BACKFILL_LABEL=cloud-backfill-2026-06
```

## The DC↔Cloud search key diff (the crux — get this right)

```javascript
// DC: classic v2 search, fields=*none, 1000/page (DC allows it) — key-only listing
async function* dcKeys(jql) {
  let startAt = 0, total = null;
  for (;;) {
    const path = `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=*none&startAt=${startAt}&maxResults=1000`;
    const page = await dc.get(path);
    total = page.total;
    for (const i of page.issues) yield i.key;
    if (total != null && startAt + page.issues.length >= total) break;
    startAt += page.issues.length;
  }
}

// Cloud: post-Aug-2025 search/jql — NO startAt, opaque nextPageToken, 100/page hard cap
async function cloudKeySet(jql) {
  const keys = new Set();
  let nextPageToken = null;
  for (;;) {
    let path = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=100`;
    if (nextPageToken) path += `&nextPageToken=${encodeURIComponent(nextPageToken)}`;
    const page = await cloud.get(path);
    for (const i of page.issues) keys.add(i.key);
    if (page.isLast === true || !page.nextPageToken || page.issues.length === 0) break;
    nextPageToken = page.nextPageToken;
  }
  return keys;
}
```

## The 14 steps

```
1.  find_missing_issues.js     diff DC keyset vs Cloud keyset (per project,
                               created < MIGRATION_CUTOFF) -> reports/missing_issues_<ts>.xlsx
                               + checkpoint.jsonl (resumable)
2.  gather_missing_data.js     pull full DC data (history, comments, attachments,
                               links) for the missing set -> per-project workbook
                               (resolve Epic Link/Name/Parent Link field ids by NAME)
3.  probe_required_fields.js   trial-create per (project, issueType): read each
                               "Field X is required" error, supply a value, retry
                               until create succeeds, DELETE the probe issue ->
                               reports/_required_fields.json
4.  generate_import_csvs.js    build Cloud-importer CSVs (one per project):
                               - hierarchy via unified Parent field
                               - co-created parent precedes child IN SAME FILE
                               - rows: Epics -> standard -> sub-tasks
                               - preserve original key via "Issue Key" column
5.  validate_csvs.js           structural + hierarchy integrity; re-confirm every
                               Parent key exists in Cloud
6.  build_status_map.js        per-project { lc(DC status) -> EXACT Cloud status
                               name } -> reports/_status_map.json (importer matches
                               status by exact name; case differs DC vs Cloud)
7.  check_keys_free.js         re-confirm every target key is still FREE (importer
                               EDITs if taken) -> exit non-zero if any occupied.
                               RUN IMMEDIATELY BEFORE IMPORT.
8.  resolve_parents.js         current Cloud key for every referenced parent/epic;
                               flag co-created parents
9.  check_dc_completeness.js   false-negative guard: distinct DC keys retrieved ==
                               DC reported total for same JQL (else pagination skip)
--- IMPORT via Cloud System -> External System Import (CSV) here ---
10. rest_create_gaming.js      REST fallback for issues the importer rejects
                               (per-issue POST w/ retries; REST CANNOT set key:
                               next-in-counter keeps key, below-counter gets new
                               key + old key as label)
11. add_backfill_label.js      tag every recovered issue with BACKFILL_LABEL so
                               sync_* scripts can scope: labels = "<LABEL>"
12. audit_missing_v2.js        re-audit (date cutoff + remap-aware: re-keyed
                               issues keep old key as LABEL -> not missing)
13. validate_missing.js        independently prove each listed key is a pre-cutoff
                               DC issue absent from Cloud
14. finalize_report.js         exact `key = "OLD"` resolution drops keys that are
                               present-but-re-keyed (move-alias resolves them)
```

## Key-preservation rule (steps 4, 7, 10)

The Cloud System → External System Import keeps the numeric part of a mapped
`Issue Key` and applies it to the destination project — so a recovered issue
lands on its **original key** even when the number is below the project counter,
**as long as the key is still FREE**. If TAKEN, the importer silently **EDITs**
that issue. Hence `check_keys_free.js` runs right before import. REST create
(step 10) cannot set the key at all.

## False-positive guards (don't over-report missing)

1. Always filter DC issues to `created < MIGRATION_CUTOFF`.
2. An issue moved/re-created in Cloud keeps its old key as a **label**
   (`BUILD-90021` → re-created as `BUILD-96914` w/ label `BUILD-90021`) — check
   labels before counting a key missing.
3. Jira resolves a moved issue's pre-move key via its move-alias — `key = "OLD"`
   still finds it. `finalize_report.js` does this exact resolution last.
