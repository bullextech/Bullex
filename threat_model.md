# Threat Model

## Project Overview

Bullex is a public-facing commodity trading platform with a React/Vite frontend, an Express/TypeScript backend, PostgreSQL/Drizzle persistence, server-side document generation, email delivery, and a custom blockchain-style audit trail for KYC and trade records. The production deployment is public on the internet. Primary users are Bullex administrators, internal team members, approved client organizations, and unauthenticated external applicants submitting KYC, registration, enquiry, or HR forms.

Production scope for security scans should focus on the Express API, session handling, file upload/download paths, document workflows, client/team/admin role boundaries, and external email/sanctions integrations. Mock or dev-only tooling should be ignored unless production reachability is demonstrated. Assume `NODE_ENV=production`, Replit-managed TLS is present, and only the main app port is internet reachable.

## Assets

- **Admin, team, and client credentials** — administrator secrets, team-member passwords, client portal credentials, password reset tokens, and active sessions. Compromise enables impersonation and downstream access to internal workflows and client data.
- **KYC and onboarding records** — company identifiers, signatory details, banking data, sanctions-screening results, uploaded identity/corporate documents, and participant IDs. This is highly sensitive commercial and personal data.
- **Trade and document records** — trades, enquiries, generated contracts, signatures, document files, amendment history, and workflow state. These are commercially sensitive and integrity-critical.
- **Uploaded files** — KYC uploads, trade documents, HR attachments, and team-member documents/photos stored on disk. Exposure or tampering can leak confidential material or falsify records.
- **Operational secrets and integrations** — session signing key, database connection string, Resend/API credentials, sanctions-screening credentials, and any admin email destinations.
- **Audit and blockchain-derived records** — minted block metadata, participant IDs, review decisions, and approval history. These support traceability and must not be forgeable by lower-privilege actors.

## Trust Boundaries

- **Browser to API** — all form submissions, dashboard actions, downloads, and client/team/admin workflows cross from an untrusted browser into the Express API. Every request must be authenticated and authorized server-side.
- **Public to authenticated surfaces** — the app intentionally exposes public onboarding and informational routes, while KYC review, document workflows, and internal operations should be restricted. This boundary is especially sensitive because the deployment is public.
- **Admin to team to client roles** — Bullex has multiple roles with materially different privileges. Role and module restrictions must be enforced on the backend, not only in React routing or navigation.
- **API to PostgreSQL** — the backend has direct access to all business and credential data. Query scope mistakes or broken authorization can disclose the entire dataset.
- **API to filesystem** — upload and document-generation endpoints create and serve files from local disk. User-controlled inputs must not grant access to other users’ files or permit unauthorized mutation.
- **API to third-party services** — email and sanctions-screening integrations receive sensitive business data. Failures must not leak credentials or internal records.
- **HTTP session to WebSocket chat** — chat upgrades reuse session identity and therefore inherit the same authentication and origin-validation requirements.

## Scan Anchors

- Production entry points: `server/index.ts`, `server/routes.ts`, `server/chat.ts`, `server/storage.ts`.
- Highest-risk areas: session/auth middleware in `server/routes.ts`; file upload/download handlers; document generation/send/sign flows; KYC approval and client/team provisioning; public-versus-authenticated route boundaries.
- Public surfaces include onboarding/KYC-style submissions and several file/document endpoints; authenticated surfaces include admin/team dashboards and client portal APIs.
- Frontend route guards in `client/src/App.tsx` are useful UX hints but are not authoritative for authorization decisions.
- Treat Vite dev middleware and other development-only paths as out of scope unless directly reachable in production.

## Threat Categories

### Spoofing

Bullex relies on cookie-backed sessions for admin, team, and client roles. The system must ensure credentials are stored with one-way password hashing, sessions are signed with a dedicated high-entropy secret, and every privileged request derives identity from the server-side session rather than client-controlled state. Password reset and credential-provisioning flows must not disclose reusable credentials over insecure channels.

### Tampering

The platform allows users to upload documents, generate legal/trade artifacts, request amendments, and advance workflow state. The backend must enforce which actors may create, modify, approve, sign, or delete records; the client must never be the source of truth for permissions or workflow transitions. Uploaded or generated files must be bound to the correct record and actor so other parties cannot replace or remove them.

### Information Disclosure

The application stores highly sensitive KYC, banking, trade, and document data. Public endpoints, download handlers, logs, and email flows must not expose records outside the intended audience. API responses should be scoped to the requesting principal, and sensitive artifacts such as uploaded documents or generated contracts must never be retrievable solely by knowing an identifier.

### Denial of Service

Public submission and upload endpoints can be invoked by unauthenticated users. The service must bound request sizes, file sizes, and any resource-intensive generation or screening work so external callers cannot exhaust CPU, storage, or email quotas.

### Elevation of Privilege

Bullex has a meaningful distinction between administrators, internal team members, and client organizations. All admin-only functions — approvals, credential issuance, membership management, broad data listing, and document workflow control — must be enforced server-side. Team-module restrictions exposed in React must be mirrored by backend checks, or a lower-privileged authenticated user can directly call privileged APIs.

### Repudiation

Approval, rejection, amendment, signing, and document-send actions have legal and compliance significance. The platform must preserve trustworthy attribution for who performed each sensitive action and when, and lower-privileged users must not be able to impersonate admin decisions through overly broad route access.
