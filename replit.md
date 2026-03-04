# Bullex - Tokenisation of Real-World Commodities

## Overview
Bullex is a proprietary platform of Bullfrog Group — a blockchain-backed commodity tokenisation platform enabling fractional ownership, 1:1 asset-backed tokens, transparent settlement, and investor access (retail & institutional) to physical commodity markets across five core divisions.

## Architecture
- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain**: Custom SHA-256 blockchain implementation for trade verification
- **Theme**: LSE.com-inspired colour scheme — deep burgundy/maroon (#990000) primary, institutional blue (#0084be) accent, dark charcoal sidebar, clean white cards

## Branding
- **Position**: "Tokenisation of Real-World Commodities" — whitepaper-aligned across all pages
- **Hero tagline**: "Liquidity • Transparency • Access"
- **Sidebar tagline**: "Tokenisation • Commodities • Custody"
- **Sidebar nav label**: "Tokenisation" (British spelling)
- **Sidebar footer**: "Tokenisation of Real-World Commodities"
- **Contact email**: team@bullex.tech
- **Global footer**: "Bullex is a proprietary platform of Bullfrog Group." (visible on every page via App.tsx)
- **Logo**: Shield icon (lucide-react) in primary color

## Routes
- `/` - Home page (whitepaper landing: tokenisation hero, 5-step process, Quick Stats, tokenomics, commodity divisions)
- `/dashboard` - Dashboard (trade volume, chain status, recent trades, stats)
- `/products` - Commodity Divisions (5 divisions with tokenised descriptions, 1:1 asset-backed stat)
- `/tokenization` - Tokenisation page (BFG-20 token registry, 5-step process, tokenomics with revenue model & fund allocation)
- `/kyc` - KYC Registration (10-section institutional form)
- `/kyc-admin` - KYC Administration (approve/reject applications)
- `/documents` - Document Generator
- `/trading` - Blockchain Trading
- `/vault` - Document Vault
- `/blockchain` - Blockchain Ledger
- `/contact` - Contact page (Dubai, team@bullex.tech, tokenisation inquiries)

## Key Features
- **Home**: Whitepaper landing — "Tokenising Real-World Commodities", 6 feature cards (1:1 Asset Backing, Fractional Access, Transparent Settlement, Blockchain-Verified Trading, KYC & Compliance, Automated Documentation), 5-step process (Producer Lists → Auditors Validate → Smart Contract Issues → Investors Buy → Profits Redistributed), Quick Stats (USD 20M, 5 Divisions, Year 3), tokenomics section with revenue fees and fund allocation
- **Tokenisation**: Full token registry with 12 BFG-20 tokens, 5-step whitepaper process, tokenomics (revenue: issuance 0.5-1%, trading 0.25-0.5%, custody, licensing; fund allocation: Tech 40%, Sourcing 30%, Compliance 20%, Marketing 10%), BFG-20 standard details
- **Dashboard**: Trade volume, chain status, recent trades, KYC/document stats
- **Products**: Tokenised Commodity Divisions (5 divisions with tokenisation-focused descriptions, 1:1 Asset-Backed Tokens stat)
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

## Project Structure
```
client/src/
  components/
    app-sidebar.tsx      - Navigation sidebar with Shield logo
    theme-provider.tsx   - Dark/light theme context
    theme-toggle.tsx     - Theme toggle button
  pages/
    home.tsx             - Whitepaper landing page (tokenisation hero, 5-step, Quick Stats, tokenomics)
    dashboard.tsx        - Main dashboard view
    products.tsx         - Tokenised Commodity Divisions (5 divisions, 13 products, 1:1 asset-backed)
    tokenization.tsx     - Full tokenisation page (token registry, 5-step, tokenomics, BFG-20 standard)
    kyc.tsx              - 10-section KYC registration form
    trades.tsx           - Commodity trade management
    document-generator.tsx - Document type selector with trade linking
    vault.tsx            - Document vault grouped by type
    blockchain.tsx       - Blockchain ledger explorer
    contact.tsx          - Contact page (team@bullex.tech, tokenisation inquiries)
server/
  blockchain.ts          - SHA-256 hashing & proof-of-work mining
  routes.ts              - API endpoints
  storage.ts             - Database operations
  seed.ts                - Database seeding with sample commodity trades
shared/
  schema.ts              - Drizzle schema definitions & Zod validators
```
