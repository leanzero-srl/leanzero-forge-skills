# Workflow Modules — Deep Dive

The basics of `jira:workflowValidator` / `jira:workflowCondition` / `jira:workflowPostFunction` live in `02`–`04`. This page is the hard-won operational layer on top of them: the create/edit/view resource split, the per-instance rule-id scheme, registry caching, runtime config transport, programmatic injection gotchas, and agentic validation. Everything here is grounded in **CogniRunner** (`src/index.js`, `manifest.yml`), a shipping AI-validation app with four workflow modules.

## The create / edit / view resource split

Each workflow module declares **three UI resources** plus a runtime function:

```yaml
jira:workflowValidator:
  - key: ai-text-field-validator
    name: CogniRunner Field Validator
    function: validate            # runtime — called at transition time
    resolver:
      function: resolver          # backend for the config Custom UIs (invoke)
    create:
      resource: config-ui-resource    # Custom UI CRUD form (new rule)
    edit:
      resource: config-ui-resource    # same form, pre-filled (edit rule)
    view:
      resource: config-view-resource  # read-only summary + execution log
    projectTypes: [company-managed, team-managed]
```

- `create` + `edit` point at the **same** Custom UI build — a CRUD form that writes the rule's JSON config. Jira pre-fills it on edit from the stored `parameters`.
- `view` is a **separate, read-only** build that Jira embeds in the rule's detail pane in the workflow editor. CogniRunner uses it to render a config summary plus the rule's recent execution-log entries — so an admin sees *what the rule did* without opening the editor.
- `projectTypes` gates which project styles can attach the rule. Omit it and the rule offers on both; list to restrict.

## `expression: "true"` is REQUIRED on conditions

```yaml
jira:workflowCondition:
  - key: ai-text-field-condition
    function: validate
    expression: "true"            # <-- without this the Forge fn is never invoked
```

Without `expression: "true"`, Jira treats the condition as static and **never calls your Forge function** to compute button visibility. With it, Jira invokes the function on **every issue view** to decide whether to show the transition button.

Design impact:
- **Conditions run on every issue load** — keep them cheap and fail-fast. An expensive condition (LLM call, multi-REST fetch) adds latency to every board/issue render.
- **Validators run only at transition time** — they can afford expensive work (CogniRunner runs multi-round agentic LLM validation here, see below).

## One resolver, separately-exported runtime functions

CogniRunner exports three distinct top-level handlers from `src/index.js`:

```javascript
const resolver = new Resolver();
// ... resolver.define('getConfigs', ...), resolver.define('saveConfig', ...) etc.
export const handler = resolver.getDefinitions();   // Custom UI invoke backend

export const validate = async (args) => { /* validators AND conditions */ };
export const executePostFunction = async (args) => { /* post-functions */ };
export const serveAttachment = async (req) => { /* webtrigger */ };
```

- **One** `resolver` (`getDefinitions`) backs all the config Custom UIs (`invoke('getConfigs')`, etc.).
- `validate` is shared by validators **and** conditions — it disambiguates via `args.context.extension.type` (the string contains `"Condition"` for conditions).
- `executePostFunction` is separate because post-functions return `{ result: true }` semantics but never block.

## Runtime config transport: handle string AND object

The config the admin saves in the Custom UI travels: `onConfigure()` → JSON → stored in the rule's `parameters` → delivered at runtime as `args.configuration`. **It is sometimes a JSON string and sometimes pre-parsed** depending on module type and Jira version — handle both:

```javascript
export const validate = async (args) => {
  const { issue, configuration, modifiedFields } = args;   // validators: usually pre-parsed object
  const fieldId = configuration?.fieldId;
  // ...
};

export const executePostFunction = async (args) => {
  let config = args.configuration;
  if (typeof config === 'string') {            // post-functions: often a JSON string
    try { config = JSON.parse(config); }
    catch { return { result: true }; }         // unparseable → fail open, log, skip
  }
};
```

(CogniRunner `src/index.js` — `validate` reads `configuration?.fieldId` directly; `executePostFunction` `JSON.parse`s the string form.)

## Per-instance rule ids: `::i-<6 alnum>` to avoid registry collisions

Two same-type rules on **one transition** collapse if you key your registry by `type::workflow::transition` — their disable flag, registry row, and log identity silently merge. CogniRunner mints a per-instance suffix for **new** rules (edits reuse the embedded id):

