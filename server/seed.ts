import { storage } from "./storage";
import { generateTradeHash, mineBlock, GENESIS_HASH } from "./blockchain";

const seedTrades = [
  { symbol: "BTC", name: "Bitcoin", type: "buy" as const, quantity: 1.5, price: 42350.00 },
  { symbol: "ETH", name: "Ethereum", type: "buy" as const, quantity: 12.0, price: 2280.00 },
  { symbol: "SOL", name: "Solana", type: "buy" as const, quantity: 85.0, price: 98.50 },
  { symbol: "BTC", name: "Bitcoin", type: "sell" as const, quantity: 0.25, price: 44100.00 },
  { symbol: "AVAX", name: "Avalanche", type: "buy" as const, quantity: 150.0, price: 35.20 },
  { symbol: "ETH", name: "Ethereum", type: "buy" as const, quantity: 5.0, price: 2350.00 },
  { symbol: "SOL", name: "Solana", type: "sell" as const, quantity: 20.0, price: 105.75 },
  { symbol: "LINK", name: "Chainlink", type: "buy" as const, quantity: 200.0, price: 14.85 },
];

export async function seedDatabase() {
  const existingTrades = await storage.getTrades();
  if (existingTrades.length > 0) {
    return;
  }

  let previousHash = GENESIS_HASH;
  let blockNumber = 0;

  for (const seed of seedTrades) {
    blockNumber++;
    const timestamp = new Date(Date.now() - (seedTrades.length - blockNumber) * 3600000).toISOString();

    const tradeHash = generateTradeHash(
      `seed-${blockNumber}`,
      seed.symbol,
      seed.type,
      seed.quantity,
      seed.price,
      timestamp
    );

    const tradeData = `${seed.symbol}:${seed.type}:${seed.quantity}:${seed.price}:${tradeHash}`;
    const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestamp, tradeData, 2);

    await storage.createTrade({
      assetSymbol: seed.symbol,
      assetName: seed.name,
      type: seed.type,
      quantity: seed.quantity,
      price: seed.price,
      total: seed.quantity * seed.price,
      status: "confirmed",
      blockchainHash: tradeHash,
      previousHash,
      blockNumber,
      nonce,
    });

    await storage.createBlock({
      blockNumber,
      hash: blockHash,
      previousHash,
      nonce,
      tradeCount: 1,
      verified: true,
    });

    if (seed.type === "buy") {
      await storage.upsertAsset({
        symbol: seed.symbol,
        name: seed.name,
        quantity: seed.quantity,
        avgBuyPrice: seed.price,
        currentPrice: seed.price * (1 + (Math.random() * 0.1 - 0.03)),
        change24h: parseFloat((Math.random() * 8 - 2).toFixed(2)),
      });
    } else {
      const existing = await storage.getAssetBySymbol(seed.symbol);
      if (existing) {
        const newQty = Math.max(0, existing.quantity - seed.quantity);
        await storage.updateAsset(existing.id, {
          quantity: newQty,
          currentPrice: seed.price * (1 + (Math.random() * 0.1 - 0.03)),
          change24h: parseFloat((Math.random() * 8 - 2).toFixed(2)),
        });
      }
    }

    previousHash = blockHash;
  }

  console.log(`Seeded ${seedTrades.length} trades with blockchain verification`);
}
