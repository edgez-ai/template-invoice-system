# Invoice System

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

