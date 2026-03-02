# Bullex - Blockchain-Backed Trade Management

## Overview
Bullex is a professional trade management application with blockchain-backed transaction verification. Every trade is recorded on a simulated blockchain ledger with SHA-256 hashing, proof-of-work mining, and immutable block chains for full transparency.

## Architecture
- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain**: Custom SHA-256 blockchain implementation for trade verification

## Key Features
- **Dashboard**: Portfolio overview, recent trades, blockchain stats
- **Trade Management**: Create buy/sell trades with blockchain verification
- **Portfolio**: Asset holdings, allocation, P&L tracking
- **Blockchain Ledger**: Block explorer with transaction details, hashes, verification status
- **Dark/Light Mode**: Theme toggle with persistence

## Data Model
- `users` - User accounts
- `assets` - Portfolio asset holdings (symbol, quantity, avg price, current price)
- `trades` - Trade records (buy/sell with blockchain hash, block number)
- `blocks` - Blockchain blocks (hash, previous hash, nonce, verification)

## Project Structure
```
client/src/
  components/
    app-sidebar.tsx      - Navigation sidebar
    theme-provider.tsx   - Dark/light theme context
    theme-toggle.tsx     - Theme toggle button
  pages/
    dashboard.tsx        - Main dashboard view
    trades.tsx           - Trade management & history
    portfolio.tsx        - Asset portfolio view
    blockchain.tsx       - Blockchain ledger explorer
server/
  blockchain.ts          - SHA-256 hashing & proof-of-work mining
  routes.ts              - API endpoints
  storage.ts             - Database operations (Drizzle ORM)
  seed.ts                - Database seeding with sample trades
shared/
  schema.ts              - Drizzle schema definitions & Zod validators
```

## API Endpoints
- `GET /api/assets` - List portfolio assets
- `GET /api/trades` - List all trades (newest first)
- `POST /api/trades` - Create a new trade (auto-mines blockchain block)
- `GET /api/blocks` - List blockchain blocks (newest first)
