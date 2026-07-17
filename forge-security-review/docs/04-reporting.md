# Writing the pack — and the sentences that get it rejected

The scan is the easy half. The pack is what a security reviewer actually judges, and a confident-but-wrong
one costs more than no pack at all: every subsequent claim gets re-read with suspicion.

---

## Structure that survives review

1. **The disagreement, first.** If the reviewer's own scan will contradict yours — say so in paragraph one,
   with the mechanism (`docs/gotchas.md` §1). Being second to raise it reads as concealment.
2. **Technical profile** — manifest-derived (`docs/01-technical-profile.md`). Egress first.
3. **SAST** — result **plus** the canary validation **plus** the honest scope of the claim.
4. **SCA** — prod tree; ours-vs-SDK split; `fixAvailable` on every row; reachability of the ones that matter.
5. **What the scanners couldn't see** (`docs/03-beyond-scanners.md`) — the section that earns trust.
6. **Risk assessment** — what the platform bounds, and explicitly what it does *not*.
7. **Remediation plan** — item, action, owner.
8. **Appendix** — exact commands, so they can reproduce it.

## The framing that works

> **"We closed the one finding a scanner could see. Here is what the scanners structurally cannot see, which
> we found ourselves, and here is the plan."**

That survives review. **"This resolves the security review"** does not — it invites them to find the one
thing you missed, and they will.

## Sentences that get you rejected

| Don't write | Why | Write instead |
|---|---|---|
| "SAST/SCA don't apply to a sandboxed Forge app" | Collapses the moment they run `npm audit`. On the founding case it would have found a live reachable HIGH **in our own code**. | "Here's the SAST, here's the SCA, and here's what the platform does and doesn't bound." |
| "The remaining N are Atlassian's to patch" | Usually false. 10 of 15 were `fixAvailable: true`. | "~X are structurally theirs (`fixAvailable: false` on the latest SDK); ~Y we haven't attempted yet." |
| "We can't force transitive versions" | Falsifiable by opening `package.json` — it already had an `overrides` block. | "We could force it via overrides, but that's 8 majors under a UI framework we don't control and we won't ship an untested forced resolution into a rendering path." |
| "Verified the vulnerability is fixed" | If your evidence is a CHANGELOG + version floors, that's attestation. | "Vendor-patched per the upstream changelog and the version floors. Not exploit-verified." |
| "Deployed to production, remediated" | Check `forge install list` first. Production may have zero installs and never have carried the code. | "The reachable sink existed in the development build on the test tenant and was remediated there; production never carried it." |
| "npm audit is clean" (as the headline) | Their OSV scanner will say otherwise, on the same version. | Lead with §1 of `docs/gotchas.md`. |
| "No behavioural change" | Almost never true after a version bump. Characterise the deltas. | "Equivalent, with 2 characterised deltas: …" |

## Disclose before they discover

Anything you'd rather they didn't notice, **you** raise:
- CSP `unsafe-eval` / `unsafe-inline`
- Impersonating write scopes
- Prompt-injection → privileged tool-call chains
- Decompression bombs
- Phantom deps / mutable tags
- Parsers on the untrusted path that nobody reviewed

The founding pack disclosed a prompt-injection chain **more severe than the CVE that triggered the review**.
That is what makes the clean SAST believable. A pack that only contains good news reads as marketing.

## Confidentiality — what must NOT go in

- **Never attach a private key, token, or secret to a ticket.** A ticket attachment is agent-wide,
  reporter-visible and persists in backups and search. Credentials go through a secrets manager (1Password)
  only. A public certificate is fine; the private key never is.
- **Don't attach the product of the app if it's confidential.** The founding case generated a 132-page PDF of
  an emergency manual marked `Classification: confidential` containing infrastructure data sheets. It stayed
  off the ticket — copying it there would have widened access beyond the source system's permissions. Report
  metrics as evidence, not the document.
- Scan output itself (SAST/SCA JSON) is normally fine — it's what the reviewer asked for — but it *is* a
  vulnerability list for a live app. It belongs on the review ticket, not somewhere broader.

## Voice, when it goes out under a person's name

Follow their voice rules. For Mihai: **plain prose, no bullets, no bold** in the *comment*; the attached
**report document** may use headings and tables (it's an artifact, not a message). Lead flat, no
verdict-openers, no em-dashes, own uncertainty out loud. Run the pre-post gate.

## The honesty bar

- A green scan is not proof.
- A number is not a result — `file` reported a 132-page PDF as "8 pages"; one tool's summary is never ground
  truth.
- If you couldn't verify it, say "not verified" and say what would verify it.
- If you were wrong earlier in the thread, withdraw it explicitly. Correcting yourself costs one paragraph;
  being caught costs the whole pack.
