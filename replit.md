# Bullex - Commodity Trading Platform

## Overview
Bullex is a proprietary platform of Bullfrog Group — a blockchain-backed commodity trading platform for managing multi-stage trades (minerals, energy, metals, petrochemicals, fertilizers) with document uploads, blockchain verification, KYC registration, and a document vault.

## Architecture
- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain**: Custom SHA-256 blockchain implementation for trade verification
- **Theme**: LSE.com-inspired colour scheme — deep burgundy/maroon (#990000) primary, institutional blue (#0084be) accent, dark charcoal sidebar, clean white cards

## Branding
- **Position**: "Bullex Commodity Trading Platform" on all pages EXCEPT Tokenization page
- **Tokenization page only**: "Tokenisation of Real-World Commodities" whitepaper content with 5-step process, tokenomics, revenue model, fund allocation
- **Sidebar tagline**: "Commodity Trading Platform"
- **Sidebar nav label**: "Tokenization" (American spelling in nav)
- **Contact email**: trade@bullex.tech
- **Global footer**: "Bullex is a proprietary platform of Bullfrog Group." (visible on every page via App.tsx)
- **Logo**: Shield icon (lucide-react) in primary color

## Routes
- `/` - Home page (platform overview, features, 4-step workflow, commodity divisions, tokenization section)
- `/dashboard` - Dashboard (trade volume, chain status, recent trades, stats)
- `/products` - Commodity Divisions (5 divisions with detailed product listings)
- `/tokenization` - Tokenisation page (whitepaper-aligned: BFG-20 tokens, 5-step process, tokenomics, revenue model, fund allocation)
- `/kyc` - KYC Registration (10-section institutional form)
- `/kyc-admin` - KYC Administration (approve/reject applications)
- `/documents` - Document Generator
- `/trading` - Blockchain Trading
- `/vault` - Document Vault
- `/blockchain` - Blockchain Ledger
- `/contact` - Contact page (Dubai, trade@bullex.tech, +971585416399)

## Key Features
- **Home**: Landing page — "Bullex Commodity Trading Platform", 6 feature cards, 4-step workflow (Client Onboarding → Trade Execution → Document Generation → Verification & Audit), commodity divisions, tokenization section with BFG-20 standard
- **Tokenisation** (whitepaper-aligned): Full token registry with 12 BFG-20 tokens, 5-step process (Producer → Auditors → Smart Contract → Investors → Profits), tokenomics (revenue: issuance 0.5-1%, trading 0.25-0.5%, custody, licensing; fund allocation: Tech 40%, Sourcing 30%, Compliance 20%, Marketing 10%)
- **Dashboard**: Trade volume, chain status, recent trades, KYC/document stats
- **Products**: Commodity Divisions (5 divisions: Minerals, Metals, Energy Products, Petrochemicals, Fertilizers)
- **Contact**: trade@bullex.tech, trade inquiries, client onboarding, Dubai office
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
- `kyc_documents` - Uploaded KYC document files
- `trade_documents` - Uploaded trade pipeline document files
- `trades` - Commodity trades (tradeRef BFG-YYYY-XXXX, buyer/seller, origin/destination, incoterm, blockchain hash, stageDocuments JSONB)
- `blocks` - Blockchain blocks (hash, previous hash, nonce, verification)
- `documents` - Trade documents (SCO, FCO, ICPO, SPA, LOI, POP, POF, BCL)

## Trade Pipeline (Document-Gated)
Trade flow: `pre_deal` → `deal` → `execution` → `final_payment`
Each stage has mandatory (M) and optional (O) documents. All mandatory docs must be confirmed before advancing.

## Project Structure
```
client/src/
  components/
    app-sidebar.tsx      - Navigation sidebar with Shield logo
    theme-provider.tsx   - Dark/light theme context
    theme-toggle.tsx     - Theme toggle button
  pages/
    home.tsx             - Commodity Trading Platform landing page
    dashboard.tsx        - Main dashboard view
    products.tsx         - Commodity Divisions page (5 divisions, 13 products)
    tokenization.tsx     - Whitepaper-aligned tokenisation page (token registry, tokenomics)
    kyc.tsx              - 10-section KYC registration form
    trades.tsx           - Commodity trade management
    document-generator.tsx - Document type selector with trade linking
    vault.tsx            - Document vault grouped by type
    blockchain.tsx       - Blockchain ledger explorer
    contact.tsx          - Contact page
server/
  blockchain.ts          - SHA-256 hashing & proof-of-work mining
  routes.ts              - API endpoints
  storage.ts             - Database operations
  seed.ts                - Database seeding with sample commodity trades
shared/
  schema.ts              - Drizzle schema definitions & Zod validators
```
