# Bullex - Commodity Trading Platform

## Overview
Bullex is a proprietary commodity trading platform of Bullfrog Group — an institutional-grade, blockchain-backed system for managing commodity trades, client onboarding, and trade documentation across global operations.

## Architecture
- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain**: Custom SHA-256 blockchain implementation for trade and KYC verification
- **Email**: Resend API (RESEND_API_KEY secret) for transactional emails (KYC confirmation)
- **Authentication**: express-session with ADMIN_USERNAME/ADMIN_PASSWORD environment secrets
- **Theme**: LSE.com-inspired colour scheme — deep burgundy/maroon (#990000) primary, institutional blue (#0084be) accent, dark charcoal sidebar, clean white cards

## Branding
- **Home page**: "Bullex Trading Platform" — commodity trading focused
- **Sidebar tagline**: "Commodity Trading Platform"
- **Sidebar footer**: "Bullex Commodity Trading Platform"
- **Contact email**: team@bullex.tech
- **Trade desk**: trade@bullex.tech
- **Global footer**: "Bullex is a proprietary platform of Bullfrog Group." (visible on every page via App.tsx)
- **Logo**: Shield icon (lucide-react) in primary color
- **Key messaging**: Institutional commodity trading, blockchain verification, trade lifecycle management

## Authentication
- Protected routes: `/kyc-admin`, `/platform`, `/documents`, `/trading`, `/vault`, `/blockchain`
- Public routes: `/`, `/products`, `/tokenization`, `/investor`, `/contact`, `/kyc-register`
- Backend: express-session with ADMIN_USERNAME/ADMIN_PASSWORD secrets, trust proxy enabled
- Frontend: AuthProvider context with useAuth hook, ProtectedRoute component renders Login page inline
- Login page: standalone card with username/password fields
- Sidebar shows username + logout button when authenticated

### Client Portal Authentication
- Approved KYC participants get `clientUsername` and `clientPassword` set by admin during approval
- Separate client auth system: `POST /api/client/login`, `/api/client/logout`, `/api/client/me`
- Session stores `role` ("admin" or "client"), `clientKycId`, `clientCompanyName`
- Client portal route: `/client-portal` (standalone, outside app shell)
- Client can view: their KYC data, trades (matched by company name), trade documents with download
- Credentials included in KYC approval email
- Frontend: ClientAuthProvider context with useClientAuth hook

## Routes
- `/` - Home page (commodity trading: 4-step workflow, 6 features, commodity divisions, tokenization section)
- `/products` - Tokenised Commodity Portfolio (5 divisions with BFG-20 token tags)
- `/tokenization` - Tokenisation page (BFG-20 tokens, 5-step process, tokenomics, revenue model, fund allocation)
- `/investor` - Investor page (why invest, revenue model, fund allocation, how to invest)
- `/kyc` - KYC Registration (10-section institutional form)
- `/kyc-admin` - Admin Dashboard (trade stats, chain status, recent trades + KYC administration with category & products fields) [PROTECTED]
- `/platform` - Platform tools (KYC, Docs, Trading, Vault, Ledger, Tokenisation) + Approved Participants section [PROTECTED]
- `/documents` - Document Generator [PROTECTED]
- `/trading` - Blockchain Trading [PROTECTED]
- `/vault` - Document Vault [PROTECTED]
- `/blockchain` - Blockchain Ledger [PROTECTED]
- `/trade-enquiries` - Trade Enquiries (create, manage, attach documents) [PROTECTED]
- `/client-portal` - Client Portal (client login/dashboard for viewing trades and documents) [STANDALONE]
- `/contact` - Contact page (Dubai, team@bullex.tech, +971585416399)
- `/kyc-register` - Standalone client KYC registration (no sidebar/nav)

## Key Features
- **Home**: Commodity trading landing — "Bullex Trading Platform", 6 feature cards (Blockchain Trading, KYC, Docs, Vault, Ledger, Compliance), 4-step workflow (Onboarding → Trade → Docs → Verification), commodity divisions, tokenization section, trade inquiry form
- **Tokenisation**: Full token registry with 12 BFG-20 tokens, 5-step process, tokenomics (revenue: issuance 0.5-1%, trading 0.25-0.5%, custody, licensing; fund allocation: Tech 40%, Sourcing 30%, Compliance 20%, Marketing 10%)
- **Investor**: Investment thesis, revenue model, fund allocation, 4-step investment process
- **Admin Dashboard**: Trade volume, chain status, recent trades, KYC approve/reject with category & products fields
- **Products**: Tokenised Commodity Portfolio (5 divisions with BFG-20 token badges)
- **Contact**: team@bullex.tech, tokenisation inquiries, investor onboarding, Dubai office
- **KYC Registration**: 10-section institutional KYC form
- **Blockchain Trading**: Commodity trade execution with blockchain verification
- **Document Generator**: Generate Deal Recap, FCO, SCO, ICPO, SPA, LOI, POP, POF, BCL, NCNDA, BL, COO, TFR with DOCX/PDF output, auto-email with PDF attachment, KYC client auto-fill, Review step (preview content before generating DOCX), Digital Signatures (draw-to-sign buyer/admin signature for all doc types, embedded in regenerated PDF/DOCX), Convert to PDF available for all doc types after signing
  - **TFR template**: Transaction Feasibility Report — internal feasibility assessment in a **dual Import/Export column** format with sections numbered 1,2,3,6,7,8,9,10,11 (faithful to the source DOCX, which omits 4 & 5; old "Product Feasibility" and "Market Analysis" sections were dropped): 1 Executive Summary, 2 Parties, 3 Financial Feasibility, 6 Trade Finance Feasibility, 7 Logistics Feasibility, 8 Legal & Compliance Review, 9 Risk Assessment, 10 Security Structure, 11 Overall Feasibility Conclusion, plus Prepared By/Date + Approved By/Date signature block. Form is a transient key/value map (`productDetails.tfrData`) — not schema columns. Exec Summary & Parties use **3-col tables** with per-row Import/Export inputs (keys like `productImport`/`productExport`, `partyImport`/`partyExport`); Financial section has a **4-col economics table** (`Particulars | Import (USD) | Export (USD) | Total (USD)`, keys `purchaseCostImport/Export/Total`, `freightImport/...`, `totalImport/...`, `grossProfitImport/...`, `netProfitImport/...`) plus a 2-col Summary table (`sumGrossProfit`, `importTotalCost`, `grossMargin`, `roi`, etc.); sections 7-10 use `Label: value` lines; conclusions/risk ratings use `[X]`/`[ ]` checkbox lines. DOCX/PDF use dedicated builders (`buildTfrDocx`/`buildTfrPdf`, gated by `isTfrContent`) that infer structure from the natural content string: numbered lines → shaded section headings, lines ending ":" → bold sub-labels, `Label: value` → borderless 2-col key/value tables, `a | b | c ...` pipe rows → real tables with shaded header. Pipe tables are **N-column-aware**: `flushTbl` counts columns per buffered table and routes to 2-/3-/4-col renderers (DOCX widths 2col `[6600,3400]`, 3col `[3600,3200,3200]`, 4col `[2800,2400,2400,2400]`; PDF via `drawPdf2ColTable`/`drawPdf3ColTable`/`drawPdf4ColTable`).
    - **TFR workflow (after Deal Recap)**: The TFR is prepared by the admin/risk team after a Deal Recap. Each Deal Recap row in the document list has a "Prepare TFR" button that opens the TFR form pre-filled from that recap. The TFR form also has a "Source Deal Recap" selector. Both call `fillTfrFromRecap`, which parses the Deal Recap content table (` Label │ Value` rows) and copies available fields into the dual-column `tfrData` keys: Contract Reference→reference; Commodity→product, Country of Origin→origin, Contractual Quantity→quantity, Contract Price & Currency→contractValue, Delivery Basis→deliveryTerms, Payment Terms→paymentTerms (each set on BOTH `*Import` and `*Export`); Seller→partyImport, Buyer→partyExport; the Shipping Terms "Port of Discharge (POD):" line→destination (Import+Export)+dischargePort; Country of Origin→loadingPort. Placeholder values (underscores/dashes) are skipped. The deal cascade (`runDealCascade` in server/routes.ts) auto-fills the same dual keys when consolidating import+export recaps, mapping Import column = purchase side and Export column = sale side.
  - **COO template**: Certificate of Origin — 3-column header table (Shipper, Consignee, Pre-Carriage/Port of Loading, Vessel Name, Port of Discharge/Final Destination | No. right column spanning all rows); 4-column goods table (Marks & Nos. | Description with NAME OF COMMODITY/PACKING/COUNTRY OF ORIGIN | QUANTITY METRIC TONS | Remark); full-width Certification text. Auto-fill from linked BL: selects existing BL document to populate shipper, vessel, port of loading, port of discharge, commodity, quantity, packing, country of origin. Cert No. field (loiIssueNumber). Fields editable after auto-fill. DOCX/PDF output with exact layout matching official COO template.
  - **BL template**: CONGENBILL Edition 1994 Bill of Lading — variable fields: shipper (seller), consignee (buyer), notify address, vessel name, port of loading, port of discharge, commodity, quantity MT, country of origin, packing, charter party date, freight advance, loading time (days + hours), place/date of issue, company on behalf, master of vessel, agents name. Fixed content: B/L No. 01, THREE (3) originals, full CONGENBILL conditions of carriage (General Paramount Clause with Hague/Hague-Visby Rules, General Average per York-Antwerp Rules 1994, New Jason Clause, Both-to-Blame Collision Clause). New ProductDetails fields: vesselName, notifyParty, packing, charterPartyDate, freightAdvance, loadingTimeDays, loadingTimeHours, placeOfIssue, dateOfIssue, companyOnBehalf, masterOfVessel, agentsName.
  - **NCNDA template**: 13-clause Mutual Non-Circumvention Non-Disclosure Agreement — Party A (seller fields) + Party B (buyer fields) auto-filled from approved KYC; fields: effective date (validity), governing law, jurisdiction (recapValidity), proposed transaction (commodity)
  - **NCNDA signing**: Party A (Issuer) signs as "seller", Party B (Receiving Party) signs as "buyer"; both shown side-by-side in document view. Send unlocked once Party A signs.
  - **NCNDA email send**: "Send NCNDA to Party B" dialog — Party B email (recipient) + Party A email (CC/issuer). Email includes PDF attachment + CC to issuing party.
  - **Deal Recap template**: 4 chapters (Introductory & Background, Scope & Commercial Terms, Financial & Operational Arrangements, Miscellaneous & Boilerplate) + dual signatory block + Annex I (Product Specification, Quality Premiums/Penalties, Sampling/Quality/Moisture/Quantity procedures)
  - **LOI template**: 12-row editable table with 3 sections (Issued to Seller, LOI Details, Issued by Buyer) + LOI-specific fields (validity, refPerson, contractConfirmation, docsForPayment, otherTerms, compliance)
  - **SCO template**: Seller's conditional offer with commodity parameters table (9 items) + issuer signatory section
  - **Review flow**: Fill form → Review (preview generated content) → Back to Edit or Generate DOCX
  - **Document Workflow**: LOI → SCO → Deal Recap → SPA lifecycle with send/accept/reject/amend flow
  - **Document Send**: Send button on each signed document in the list + in document view dialog. Select registered client + email. Sends email notification and pushes to Client Portal. Uses sentToClientId to link doc to KYC client.
  - **Client Portal Documents**: "Documents Pending Your Review" section shows sent documents. Clients can Accept or Request Amendment (with notes dialog).
  - **Accept/Reject**: Recipients can accept (triggers next doc creation) or reject with amendment notes
  - **Generate Next**: After acceptance, "Generate SCO" / "Generate Deal Recap" / "Generate SPA" buttons appear inline in the document list
  - **Amendment Flow**: Rejected docs show amendment notes, can be amended and resent
- **Document Vault**: All documents uploaded through blockchain trading pipeline
- **Blockchain Ledger**: Block explorer with accordion-based block details, shows both Trade and KYC blocks with type badges
- **Dark/Light Mode**: Theme toggle with persistence
- **Participants**: Approved KYC participants displayed as cards on Platform page with category & products badges

## Commodity Categories
- Minerals: Iron Ore, Bauxite, Manganese Ore
- Metals: Copper Cathode, Copper Concentrate, Aluminium Ingots
- Energy Products: Gasoil 10ppm, Gasoil 50ppm, LHC, HSFO, HSGO
- Petrochemicals: Petcoke – Anode Grade, Petcoke – Fuel Grade
- Fertilizers: NPK

## Participant Categories
Producer, Buyer, Seller, Analysis Agency, Port Agent, Shipping Agent, Chartering Broker, Ship Owner, Custom Clearing Agent, Stevedoring Agent

## Email Notifications
- KYC confirmation, approval, rejection emails
- Change request approved/rejected emails
- Document email with PDF attachment
- Signature pending email (sent when document is sent to client for review)
- Amendment requested email (sent to trade desk when client requests amendment)

## Data Model
- `users` - User accounts
- `kyc_applications` - 10-section KYC form data (company details, banking, compliance, signatory) + category + products fields + blockchain fields (blockchainHash, previousHash, blockNumber, nonce)
- `kyc_documents` - Uploaded KYC document files (linked to kyc_applications via kycApplicationId on submission)
- `trade_documents` - Uploaded trade pipeline document files
- `trades` - Commodity trades (tradeRef BFG-YYYY-XXXX, buyer/seller, origin/destination, incoterm, blockchain hash, stageDocuments JSONB)
- `blocks` - Blockchain blocks (hash, previous hash, nonce, verification, dataType: "trade"|"kyc", dataId, dataSummary)
- `kyc_change_requests` - Change requests for approved KYC applications (kycApplicationId, changedFields JSONB, reason, status: pending|approved|rejected, adminNotes, reviewedAt)
- `documents` - Trade documents (Deal Recap, FCO, SCO, ICPO, SPA, LOI, POP, POF, BCL, NCNDA) with docxPath, pdfPath, buyerEmail, sellerEmail, buyerSignature/sellerSignature (base64 PNG), buyerSignedName/sellerSignedName, buyerSignedAt/sellerSignedAt, enquiryRef, dealRecapNumber, sentTo, sentToClientId (links to KYC app id), recipientResponse (pending|accepted|rejected), recipientRespondedAt, recipientAmendmentNotes, parentDocId
- `trade_enquiries` - Trade enquiry records (enquiryRef format: [Party3]-[Product3]-DDMM-NNN, product, specifications, producer, quantity, unit, loadingPort, incoterms, validity, additionalInfo, status: open|under_review|quoted|closed|cancelled)
- `trade_enquiry_documents` - Files attached to trade enquiries (enquiryId, originalName, storedName, mimeType, size)

## Trade Pipeline (Document-Gated)
Trade flow: `pre_deal` → `deal` → `execution` → `final_payment`
Each stage has mandatory (M) and optional (O) documents. All mandatory docs must be confirmed before advancing.

## Sidebar Order
Home, Admin, Enquiries, Products, Platform, Client Portal, Investor, Contact

## Platform Page (/platform)
7 tool boxes: KYC Registration, Document Generator, Blockchain Trading, Document Vault, Blockchain Ledger, Tokenisation, Admin
Client KYC Registration link (/kyc-register) with Copy + Share buttons
Approved Participants section with category & products badges

## Banking & LC (/banking) [PROTECTED — module "banking"]
The admin "Banking & LC" page embeds the live Bullex Trade Bank dashboard inside the admin app shell (sidebar + topnav remain). It renders a header (title "Banking & LC" + "Open Full Trade Bank" link to `/trade-bank`) above the shared `<TradeBankFrame/>` component. The live-data + postMessage logic is extracted into `client/src/components/trade-bank-frame.tsx` and reused by both `/banking` (embedded) and `/trade-bank` (full-screen standalone). Same security model as the standalone page: sandboxed iframe without `allow-same-origin`, strict sender-window validation on both sides, HTML-escaped payload. Replaced the previous "Coming Soon" placeholder.

## Standalone Routes (outside app shell)
- `/kyc-register` - Standalone client KYC registration (no sidebar/nav)
- `/client-portal` - Client portal with own auth system (no sidebar/nav)
- `/trade-bank` - Bullex Trade Bank: full-screen trade-finance dashboard built from the supplied HTML mockup, recolored to the Bullex theme (burgundy #990000, blue #0084be, charcoal sidebar). Self-contained design (DM Serif Display, Font Awesome via CDN) with its own topbar+sidebar chrome and 7 internal pages (Dashboard, New Trade wizard, Risk Engine, Participants, Analytics, Documents, Notifications). Served statically from `client/public/trade-bank.html` and embedded via a sandboxed iframe (`sandbox="allow-scripts allow-popups allow-forms"`, no allow-same-origin) in `client/src/pages/trade-bank.tsx` with a burgundy "Back to Bullex" link. Linked from the public top navbar as "Trade Bank".
  - **Live data wiring**: When the user is authenticated (admin/team), the React parent (`trade-bank.tsx`) fetches `/api/trades`, `/api/kyc`, `/api/documents` (and `/api/notifications` for admin only), computes aggregates (KPIs, recent trades, approved participants, category counts, recent documents, notifications/alerts) and pushes them into the iframe via `window.postMessage({source:"bullex-parent", payload}, "*")`. The iframe-side script (appended in `trade-bank.html`) listens for that message, validates `source`, HTML-escapes (`esc()`), and renders into DOM hooks by id (`#kpi-volume/#kpi-active/#kpi-approval/#kpi-atrisk`, `#dash-sub`, `#recent-trades`, `#part-tbody/#part-sub`, `#ap-*` counts, `#doc-list`, `#alerts-list`, `#notif-list/#notif-sub`). Security boundary preserved: iframe stays sandboxed without `allow-same-origin`; all data is admin/team-protected server-side, so logged-out visitors get no postMessage and see the static demo content. Documents are role-scoped (team users see only their own; admin sees all); notifications are admin-only (team keeps demo alerts). The New Trade wizard is synced with the Deal Desk (`/trading`): all hardcoded demo data was removed (no prefilled volume/amount/tenor/date/seller/buyer/description, no demo participant chips, finance-summary rows show "—"); the Commodity Type select (`#nt-commodity`) lists the Bullex `commodityCategories` grouped by optgroup (Minerals/Metals/Energy/Petrochemicals/Fertilizers — matching `trades.tsx`), Incoterms match the deal desk (CIF/FOB/CFR/DAP), origin/destination are free-text inputs, and Seller (`#nt-seller`)/Buyer (`#nt-buyer`) are selects populated live via `renderParties()` from the postMessage `participants` list ("Bullfrog Group" + approved KYC company names, same source as deal-desk `approvedClients`). The wizard remains non-submitting (no backend create); Analytics monthly chart and sparklines remain decorative demo. The Dashboard "Commodity Exposure" panel (`#comm-exposure`) is also live: `trade-bank-frame.tsx` groups `/api/trades` by commodity name, sums `totalValue`, takes the top 4 by value plus an aggregated "Other", and sends a `commodityExposure[]` (`{label, value, pct, color}`) in the postMessage payload; the iframe `renderCommExposure()` fills `#comm-exposure` (esc()-escaped, bar width = value relative to the largest). Logged-out visitors keep the static demo rows. Posting is gated on an iframe `onLoad` + a `{source:"bullex-iframe",ready:true}` handshake to avoid race conditions.
  - **Risk Engine page = live shipments**: The "Risk Engine" page (`#page-risk`, heading "Shipment Risk & Tracking") shows live shipment details — there is no separate shipments table, the `trades` table IS the shipment data. `trade-bank-frame.tsx` derives a `shipments` array (ref, commodity, category, route origin→destination, quantity+unit, incoterm, value, buyer, seller, status badge) and `shipmentStats` (`{total, active, delivered, value}`) from `/api/trades` and adds them to the postMessage payload. The iframe `renderShipments()` fills tbody `#ship-tbody` (esc()-escaped) and the 4 stat cards `#ship-total/#ship-active/#ship-delivered/#ship-value` + subtitle `#risk-sub`. Logged-out visitors see static demo rows. The old hardcoded risk-engine demo (risk dial, risk dimensions, mitigation timeline, finance structure, involved parties) was removed.
  - **Topbar avatar = logged-in user**: The topbar avatar (`#tb-avatar`, formerly hardcoded "AK") reflects whoever is accessing the Trade Bank. `trade-bank-frame.tsx` derives a `user` object `{name, initials, role}` from `useAuth` (admin → "Administrator", team → "Team Member", display name from `/api/auth/me`/login `name` falling back to username) or `useClientAuth` (client → "Client", company name), and always includes `user` (or `null` when logged out) in the postMessage payload. Initials come from `avatarInitials()` (first letters of the first two words, or first two chars of a single word). The iframe `renderUser()` sets `#tb-avatar` textContent (initials) and title (`name · role`); when `user` is null it resets to the demo "AK"/"Profile", so the avatar reverts cleanly on logout without an iframe reload.
- `/deck` - Investor deck: full-screen 13-slide presentation (client/src/pages/investor-deck.tsx). "Ledger" concept (each slide framed as a blockchain BLOCK NN/13). Dark institutional navy theme (#0a1628) with burgundy/blue/gold accents. Keyboard nav (arrows/space/Home/End, F=fullscreen, P=print), click zones, dot nav, framer-motion transitions. "Save PDF" button triggers print; hidden print-only container renders all slides stacked at 1280x720 page size. Content: Cover, Problem, Solution, How It Works, Platform modules, Commodities, Tokenisation (BFG-20), Revenue model, Market opportunity, Why Now, Use of Funds, The Ask, Contact.

## Project Structure
```
client/src/
  components/
    app-sidebar.tsx      - Navigation sidebar with Shield logo
    theme-provider.tsx   - Dark/light theme context
    theme-toggle.tsx     - Theme toggle button
  hooks/
    use-auth.tsx         - AuthProvider context & useAuth hook
  pages/
    home.tsx             - Commodity trading landing page
    login.tsx            - Admin login page
    dashboard.tsx        - Legacy dashboard view
    products.tsx         - Tokenised Commodity Portfolio (5 divisions, 13 products)
    tokenization.tsx     - Token registry, tokenomics, revenue model
    investor.tsx         - Investor information page
    kyc.tsx              - 10-section KYC registration form
    trades.tsx           - Commodity trade management
    document-generator.tsx - Document type selector with trade linking
    vault.tsx            - Document vault grouped by type
    blockchain.tsx       - Blockchain ledger explorer
    contact.tsx          - Contact page
    kyc-admin.tsx        - Admin Dashboard (stats + KYC administration with category & products)
    platform.tsx         - Platform tools + Approved Participants
server/
  blockchain.ts          - SHA-256 hashing & proof-of-work mining
  routes.ts              - API endpoints (includes auth endpoints + session middleware with trust proxy)
  storage.ts             - Database operations
  seed.ts                - Database seeding with sample commodity trades
shared/
  schema.ts              - Drizzle schema definitions & Zod validators
```
