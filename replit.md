# Bullex - Blockchain-Backed Trade Management

## Overview
Bullex is a standalone blockchain-backed trade management platform for Bullfrog Group (bullfrog-group.replit.app). It features KYC client onboarding, automated trade document generation, blockchain-verified commodity trading, and a document vault.

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
- `/documents` - Document Generator
- `/trading` - Blockchain Trading
- `/vault` - Document Vault
- `/blockchain` - Blockchain Ledger
- `/contact` - Contact page (Dubai, trade@bullex.tech, +971585416399)

## Key Features
- **Home**: Landing page explaining Bullex — platform overview, 6 feature cards, 4-step workflow, commodity divisions preview, commodity tokenization section (BFG-20 standard, 4-step flow, sample tokens), institutional trading section
- **Dashboard**: Trade volume, chain status, recent trades, KYC/document stats
- **Products**: Commodity Divisions page matching bullfrog-group.replit.app (5 divisions: Minerals, Metals, Energy Products, Petrochemicals, Fertilizers with detailed product descriptions)
- **KYC Registration**: 10-section institutional KYC form matching bullfrog-group.replit.app (Company Details, Business Activity, Beneficial Owners, Management Structure, Financial Info, Banking, HR, Compliance, Documents, Signatory)
- **Blockchain Trading**: Commodity trade execution with blockchain verification (Minerals, Metals, Energy Products, Petrochemicals, Fertilizers)
- **Document Generator**: Generate SCO, FCO, ICPO, SPA, LOI, POP, POF, BCL linked to trades
- **Document Vault**: Grouped document storage with trade linking and blockchain hash display
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
- `trades` - Commodity trades (tradeRef BFG-YYYY-XXXX, buyer/seller, origin/destination, incoterm, blockchain hash)
- `blocks` - Blockchain blocks (hash, previous hash, nonce, verification)
- `documents` - Trade documents (SCO, FCO, ICPO, SPA, LOI, POP, POF, BCL)

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
- `GET /api/trades` - List all trades (newest first)
- `POST /api/trades` - Create a new trade (auto-mines blockchain block)
- `GET /api/blocks` - List blockchain blocks (newest first)
- `GET /api/documents` - List all documents
- `POST /api/documents` - Generate a new document
