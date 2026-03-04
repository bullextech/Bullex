# Bullex - Tokenisation of Real-World Commodities

## Overview
Bullex is a proprietary platform of Bullfrog Group — a blockchain-backed commodity tokenisation platform enabling fractional ownership, 1:1 asset-backed tokens, transparent settlement, and investor access (retail & institutional) to physical commodity markets.

## Architecture
- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain**: Custom SHA-256 blockchain implementation for trade verification
- **Theme**: LSE.com-inspired colour scheme — deep burgundy/maroon (#990000) primary, institutional blue (#0084be) accent, dark charcoal sidebar, clean white cards

## Branding
- **Position**: "Tokenisation of Real-World Commodities"
- **Sidebar tagline**: "Tokenisation • Commodities • Custody"
- **Contact email**: team@bullex.tech
- **Global footer**: "Bullex is a proprietary platform of Bullfrog Group." (visible on every page via App.tsx)
- **Logo**: Shield icon (lucide-react) in primary color

## Routes
- `/` - Home page (whitepaper-aligned: tokenisation, fractional ownership, 5-step process, quick stats, tokenomics)
- `/dashboard` - Dashboard (trade volume, chain status, recent trades, stats)
- `/products` - Commodity Divisions (5 divisions with tokenisation-focused descriptions)
- `/tokenization` - Tokenisation page (BFG-20 tokens, 5-step process, tokenomics, revenue model, fund allocation)
- `/kyc` - KYC Registration (10-section institutional form)
- `/kyc-admin` - KYC Administration (approve/reject applications)
- `/documents` - Document Generator
- `/trading` - Blockchain Trading
- `/vault` - Document Vault
- `/blockchain` - Blockchain Ledger
- `/contact` - Contact page (Dubai, team@bullex.tech, +971585416399)

## Key Features
- **Home**: Whitepaper-aligned landing — "Tokenising Real-World Commodities", 6 feature cards (1:1 Asset Backing, Fractional Access, Transparent Settlement, Blockchain Trading, KYC & Compliance, Automated Docs), 5-step process (Producer Lists → Auditors Validate → Smart Contract Issues → Investors Buy → Profits Redistributed), Quick Stats (USD 20M ask, 5 Divisions, Year 3 breakeven), tokenomics section
- **Tokenisation**: Full token registry with 12 BFG-20 tokens, 5-step process, tokenomics (revenue streams: issuance 0.5-1%, trading 0.25-0.5%, custody, licensing; fund allocation: Tech 40%, Sourcing 30%, Compliance 20%, Marketing 10%)
- **Dashboard**: Trade volume, chain status, recent trades, KYC/document stats
- **Products**: Commodity Divisions with tokenisation-focused descriptions (5 divisions: Minerals, Metals, Energy Products, Petrochemicals, Fertilizers)
- **KYC Registration**: 10-section institutional KYC form
- **Blockchain Trading**: Commodity trade execution with blockchain verification
- **Document Generator**: Generate SCO, FCO, ICPO, SPA, LOI, POP, POF, BCL linked to trades
- **Document Vault**: All documents uploaded through blockchain trading pipeline
- **Blockchain Ledger**: Block explorer with accordion-based block details
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
    app-sidebar.tsx      - Navigation sidebar with Shield logo
    theme-provider.tsx   - Dark/light theme context
    theme-toggle.tsx     - Theme toggle button
  pages/
    home.tsx             - Whitepaper-aligned landing page
    dashboard.tsx        - Main dashboard view
    products.tsx         - Commodity Divisions page (5 divisions, 13 products)
    tokenization.tsx     - Token registry, tokenomics, revenue model
    kyc.tsx              - 10-section KYC registration form
    trades.tsx           - Commodity trade management
    document-generator.tsx - Document type selector with trade linking
    vault.tsx            - Document vault grouped by type
    blockchain.tsx       - Blockchain ledger explorer
    contact.tsx          - Contact page
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
- `PATCH /api/kyc/:id/status` - Approve/reject KYC application
- `GET /api/trades` - List all trades (newest first)
- `POST /api/trades` - Create a new pre-deal trade
- `PATCH /api/trades/:id/status` - Advance trade stage
- `PATCH /api/trades/:id/documents` - Toggle document confirmation
- `GET /api/blocks` - List blockchain blocks (newest first)
- `GET /api/documents` - List all documents
- `POST /api/documents` - Generate a new document
- `GET /api/kyc-documents` - List uploaded KYC documents
- `POST /api/kyc-documents/upload` - Upload a KYC document
- `GET /api/kyc-documents/:id/download` - Download a KYC document
- `DELETE /api/kyc-documents/:id` - Delete a KYC document
- `GET /api/trades/:tradeId/files` - List uploaded documents for a trade
- `POST /api/trades/:tradeId/files/upload` - Upload a trade document
- `GET /api/trade-documents` - List ALL trade documents (for vault page)
- `GET /api/trade-documents/:id/view` - View a trade document inline
- `GET /api/trade-documents/:id/download` - Download a trade document
- `DELETE /api/trade-documents/:id` - Delete a trade document
