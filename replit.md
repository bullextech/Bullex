# BullEx — Tokenisation of Real-World Commodities

## Overview
BullEx is a blockchain-backed platform for tokenising real-world commodities (Gold, Copper, Iron Ore, Bauxite and more). It enables fractional ownership of physical commodities using audited, 1:1 asset-backed tokens built for retail and institutional investors seeking direct exposure with instant settlement and clear proof-of-reserve. The platform integrates producers, custodians, auditors, freight and buyers through a unified system with KYC onboarding, smart-contract-based settlement, and a document vault.

## Architecture
- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain**: Custom SHA-256 blockchain implementation for trade verification
- **Theme**: LSE.com-inspired colour scheme — deep burgundy/maroon (#990000) primary, institutional blue (#0084be) accent, dark charcoal sidebar, clean white cards

## Routes
- `/` - Home page (explains Bullex platform, features, workflow, commodity divisions, tokenization)
- `/dashboard` - Dashboard (trade volume, chain status, recent trades, stats)
- `/products` - Commodity Divisions (5 divisions with detailed product listings)
- `/kyc` - KYC Registration (10-section institutional form)
- `/kyc-admin` - KYC Administration (approve/reject applications)
- `/documents` - Document Generator
- `/trading` - Blockchain Trading
- `/vault` - Document Vault
- `/blockchain` - Blockchain Ledger
- `/contact` - Contact page (Dubai, team@bullex.tech, +971585416399)

## Key Features
- **Home**: Landing page — tokenisation positioning, 6 feature cards (1:1 Asset Backing, Fractional Access, Transparent Settlement, Blockchain Provenance, KYC Compliance, Regulatory Alignment), 5-step workflow (Producer → Auditors → Smart Contract → Investors → Profits), commodity divisions, tokenomics section, investment snapshot (USD 20M ask)
- **Dashboard**: Trade volume, chain status, recent trades, KYC/document stats
- **Products**: Commodity Divisions page matching bullfrog-group.replit.app (5 divisions: Minerals, Metals, Energy Products, Petrochemicals, Fertilizers with detailed product descriptions)
- **KYC Registration**: 10-section institutional KYC form matching bullfrog-group.replit.app (Company Details, Business Activity, Beneficial Owners, Management Structure, Financial Info, Banking, HR, Compliance, Documents, Signatory)
- **Blockchain Trading**: Commodity trade execution with blockchain verification (Minerals, Metals, Energy Products, Petrochemicals, Fertilizers)
- **Document Generator**: Generate SCO, FCO, ICPO, SPA, LOI, POP, POF, BCL linked to trades
- **Document Vault**: Shows all documents uploaded through blockchain trading pipeline, grouped by trade then by stage (Pre-Deal/Deal/Execution/Final Payment), with search, stage filter buttons, View (inline) and Download buttons, hero stats
- **Blockchain Ledger**: Block explorer with accordion-based block details, transaction drill-down
- **Dark/Light Mode**: Theme toggle with persistence

## Commodity Categories
- Minerals: Iron Ore, Bauxite, Manganese
- Metals: Copper Cathodes, Aluminium Ingots
- Energy Products: ULSD, HSGO, LPG
- Petrochemicals: Bitumen, Petcoke, Sulphur
- Fertilizers: NPK

## Data Model
- `users` - User accounts
- `kyc_applications` - 10-section KYC form data (company details, banking, compliance, signatory)
- `kyc_documents` - Uploaded KYC document files (documentType, originalName, storedName, mimeType, size). Files stored in uploads/kyc/ directory.
- `trade_documents` - Uploaded trade pipeline document files (tradeId, documentKey, originalName, storedName, mimeType, size). Files stored in uploads/trades/. Uploading auto-confirms the document checkbox; deleting last file for a key auto-unchecks it.
- `trades` - Commodity trades (tradeRef BFG-YYYY-XXXX, buyer/seller, origin/destination, incoterm, blockchain hash, stageDocuments JSONB for document gating)
- `blocks` - Blockchain blocks (hash, previous hash, nonce, verification)
- `documents` - Trade documents (SCO, FCO, ICPO, SPA, LOI, POP, POF, BCL)

## Trade Pipeline (Document-Gated)
Trade flow: `pre_deal` → `deal` → `execution` → `final_payment`
Each stage has mandatory (M) and optional (O) documents. All mandatory docs must be confirmed before advancing.
- **Pre-Deal**: KYC Registration (M), ICPO/Deal Recap (M), LOI (O), FCO (O)
- **Deal**: SPA (M), LC Draft (M), LC Copy (M), CPA (O), Performance Guarantee (O)
- **Execution**: COA (M), COW (M), COO (M), BL (M), Beneficiary Cert (M), Sight Draft (M), Commercial Invoice (M), plus optional loading/insurance docs
- **Final Payment**: COA/COW at Discharge Port (O), Final Invoice (O), Copy of Email (O)

## Project Structure
```
client/src/
  components/
    app-sidebar.tsx      - Navigation sidebar (8 items)
    theme-provider.tsx   - Dark/light theme context
    theme-toggle.tsx     - Theme toggle button
  pages/
    home.tsx             - Landing page explaining Bullex platform
    dashboard.tsx        - Main dashboard view
    products.tsx         - Commodity Divisions page (5 divisions, 13 products)
    kyc.tsx              - 10-section KYC registration form
    trades.tsx           - Commodity trade management
    document-generator.tsx - Document type selector with trade linking
    vault.tsx            - Document vault grouped by type
    blockchain.tsx       - Blockchain ledger explorer
server/
  blockchain.ts          - SHA-256 hashing & proof-of-work mining
  routes.ts              - API endpoints
  storage.ts             - Database operations with transactional trade execution
  seed.ts                - Database seeding with sample commodity trades
shared/
  schema.ts              - Drizzle schema definitions & Zod validators
```

## API Endpoints
- `GET /api/kyc` - List KYC applications
- `POST /api/kyc` - Submit KYC application
- `PATCH /api/kyc/:id/status` - Approve/reject KYC application (status: approved, rejected, pending; optional reviewNotes)
- `GET /api/trades` - List all trades (newest first)
- `POST /api/trades` - Create a new pre-deal trade (no blockchain block yet)
- `PATCH /api/trades/:id/status` - Advance trade stage (sequential: pre_deal → deal → execution → final_payment). Advancing from pre_deal to deal mines the blockchain block.
- `PATCH /api/trades/:id/documents` - Toggle document confirmation (docKey, checked)
- `GET /api/blocks` - List blockchain blocks (newest first)
- `GET /api/documents` - List all documents
- `POST /api/documents` - Generate a new document
- `GET /api/kyc-documents` - List uploaded KYC documents (optional ?documentType= filter)
- `POST /api/kyc-documents/upload` - Upload a KYC document (multipart form: file, documentType, optional kycApplicationId). Max 10MB, accepted: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX
- `GET /api/kyc-documents/:id/download` - Download a KYC document
- `DELETE /api/kyc-documents/:id` - Delete a KYC document
- `GET /api/trades/:tradeId/files` - List uploaded documents for a trade
- `POST /api/trades/:tradeId/files/upload` - Upload a trade document (multipart form: file, documentKey). Auto-confirms the document checkbox.
- `GET /api/trade-documents` - List ALL trade documents (for vault page)
- `GET /api/trade-documents/:id/view` - View a trade document inline in browser
- `GET /api/trade-documents/:id/download` - Download a trade document as attachment
- `DELETE /api/trade-documents/:id` - Delete a trade document (auto-unchecks if no remaining files for that key)
