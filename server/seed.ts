import { storage } from "./storage";
import { generateTradeHash, mineBlock, GENESIS_HASH } from "./blockchain";

const seedTrades = [
  {
    commodity: "Iron Ore",
    commodityCategory: "minerals",
    quantity: 50000,
    unit: "MT",
    pricePerUnit: 118.50,
    currency: "USD",
    buyerName: "Hunan Steel Corp",
    sellerName: "Bullfrog Group",
    origin: "Guinea",
    destination: "China",
    incoterm: "CIF",
    status: "completed",
  },
  {
    commodity: "Copper Cathodes",
    commodityCategory: "metals",
    quantity: 5000,
    unit: "MT",
    pricePerUnit: 8450.00,
    currency: "USD",
    buyerName: "Emirates Metals FZE",
    sellerName: "Bullfrog Group",
    origin: "Zambia",
    destination: "UAE",
    incoterm: "FOB",
    status: "in_transit",
  },
  {
    commodity: "ULSD",
    commodityCategory: "energy",
    quantity: 30000,
    unit: "MT",
    pricePerUnit: 685.00,
    currency: "USD",
    buyerName: "PetroAsia Trading",
    sellerName: "Bullfrog Group",
    origin: "Singapore",
    destination: "Vietnam",
    incoterm: "CIF",
    status: "lc_issued",
  },
  {
    commodity: "Bitumen",
    commodityCategory: "petrochemicals",
    quantity: 15000,
    unit: "MT",
    pricePerUnit: 320.00,
    currency: "USD",
    buyerName: "Mumbai Roads Authority",
    sellerName: "Bullfrog Group",
    origin: "Iran",
    destination: "India",
    incoterm: "CFR",
    status: "completed",
  },
  {
    commodity: "Bauxite",
    commodityCategory: "minerals",
    quantity: 75000,
    unit: "MT",
    pricePerUnit: 52.00,
    currency: "USD",
    buyerName: "Shandong Aluminium",
    sellerName: "Bullfrog Group",
    origin: "Guinea",
    destination: "China",
    incoterm: "FOB",
    status: "initiated",
  },
];

const seedDocs = [
  { docType: "SCO", title: "SCO - Iron Ore 50,000 MT Guinea-China", tradeIndex: 0, status: "final" },
  { docType: "FCO", title: "FCO - Iron Ore 50,000 MT Guinea-China", tradeIndex: 0, status: "final" },
  { docType: "SPA", title: "SPA - Iron Ore Supply Agreement", tradeIndex: 0, status: "final" },
  { docType: "ICPO", title: "ICPO - Copper Cathodes 5,000 MT", tradeIndex: 1, status: "final" },
  { docType: "LOI", title: "LOI - ULSD Supply Vietnam", tradeIndex: 2, status: "draft" },
  { docType: "SCO", title: "SCO - Bauxite 75,000 MT Guinea-China", tradeIndex: 4, status: "draft" },
];

export async function seedDatabase() {
  const existingTrades = await storage.getTrades();
  if (existingTrades.length > 0) return;

  let previousHash = GENESIS_HASH;
  const tradeRefs: string[] = [];

  for (let i = 0; i < seedTrades.length; i++) {
    const seed = seedTrades[i];
    const blockNumber = i + 1;
    const timestamp = new Date(Date.now() - (seedTrades.length - i) * 86400000).toISOString();
    const year = new Date().getFullYear();
    const hexSuffix = Math.random().toString(16).slice(2, 6).toUpperCase();
    const tradeRef = `BFG-${year}-${hexSuffix}`;
    tradeRefs.push(tradeRef);

    const tradeHash = generateTradeHash(
      tradeRef,
      seed.commodity,
      seed.commodityCategory,
      seed.quantity,
      seed.pricePerUnit,
      timestamp
    );

    const tradeData = `${tradeRef}:${seed.commodity}:${seed.quantity}:${seed.pricePerUnit}:${tradeHash}`;
    const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestamp, tradeData, 2);

    await storage.createTrade({
      tradeRef,
      commodity: seed.commodity,
      commodityCategory: seed.commodityCategory,
      quantity: seed.quantity,
      unit: seed.unit,
      pricePerUnit: seed.pricePerUnit,
      totalValue: seed.quantity * seed.pricePerUnit,
      currency: seed.currency,
      buyerName: seed.buyerName,
      sellerName: seed.sellerName,
      origin: seed.origin,
      destination: seed.destination,
      incoterm: seed.incoterm,
      status: seed.status,
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
      timestamp: new Date(timestamp),
    });

    previousHash = blockHash;
  }

  for (const doc of seedDocs) {
    await storage.createDocument({
      docType: doc.docType,
      title: doc.title,
      tradeRef: tradeRefs[doc.tradeIndex],
      status: doc.status,
    });
  }

  await storage.createKycApplication({
    companyName: "Emirates Metals FZE",
    registeredAddress: "Jebel Ali Free Zone, Dubai, UAE",
    primaryBusinessAddress: "JAFZA One Tower, Office 2105",
    contactName: "Ahmed Al-Rashid",
    contactTitle: "Managing Director",
    contactPhone: "+971 4 881 2200",
    contactEmail: "a.rashid@emiratesmetals.ae",
    website: "https://emiratesmetals.ae",
    dateOfIncorporation: "15/03/2018",
    countryOfIncorporation: "United Arab Emirates",
    countryOfOperation: "UAE, GCC",
    registrationNumber: "JAFZA-2018-45721",
    taxIdNumber: "TRN-100456789",
    businessType: "Trader",
    coreBusinessDescription: "International metals and minerals trading, specializing in copper cathodes, aluminium ingots, and iron ore sourcing from African origins.",
    bankName: "Emirates NBD",
    bankBranch: "JAFZA Branch",
    bankAddress: "Jebel Ali Free Zone, Dubai, UAE",
    accountName: "Emirates Metals FZE",
    accountNumber: "AE12 3456 7890 1234 5678 90",
    swiftCode: "EABORAEAXXX",
    bankAccountCurrency: "USD",
    capitalRange: "10M-50M",
    financialCurrency: "USD",
    employeesCompany: "45",
    signatoryName: "Ahmed Al-Rashid",
    signatoryTitle: "Managing Director",
    signatoryCompany: "Emirates Metals FZE",
    signatoryPlaceDate: "Dubai, 15/03/2025",
  });

  console.log(`Seeded ${seedTrades.length} trades, ${seedDocs.length} documents, and 1 KYC application`);
}