```javascript
const INSTANCED_ID_RE = /::i-[a-z0-9]{6}$/;
// id looks like:  validator::My Workflow::31::i-a3f9k2
```

Matching strategy (CogniRunner `validate`, lines ~10844-10884):
1. **Id tier** — match the invocation's `configuration.ruleId` against registry ids (accepting a `type::`-namespaced variant).
2. **Context fallback** — for **legacy** (non-instanced) ids only, match by `workflow.workflowName` + `workflow.transitionId`. An instanced invocation must *never* be muted by this tier, or one sibling's disable flag fail-opens the other.
3. **Legacy field+prompt tier** — for ancient configs with no id, require `fieldId` AND `prompt` to match (prompt stored truncated to 200 chars).

Rows carry `instanced: true` so orphan cleanup applies the precise per-instance check to them and the conservative legacy check to everything else.

## Registry cache: ~30 s warm-container staleness

The disabled-rule check runs on the hot path (every validate/post-function). Re-reading the registry every time burns the KVS ops budget during bulk transitions, so CogniRunner caches it module-scoped:

```javascript
const REGISTRY_CACHE_TTL_MS = 30000;
let _registryCache = null;
const getRegistryForRuleCheck = async () => {
  if (_registryCache && Date.now() - _registryCache.fetchedAt < REGISTRY_CACHE_TTL_MS)
    return _registryCache.value;
  const value = (await kvs.get(CONFIG_REGISTRY_KEY)) || [];
  _registryCache = { value, fetchedAt: Date.now() };
  return value;
};
const saveRegistry = async (configs) => {     // EVERY write invalidates the cache
  await kvs.set(CONFIG_REGISTRY_KEY, configs);
  _registryCache = null;
};
```

**Consequence:** disabling a rule can take **up to ~30 s** to propagate to a warm container that didn't see the resolver-side invalidation. Bounded staleness is acceptable here (worst case: a just-disabled rule runs once more). Contrast provider **keys**, which CogniRunner deliberately never caches — a stale credential is binary-wrong.

## Post-function code offload (32 KB editor cap)

The new workflow editor caps a rule's embedded config at **~32 KB**. AI-generated step code for static post-functions can cross it, so CogniRunner offloads large `functions` arrays to a content-addressed KVS key and stores only a pointer:

```javascript
const PF_CODE_PREFIX = "pf_code:";   // pf_code:<id>:<hash>
// rule config carries codeRef; inline functions (old configs) always win,
// codeRef consulted only when functions is empty.
```

This also relieves the registry's single-value size cap. Orphan `pf_code:` entries accrue (no publish hook to GC them) but are bounded by the app's 500-rule cap.

## Programmatic workflow injection — the full-replacement POST

Covered as pattern 10 in `24-production-patterns.md`; the operational facts that bite:

- **Read:** `GET /rest/api/3/workflows/search?queryString={name}&expand=values.transitions`. `queryString` is a **partial/fuzzy** match — filter by `wf.name === name` in code (`fetchWorkflowTransitions`, line ~1277).
- **v3 shape quirks:** post-functions are exposed as `transition.actions` (not `.postFunctions`); conditions are a recursive `{ operation, conditions, conditionGroups }` **tree** that you must flatten (`flattenConditionRules`, line ~1246).
- **Write:** `POST /rest/api/3/workflows/update` with the **whole** workflow. Omitting `statuses`, `statusMappings`, or the `system:update-issue-status` post-function silently breaks transitions.
- **Draft workflows don't appear** in `/workflows/search` until published. CogniRunner registers rules at **draft-save** time, so a fresh rule looks orphaned until publish — it uses a **7-day grace window** (`ORPHAN_PRECISE_MIN_AGE_MS`) before the precise orphan-cleanup may delete a row, so opening the Rules tab during that window doesn't wipe a not-yet-published rule.
- **Project usage:** `GET /rest/api/3/workflow/{workflowId}/projectUsages` paginates via `nextPageToken` (`data.projects.nextPageToken`).

## Agentic validation (validators only)

A validator can enable a single `search_jira_issues` JQL tool and run a bounded multi-turn LLM loop to detect duplicates / similar work. CogniRunner auto-enables it when the prompt matches a regex (`/duplicat|already exists|similar issues|find related|cross-reference|.../i`, the `TOOL_TRIGGER_PATTERN`), or via an explicit `configuration.enableTools` override.

