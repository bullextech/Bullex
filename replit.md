# Bullex - Tokenisation of Real-World Commodities

## Overview
Bullex is a proprietary platform of Bullfrog Group — enabling fractional ownership of physical commodities through 1:1 asset-backed BFG-20 tokens. Built for retail and institutional investors seeking direct exposure to verified commodity assets with transparent blockchain settlement.

## Architecture
- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain**: Custom SHA-256 blockchain implementation for trade verification
- **Theme**: LSE.com-inspired colour scheme — deep burgundy/maroon (#990000) primary, institutional blue (#0084be) accent, dark charcoal sidebar, clean white cards

## Branding
- **Home page**: "Bullex Trading Platform" — commodity trading focused
- **Sidebar tagline**: "Trading Platform"
- **Sidebar footer**: "Bullex Trading Platform"
- **Other pages** (tokenization, investor, dashboard, products, contact): Retain whitepaper tokenisation content
- **Contact email**: team@bullex.tech
- **Global footer**: "Bullex is a proprietary platform of Bullfrog Group." (visible on every page via App.tsx)
- **Logo**: Shield icon (lucide-react) in primary color
- **Key messaging**: Fractional ownership, 1:1 asset backing, liquidity, transparency, investor access

## Routes
- `/` - Home page (commodity trading platform: 4-step workflow, 6 features, commodity divisions, tokenization section)
- `/dashboard` - Dashboard (trade volume, chain status, recent trades, stats)
- `/products` - Tokenised Commodity Portfolio (5 divisions with BFG-20 token tags)
- `/tokenization` - Tokenisation page (BFG-20 tokens, 5-step process, tokenomics, revenue model, fund allocation)
- `/investor` - Investor page (why invest, revenue model, fund allocation, how to invest)
- `/kyc` - KYC Registration (10-section institutional form)
- `/kyc-admin` - KYC Administration (approve/reject applications)
- `/documents` - Document Generator
- `/trading` - Blockchain Trading
- `/vault` - Document Vault
- `/blockchain` - Blockchain Ledger
- `/contact` - Contact page (Dubai, team@bullex.tech, +971585416399)

## Key Features
- **Home**: Commodity trading landing — "Bullex Trading Platform", 6 feature cards (Blockchain Trading, KYC, Docs, Vault, Ledger, Compliance), 4-step workflow (Onboarding → Trade → Docs → Verification), commodity divisions, tokenization section
- **Tokenisation**: Full token registry with 12 BFG-20 tokens, 5-step process, tokenomics (revenue: issuance 0.5-1%, trading 0.25-0.5%, custody, licensing; fund allocation: Tech 40%, Sourcing 30%, Compliance 20%, Marketing 10%)
- **Investor**: Investment thesis, revenue model, fund allocation, 4-step investment process
- **Dashboard**: Trade volume, chain status, recent trades, KYC/document stats
- **Products**: Tokenised Commodity Portfolio (5 divisions with BFG-20 token badges)
- **Contact**: team@bullex.tech, tokenisation inquiries, investor onboarding, Dubai office
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

## Sidebar Order
Home, Dashboard, Products, Platform, Investor, Contact

## Platform Page (/platform)
7 tool boxes: KYC Registration, Document Generator, Blockchain Trading, Document Vault, Blockchain Ledger, Tokenisation, Admin
Client KYC Registration link (/kyc-register) with Copy + Share buttons

## Standalone Routes (outside app shell)
- `/kyc-register` - Standalone client KYC registration (no sidebar/nav)

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
    products.tsx         - Tokenised Commodity Portfolio (5 divisions, 13 products)
    tokenization.tsx     - Token registry, tokenomics, revenue model
    investor.tsx         - Investor information page
    kyc.tsx              - 10-section KYC registration form
    trades.tsx           - Commodity trade management
    document-generator.tsx - Document type selector with trade linking
    vault.tsx            - Document vault grouped by type
    blockchain.tsx       - Blockchain ledger explorer
    contact.tsx          - Contact page
    kyc-admin.tsx        - KYC administration
server/
  blockchain.ts          - SHA-256 hashing & proof-of-work mining
  routes.ts              - API endpoints
  storage.ts             - Database operations
  seed.ts                - Database seeding with sample commodity trades
shared/
  schema.ts              - Drizzle schema definitions & Zod validators
```
