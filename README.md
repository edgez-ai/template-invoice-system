# Invoice System

[![Use this template](https://img.shields.io/badge/Use%20this-template-238636?style=for-the-badge&logo=github)](https://github.com/new?template_name=template-invoice-system&template_owner=edgez-ai)
[![Deploy on EdgeZ](https://img.shields.io/badge/Deploy%20on-EdgeZ-6c5ce7?style=for-the-badge)](https://appwrite.edgez.ai/console/deploy?repo=https%3A%2F%2Fgithub.com%2Fedgez-ai%2Ftemplate-invoice-system)

An internal customer, sales, project, quotation, and staged-invoicing system
built on the same deployment pattern as `template-offgrid-tracker`:

- a static Next.js website deployed as an Appwrite Site;
- Appwrite Auth with backend-provisioned users and password + email MFA;
- Appwrite TablesDB for application data;
- Appwrite Storage for proposals, email files, quotations, invoices, and receipts;
- an Appwrite Function for privileged transitions, numbering, PDF generation,
  and audit logging; and
- declarative `appwrite.config.json` plus a rerunnable `infra/` installer.

There is no public registration flow. An administrator creates each user in
Appwrite and assigns the user to the internal staff team.

Each **Deploy on EdgeZ** run targets its own Appwrite project. EdgeZ injects the
new project's endpoint, project ID, and API key; the committed IDs identify
resources inside that project and do not reference the Offgrid Tracker project.

The implementation blueprint is in [docs/system-design.md](docs/system-design.md).

## Planned repository layout

| Path | Responsibility |
| --- | --- |
| `site/` | Next.js internal web application |
| `function/` | Privileged business workflows and document generation |
| `infra/` | Rerunnable Appwrite CLI installer and cleanup tools |
| `docs/` | Product and architecture decisions |
| `appwrite.config.json` | Stable Appwrite resource plan |
| `edgez.json` | EdgeZ deployment manifest |

## Delivery sequence

1. Foundation: auth/MFA, staff roles, layout, database, storage, and audit log.
2. CRM: companies, contacts, interests, follow-ups, and activity timeline.
3. Projects: project workspace, proposals, email records, files, and approval.
4. Commercial: quotations, billing stages, invoices, PDFs, and status tracking.
5. Finance: payment allocation, aging views, reminders, export, and reporting.

## Current implementation

The first vertical slice is implemented:

- responsive staff website and secure login/MFA enrollment screens;
- dashboard, company list/detail, global contact directory, interests, activity
  logging, and project list;
- interest-to-project conversion through the privileged Function;
- deterministic Appwrite database, staff team, encrypted file bucket, Function,
  Site, variables, platforms, and proxy-domain installation; and
- Function validation, role checks, number allocation, and audit logging.

The Finance view deliberately marks quotation, billing-stage, invoice, PDF, and
payment workflows as the next slice rather than exposing unsafe client-side
financial transitions.

## Local validation

```sh
cd site && npm ci && npm run typecheck && npm run build
cd ../function && npm ci && npm test && npm run check
cd ../infra && npm ci && npm run check
```

For local web development, copy `site/.env.example` to `site/.env.local` and
point it to a deployed Appwrite project. Never put an Appwrite API key in that
file.

