# The technical profile — for a Forge app, the manifest IS the security surface

A reviewer asking for a "project technical profile" usually expects infrastructure: servers, network
diagrams, hosting, data flows. **A Forge app has none of yours.** That's not a reason to refuse the
artifact — it's the answer. Give them the manifest, decoded.

## Extract these from `manifest.yml`, in this order of reviewer-value

### 1. Egress — the headline
```yaml
permissions:
  external:
    fetch:
      backend: [...]   # ← if this block is ABSENT, the app cannot make outbound calls at all
```
**No `external.fetch` = zero egress = no exfiltration path to any external host.** This is the single
strongest sentence in a Forge security profile. State it first and state it plainly.

If egress IS declared, list every host and say why each is needed. That list is now the profile's centre of
gravity.

### 2. Inference — where does AI processing happen?
```yaml
modules:
  llm:
    - key: <k>
      model: [claude]        # ← @forge/llm = Atlassian's in-platform model
```
`@forge/llm` means: **no API key** (nothing to leak or rotate), **no third-party AI vendor** receiving
prompts or tenant content, inference inside Atlassian's platform boundary. For a data-protection reviewer
this is often the question behind the question ("where does our data go?"). Answer it explicitly.

If instead the app calls an external AI API, that's egress + a processor + a key — completely different
review, and say so.

### 3. Scopes — the capability ceiling
```yaml
permissions:
  scopes:
    read:jira-work: {allowImpersonation: true}
    write:jira-work: {allowImpersonation: true}
    manage:jira-configuration: {allowImpersonation: true}
    storage:app: {allowImpersonation: false}
```
These are **enforced by Atlassian at runtime** — the app cannot exceed them regardless of what the code
attempts. Tabulate them. Flag `write:*` and `manage:*`, and flag **`allowImpersonation: true`** (the app acts
*as the user*). Impersonating write scopes + untrusted input is the prompt-injection precondition
(see `docs/03-beyond-scanners.md`).

Least-privilege question worth asking yourself before the reviewer does: **is every declared scope actually
used?** An unused `manage:jira-configuration` is free risk.

### 4. Storage
`storage:app` → Forge KVS, Atlassian-hosted, inside the tenant boundary. No external datastore. If the app
uses an external DB, that's egress again.

### 5. CSP — disclose your own weakenings
```yaml
permissions:
  content:
    styles:  [unsafe-inline]
    scripts: [unsafe-inline, unsafe-eval]
```
**Volunteer this.** A reviewer will find it and it looks far worse discovered than disclosed. Scoped to the
app's own Custom UI iframe, not the host product — say that, but also say honestly whether you know it's
*required* (e.g. by `@forge/react`) or whether it's a leaked webpack dev artifact nobody has checked.
It matters most when that iframe renders untrusted content.

### 6. Hosting / deployment model
Atlassian-hosted FaaS. Deployed via `forge deploy`, executed in Atlassian's sandboxed runtime.
**No server, VM, container, network endpoint or database of ours in the request path. No inbound attack
surface of ours exists.** Note the runtime (`app.runtime.name`, e.g. `nodejs22.x`).

### 7. Modules and functions
List them — it's the app's actual surface: what UI it injects, what resolvers exist, what queue consumers run
and with what timeouts.

### 8. Third-party libraries
Direct deps only, split Atlassian SDK (`@forge/*`, `@atlaskit/*`) from genuinely third-party. The third-party
ones — especially anything that **parses untrusted input** — are where the review actually lives.

## Free corroboration worth quoting

If `forge deploy` prints:
> *"The version of your app […] is eligible for the **Runs on Atlassian** program."*

quote it. That's **Atlassian independently certifying** the zero-egress/in-platform posture you just claimed.
A reviewer trusts the platform's own attestation more than your prose.

## Honest framing to close on

> The platform bounds the blast radius: no infrastructure of ours, no egress, capability capped by declared
> scopes and enforced by Atlassian. It does **not** mean there are no bugs — the code still executes inside
> the sandbox, on tenant data, against user-supplied input.

That sentence is what makes the rest of the profile credible.
