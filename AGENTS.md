# Invoice System project guide

Read this file before changing this repository.

## Product

Invoice System is a private Appwrite-backed CRM and staged invoicing website.
It has no public registration. Staff accounts are provisioned by an Appwrite
administrator and use email/password plus Appwrite email MFA.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `site/` | Static Next.js staff website |
| `function/` | Privileged workflow and audit Function |
| `infra/` | Rerunnable Appwrite CLI installer |
| `docs/` | Product and architecture decisions |
| `appwrite.config.json` | Stable resource and schema plan |

Never expose `APPWRITE_API_KEY` to the Site. Browser code may use only public
endpoint/project/resource IDs. Financial issue/void/payment transitions belong
in the Function, not client code.

## Validation

- Web: `cd site && npm run typecheck && npm run build`
- Function: `cd function && npm test && npm run check`
- Infrastructure: `cd infra && npm run check`

Run `infra/npm run deploy` only when the user explicitly asks to modify remote
Appwrite state.

