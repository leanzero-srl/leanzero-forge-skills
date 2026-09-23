# The defects a scanner will not find

Written 2026-07-29, from a real review (ChatWise, ITSM-80215) where a competent security engineer
using SonarQube and BlackDuck filed seven findings. Independent verification of the code found:

- Two of his seven did not stand up.
- Two of his severities were **understated** — one Medium was really a Blocker.
- The single worst defect in the app **was not in his list at all**.
- And the vendor's own first reply nearly disputed a finding the vendor had already silently fixed.

None of what was missed is findable by SAST. SAST looks for a bad call. These are all a **missing
check**, and absence has no signature. That is the whole reason this file exists.

Run `scripts/forge_authz_scan.py <app>` to get the candidate sites; then read them by hand.

---

## 1. Forge KVS is app-scoped, not user-scoped

Under `storage:app`, every row belongs to the *app*. If a resolver takes an id from the payload and
puts it in a key, **any user can address any row** unless that resolver compares the id to
`context.accountId` itself. The platform will not do it for you and nothing warns you.

Ask of every resolver that touches storage: *whose row is this, and who checked?*

The strongest fix is not a check at all — it is **key derivation**. Make the storage key
`thread-${id}:u:${accountId}` and two users physically cannot collide, so there is no check to
forget in the next resolver somebody adds. A check you can forget is a check that will be forgotten.

## 2. An id built from a public value has no entropy

`conversationId = \`issue-${issueKey}\`` is printed on the face of every issue in the instance.
Combined with (1) that is an IDOR over an identifier the attacker already has — no guessing, no
timing, no social engineering. In the review this was rated Medium as "session fixation". It was
neither a session nor fixation: there is nothing to fix when the id is public by construction.

Watch for the inverse error too. When an id **is** strong, do not present that as the control:
`job_${Date.now()}_${Math.random().toString(36)}` is not a CSPRNG, and quoting a bit-count to a
security reviewer invites a correction you will lose. Argue from the missing check, not the entropy.

## 3. Find EVERY prompt builder, not the first

The review found one. There were three: the issue-context builder, the wizard prompt (which
auto-created Jira Epics from model output), and uploaded file text — which was introduced to the
model as *trusted* content it should use.

Grep for `role: "system"`, every `*Prompt*` module, and every place file or attachment text is
concatenated. Then for each one: can a third party write into what lands there?

## 4. The tool boundary is the control, not the prompt

Fencing untrusted content — a nonce-tagged block explicitly labelled as data the model must not
obey — is worth doing and is current practice. It is **not** sufficient. A fence is tokens, and
published bypass rates against fencing alone are bad against an adaptive attacker.

What makes prompt injection a Blocker rather than a nuisance is what the model can *do*: write
tools reachable from the agent loop, executing as the victim via `asUser()`, with no confirmation.
So the durable control is at dispatch:

- writes **default-deny**, explicit opt-in per entry point;
- a **budget** per run, so a successful injection is small and noisy;
- refusals **logged**, because a refused write is the signal something tried.

Then check the thing that is easy to miss: **does every write path actually go through the guard?**
On ChatWise the wizard path did not call the agent loop at all, so the guard never saw it, and it
iterated a model-supplied array of issues to create with no cap. The prompt was fenced and the
writes were unbounded — the worse half left open.

## 5. "No egress" does not mean "cannot exfiltrate"

`manifest.yml` with no `external.fetch` feels like a hard boundary. It is not, when the app can
search Jira and write to Jira: `searchIssues` then `addComment` moves content the attacker cannot
read onto an issue they can. **The sink is Jira itself.**

Never let "we have no egress" stand as the mitigation for an injection finding. And when you state
a blast radius, state it in the right unit — a cap of three writes bounds *how many times*, not
*how much*: one comment can carry a lot of text.

## 6. `asUser` sets the blast radius, and it is attributable

Tools running under `api.asUser()` cannot escalate beyond the victim's own Jira permissions, which
is worth saying plainly because it bounds the damage. But everything the model is talked into doing
lands **under a real person's name in the audit log**. That is the difference between an app bug
and an attributed action, and it belongs in the report explicitly.

Note also that "reversible" is not the axis a reviewer approves on. A comment can be deleted; that
does not un-read the data it carried. A field overwrite loses the old value.

---

## Reviewing the reviewer

Grade every finding independently, in both directions. In this review that meant conceding two of
theirs, raising two severities, refuting one, and adding three they never saw.

Two rules learned the hard way on the reply itself:

**Never dispute a finding you have already fixed.** The draft argued that `saveBaseUrl` "does more
than a string check" — while the same branch contained a commit rewriting that validator, with an
inline comment naming the exact bypasses. One `git blame` from a total loss of credibility. Before
refuting anything, `git log -S` the file.

**Never claim coverage you have not shipped.** The draft said seven tests existed for a property.
They had been run from a scratchpad and never committed; the repo had none. `ls test/` disproves it
in seconds. If you say it is tested, it must be in the repo and in `npm test`.

And check the scanning actually runs: a GitHub Actions workflow in a repo hosted on Bitbucket never
fires. Configured is not running.