```javascript
const MAX_TOOL_ROUNDS = 3;          // up to 3 tool rounds + 1 final-answer round
const AGENTIC_TIMEOUT_MS = 20000;   // budget passed in as the loop deadline

for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
  if (Date.now() >= deadline) return { isValid: true, reason: 'timed out — allowed', ... }; // fail open
  // last round: keep tool DEFINITIONS but force tool_choice:"none" so the model
  // must produce a final verdict (several providers reject tool_use history when
  // `tools` is absent entirely).
  // ...
  if (Date.now() >= deadline - 4000) return { isValid: true, ... }; // don't start a round we can't finish
}
```

Hardening worth copying:
- **Confine the tool to the rule's project** — `args.confineToProject = projectKey` is forced on every `search_jira_issues` call so a prompt-injected model can't exfiltrate other projects' data. Fails closed if the project can't be determined.
- **Defang tool results** before feeding them back — issue summaries are user-controlled (`defangFence(toolResult)`).
- **Attachments:** the validator reads text fields, ADF (`extractTextFromADF`), and attachments (images → image block, docs → document block) up to a **20 MB total budget** (`MAX_TOTAL_ATTACHMENT_SIZE = 20 * 1024 * 1024`). Attachments are **skipped on CREATE transitions** (`transitionId === "1"`) — the issue doesn't exist yet.
- **Tolerant JSON parse** — the loop can't use `response_format` while tools are active, so the model may wrap its final JSON in prose; parse leniently and recover.

## Multi-tier deadline guard (validators kill at 25 s)

Forge hard-kills a validator at **25 s**; overrunning surfaces as an ungraceful "error in validator". CogniRunner reserves headroom in tiers:

```javascript
const VALIDATOR_AI_DEADLINE_MS = 21000;  // graceful fail-open + log, ~4s below the wall
const PF_BUDGET_MS = 22000;              // post-function budget
const AGENTIC_TIMEOUT_MS = 20000;        // agentic loop interior — reserves time for storeLog
```

Each tier fails **open** (allow the transition) and logs, so the user never sees a platform kill. See pattern 9 in `24-production-patterns.md` for the fail-open philosophy.

## Field editability pre-flight for semantic post-functions

A semantic post-function asks an LLM to set a target field. Before spending a token, CogniRunner fetches `editmeta` and checks the target is actually writable:

```javascript
// GET /rest/api/3/issue/{key}/editmeta  — fetched UPFRONT (parallel with the source field)
const editMeta = await editMetaResp.json();
const meta = editMeta.fields[targetFieldId];
if (!meta) return { success: false, error: `"${targetFieldId}" is not editable on ${issueKey}`,
                    recommendation: `Editable fields: ${Object.keys(editMeta.fields).join(', ')}` };
if (Array.isArray(meta.operations) && !meta.operations.includes('set'))
  return { success: false, error: `"${targetFieldId}" does not support "set"` }; // comments/worklogs/links need dedicated endpoints
```

Then the AI's plain-text output is **auto-formatted to the field's schema** (`formatValueForField`, line ~10417):
- `option` → `{ value }`; `option-with-child` → `{ value, child: { value } }`
- `array` of `option` → `[{ value }]`; of `string` → `["a","b"]` (labels hyphenate spaces); of `user` → `[{ accountId }]`; of `component`/`version`/`group` → `[{ name }]`
- `doc` / `description` / `environment` / `*:textarea` → ADF (`coerceToAdf`) — **note:** some sites declare rich-text fields as schema type `"string"`; detect by field identity too, not just declared type (observed in production — the v3 PUT then 400s with "must be an Atlassian Document").
- `number` → keep a blank/NaN value as the original string so the format check rejects it and the PF **skips** rather than silently writing `0`.

## See also

- `02-workflow-validators.md`, `03-workflow-conditions.md`, `04-workflow-post-functions.md` — module basics
- `24-production-patterns.md` — fail-open validators (9), workflow injection (10)
- `31-forge-ai-and-llm.md` — the LLM layer behind agentic validation / semantic PFs
- `templates/workflow-config-view.yml` — the create/edit/view manifest split
