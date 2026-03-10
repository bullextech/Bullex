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
- **Document Generator**: Generate Deal Recap, FCO, SCO, ICPO, SPA, LOI, POP, POF, BCL with DOCX/PDF output, auto-email to buyer/seller with PDF attachment, KYC client auto-fill, Review step (preview content before generating DOCX), Digital Signatures (draw-to-sign for buyer/seller with embedded signatures in regenerated PDF/DOCX)
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
- `documents` - Trade documents (Deal Recap, FCO, SCO, ICPO, SPA, LOI, POP, POF, BCL) with docxPath, pdfPath, buyerEmail, sellerEmail, buyerSignature/sellerSignature (base64 PNG), buyerSignedName/sellerSignedName, buyerSignedAt/sellerSignedAt, enquiryRef, dealRecapNumber, sentTo, sentToClientId (links to KYC app id), recipientResponse (pending|accepted|rejected), recipientRespondedAt, recipientAmendmentNotes, parentDocId
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

## Standalone Routes (outside app shell)
- `/kyc-register` - Standalone client KYC registration (no sidebar/nav)
- `/client-portal` - Client portal with own auth system (no sidebar/nav)

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
