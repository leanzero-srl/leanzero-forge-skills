# Test-management app data (Zephyr-class apps)

Marketplace test-management data (test cases, steps, cycles, executions) does not travel with the issues. In the field
run the source used one test app and the target another (cases from the source app → a Zephyr Squad-style app on
the target: tests are Jira issues of type Test). The specifics below are for that Zephyr family; the lessons generalise.

## Harvest the source app first

The source app's data was harvested read-only through the app's own API with a per-user app token (generated in the
app's own settings page): cases (key, title, description, precondition, owner, folder, status), case detail with
`steps[]` (step, test data, expected result — HTML), cycles (title, objective, dates, closed), and runs (one row per
case-in-cycle with the LATEST run only: status id, executed by, dates, comments, defects, run count).

- Status ids are per PROJECT (two projects used different id ranges for the same names). Map by NAME, per project.
- Only the latest run per case-in-cycle was in the listing; run history (`runCount > 1`) needs per-run calls — phase 2.
- Harvest before the source shuts down; this data is not in the issue snapshot.

## Which Zephyr is it?

- Product names have moved more than once (Squad, Scale, Essential, "Zephyr"); the vendor states "The APIs for
  Zephyr Squad and Zephyr / Zephyr Essential are not similar". Do not go by the marketing name.
- Tell them apart by the DATA: Squad-style = tests are Jira issues of type "Test", steps and executions live in the
  app, and the API below works; Scale-style = test cases are app objects (`PROJ-T1`-style keys), different API.
  Everything below is the Squad public API, which is what the field run used.
- Trap: the Connect probe `GET /rest/atlassian-connect/1/addons/<key>` answered 404 on the target because the app is
  Forge, which made us claim "not installed". Prove presence by the app's data (items of type Test with the app's issue
  properties, the Test issue type description).

## API facts (Squad/Essential public API)

- Base `https://prod-api.zephyr4jiracloud.com/connect`, access key + secret key, JWT with a query-string hash (`qsh`)
  per request.
- **Keys are per USER and per SITE**, generated in the app's API-keys page on the TARGET site (a step-up verification
  may be required). A key from another site does not work.
- Create a test = create the Jira issue of type Test (Jira API, your normal ordered/unordered copy rules apply), then:
  - steps: `POST /public/rest/api/1.0/teststep/{issueId}?projectId=` `{step, data, result}` — **one call per step,
    no bulk create** (the floor that sets the duration: thousands of steps = hours at the rate limit)
  - cycle: `POST /public/rest/api/1.0/cycle {name, description, startDate, endDate, projectId, versionId:-1}`;
    the source's "ad hoc" cycle → the app's own Ad hoc (no create)
  - executions in BULK per cycle (paths under `/public/rest/api/1.0`): add tests
    (`POST /executions/add/cycle/{cycleId}` with method "1" and ≤100 issue keys, returns a job), read
    executions 50 per call (`size` 51 → 400 "size of query chunk should not exceed 50"), set statuses with one bulk-status
    job per status (`POST /executions {executions, status}`); bulk delete exists too
  - jobs answer with a BARE token string; poll `GET /jobprogress/{token}` until progress 1.0 (~10 s)
  - adding a test that is already in the cycle is refused ("existing") → the add is idempotent
- Execution statuses: `GET /public/rest/api/1.0/execution/statuses` (UNEXECUTED -1, PASS 1, FAIL 2, WIP 3, BLOCKED 4,
  plus site-specific ones). Map by name: Not Run → UNEXECUTED, In Progress → WIP, Passed → PASS, Failed → FAIL,
  Blocked → BLOCKED.
- **Executed-by and executed-date are not settable** (response-only). Keep them as text: one paragraph per Test in the
  Test's DESCRIPTION (via the Jira API) — "Runs (latest per cycle): <cycle>: <status> by <name or placeholder> on <date>
  (<n> runs)".
- Step HTML → plain text with line breaks; links kept as text. Every text through the same scrubber (doc 08).

## The rate limit: ~30 calls per minute PER USER

Measured: 30 calls succeeded in 27 s, the 31st returned 429 "Please wait for 34 seconds". The vendor documents the
limit as per user, per minute, without a number.

- It is shared by EVERY process using the same key. Six threads produced endless 429 retries and no speed-up.
- Pace all calls through ONE lock file shared across threads AND processes (we spaced calls 2.1 s apart). On 429,
  sleep the stated seconds.
- Do not run two loads with the same user at once (e.g. a rehearsal and production).
- Budget ~1,700 calls/hour per user. A second user with its own keys doubles it — that is the only lever.
- The per-user limit made this the long pole of the whole migration: it ran for hours after the Jira load finished.

## Order and silence

- The loader CREATES Jira issues (Tests). Run it for a project only AFTER that project's ordered copy finished, or the
  Tests take numbers in the middle of the ordered range.
- Those creates fire the project's notification scheme: keep the project on the silent scheme until the loader is done
  with it, and make the notification restore WAIT for the loader (or restore only the projects it is finished with and
  restore the rest when it logs done). Re-disable autowatch for the loader's account after any partial restore.

## Resume and verification

- Resume by a label per source case (`src-case-<key>`) and a state file (case → issue, cycle → cycle id, executions
  done). An execution created one-by-one and killed before the state save leaves an orphan: the bulk pass deletes
  duplicates per (cycle, test), keeping the recorded one.
- Verify per project against the harvest: tests, steps per test (sampled step-for-step), cycles, executions per cycle,
  status mix, run-history paragraphs. All matched exactly except one project where a few ad-hoc executions landed in the
  "unexecuted" bucket — a cosmetic status bucket, reported.
- Run the scrubber's detector over steps and execution comments after the load (tests loaded with an older matcher
  can carry a name the newer one catches).
