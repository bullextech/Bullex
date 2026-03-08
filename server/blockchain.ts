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
  tradeRef: string,
  commodity: string,
  commodityCategory: string,
  quantity: number,
  pricePerUnit: number,
  timestamp: string
): string {
  const data = `${tradeRef}:${commodity}:${commodityCategory}:${quantity}:${pricePerUnit}:${timestamp}`;
  return computeHash(data);
}

export function generateKycHash(
  companyName: string,
  registrationNumber: string,
  countryOfIncorporation: string,
  category: string,
  timestamp: string
): string {
  const data = `KYC:${companyName}:${registrationNumber}:${countryOfIncorporation}:${category}:${timestamp}`;
  return computeHash(data);
}

export function generateKycAmendmentHash(
  companyName: string,
  registrationNumber: string,
  changedFields: Record<string, any>,
  timestamp: string
): string {
  const fieldKeys = Object.keys(changedFields).sort().join(",");
  const data = `KYC_AMENDMENT:${companyName}:${registrationNumber}:${fieldKeys}:${timestamp}`;
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
