# Forge Remote & Egress

How a Forge app reaches the outside world: declaring egress hosts, configuring `remotes:` for remote backends, and using OAuth providers for third-party auth.

## External fetch (egress allowlist)

Every external host must be declared in `manifest.yml`. There are three separate sections:

```yaml
permissions:
  external:
    fetch:
      backend:
        - api.openai.com           # resolver / function fetches
        - api.anthropic.com
        - "*.openai.azure.com"     # wildcard subdomains supported
        - "*.ts.net"               # e.g. Tailscale-routed self-host

      client:
        - api.openai.com           # Custom UI fetches from the iframe

    images:
      - cdn.atlassian.com          # allowed in <img src=...>
      - "*.gravatar.com"
```

- **`fetch.backend`** — what your Forge functions can reach.
- **`fetch.client`** — what the Custom UI iframe can reach with browser `fetch`. Separate from backend on purpose: the iframe runs in the user's browser.
- **`images`** — distinct from `fetch`; needed for direct `<img src=...>` references.

Wildcards are supported (`*.openai.azure.com`). The leading `*.` matches one or more subdomain labels.

> Egress changes require `forge install --upgrade` so the user re-approves. `forge tunnel` will not pick them up while running.

## Remotes (Forge Remote)

When the bulk of your app's code lives on your own backend (rather than as a Forge function), declare a `remote` and route module logic to it via `endpoint:` in module configs.

```yaml
remotes:
  - key: my-backend
    baseUrl: https://api.my-backend.example.com
    operations:
      - storage      # talks to Forge KVS on your behalf
    storage:
      inScopeEUD: false   # set true if you store in-scope End-User Data on the remote
```

Then a module can call out to the remote:

```yaml
modules:
  webtrigger:
    - key: receive
      endpoint:
        key: my-backend
        route:
          path: /forge/webtrigger
```

Forge invokes your remote backend with a signed JWT (Forge Invocation Token). Validate it server-side using the public JWKS:

```javascript
import * as jose from 'jose';

const JWKS = jose.createRemoteJWKSet(
  new URL('https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json')
);

export async function validateContextToken(token, appId) {
  const { payload } = await jose.jwtVerify(token, JWKS, { audience: appId });
  return payload;
}
```

`storage.inScopeEUD: false` declares that the remote does not store End-User Data subject to data residency. Set it `true` if you persist user-identifying data; this affects compliance reporting.

## OAuth providers (third-party auth on behalf of a user)

For services like Google or Dropbox, declare a provider on the function:

```yaml
function:
  - key: read-google-drive
    handler: index.read
    providers:
      auth:
        - provider: google
          requiredScopes:
            - https://www.googleapis.com/auth/drive.readonly
            - https://www.googleapis.com/auth/userinfo.email
```

Forge handles the OAuth dance, stores tokens for you, and refreshes them. Inside the handler, ask Forge for the token:

```javascript
import { authorize } from '@forge/api';

const auth = await authorize().for('google');
const r = await auth.fetch('https://www.googleapis.com/drive/v3/files', {
  headers: { Accept: 'application/json' },
});
```

Built-in providers (verify against the runtime reference for the current list): Google, Dropbox, GitHub, Microsoft. For arbitrary services, you can declare a custom provider with token endpoints.

## Worked example: CogniRunner-style egress

CogniRunner uses multiple AI providers plus user-hosted local models via Tailscale:

```yaml
permissions:
  external:
    fetch:
      backend:
        - api.openai.com
        - "*.openai.azure.com"
        - openrouter.ai
        - api.anthropic.com
        - "*.ts.net"           # Tailscale routes to user-hosted LM Studio
```

The point: declare the *minimum* set of hosts, but enumerate every variant your users may need (provider, region, custom). Don't try to wildcard your way to `*.com`.

## Gotchas

- **Backend ≠ client**. A host allowlisted only in `fetch.backend` can't be hit from the Custom UI iframe; you'd see a CSP error in the browser console.
- **Images are separate from fetch**. Allowlisting `images.atlassian.com` in `fetch.client` won't let `<img>` load it.
- **Wildcards**: `*.example.com` matches `a.example.com` but not `example.com` itself. List both if needed.
- **Remotes don't get Forge KVS automatically.** Add `operations: [storage]` and obey the `inScopeEUD` declaration.
- **OAuth tokens are not visible to your code**. You receive an `Authorize`-bound `fetch`; you don't see the bearer.
- **Network changes need `forge install --upgrade`**, not just `forge deploy`.

## See also

- `07-permissions-scopes.md` — Atlassian scopes
- `27-faas-limits-and-cost.md` — limit reference
- https://developer.atlassian.com/platform/forge/manifest-reference/permissions
- https://developer.atlassian.com/platform/forge/manifest-reference/remotes
- https://developer.atlassian.com/platform/forge/runtime-reference/authorize-api
