import { createHash } from "crypto";

export function computeHash(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function generateBlockHash(
  blockNumber: number,
  previousHash: string,
  timestamp: string,
  tradeData: string,
  nonce: number
): string {
  const data = `${blockNumber}${previousHash}${timestamp}${tradeData}${nonce}`;
  return computeHash(data);
}

export function generateTradeHash(
  tradeId: string,
  assetSymbol: string,
  type: string,
  quantity: number,
  price: number,
  timestamp: string
): string {
  const data = `${tradeId}:${assetSymbol}:${type}:${quantity}:${price}:${timestamp}`;
  return computeHash(data);
}

export function mineBlock(
  blockNumber: number,
  previousHash: string,
  timestamp: string,
  tradeData: string,
  difficulty: number = 2
): { hash: string; nonce: number } {
  let nonce = 0;
  const prefix = "0".repeat(difficulty);

  while (true) {
    const hash = generateBlockHash(blockNumber, previousHash, timestamp, tradeData, nonce);
    if (hash.startsWith(prefix)) {
      return { hash, nonce };
    }
    nonce++;
    if (nonce > 100000) {
      return { hash, nonce };
    }
  }
}

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
