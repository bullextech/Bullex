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
    status: "final_payment",
    stageDocuments: {
      kyc_registration: true, icpo_deal_recap: true, loi: true, fco: true,
      spa: true, cpa: true, lc_draft: true, lc_copy: true, performance_guarantee: true,
      coa: true, cow: true, coo: true, bl: true, beneficiary_cert: true, sight_draft: true, commercial_invoice: true,
      coa_disport: true, cow_disport: true, final_invoice: true,
    },
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
    status: "execution",
    stageDocuments: {
      kyc_registration: true, icpo_deal_recap: true, fco: true,
      spa: true, lc_draft: true, lc_copy: true,
      coa: true, cow: true,
    },
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
    status: "final_payment",
    stageDocuments: {
      kyc_registration: true, icpo_deal_recap: true, loi: true,
      spa: true, lc_draft: true, lc_copy: true,
      coa: true, cow: true, coo: true, bl: true, beneficiary_cert: true, sight_draft: true, commercial_invoice: true,
      coa_disport: true,
    },
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
    status: "final_payment",
    stageDocuments: {
      kyc_registration: true, icpo_deal_recap: true, fco: true,
      spa: true, lc_draft: true, lc_copy: true,
      coa: true, cow: true, coo: true, bl: true, beneficiary_cert: true, sight_draft: true, commercial_invoice: true,
      cow_disport: true, final_invoice: true,
    },
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
    status: "final_payment",
    stageDocuments: {
      kyc_registration: true, icpo_deal_recap: true,
      spa: true, lc_draft: true, lc_copy: true,
      coa: true, cow: true, coo: true, bl: true,
      beneficiary_cert: true, sight_draft: true, commercial_invoice: true,
    },
  },
];

const seedDocs = [
  { docType: "DEAL_RECAP", title: "Deal Recap - Iron Ore 50,000 MT Guinea-China", tradeIndex: 0, status: "final" },
  { docType: "FCO", title: "FCO - Iron Ore 50,000 MT Guinea-China", tradeIndex: 0, status: "final" },
  { docType: "SPA", title: "SPA - Iron Ore Supply Agreement", tradeIndex: 0, status: "final" },
  { docType: "ICPO", title: "ICPO - Copper Cathodes 5,000 MT", tradeIndex: 1, status: "final" },
  { docType: "LOI", title: "LOI - ULSD Supply Vietnam", tradeIndex: 2, status: "draft" },
  { docType: "DEAL_RECAP", title: "Deal Recap - Bauxite 75,000 MT Guinea-China", tradeIndex: 4, status: "draft" },
];

const validStatuses = new Set(["pre_deal", "initiated", "deal", "execution", "final_payment"]);
const statusOrder = ["pre_deal", "initiated", "deal", "execution", "final_payment"];

async function migrateExistingTrades() {
  const existingTrades = await storage.getTrades();
  if (existingTrades.length === 0) return;

  const commodityToSeed: Record<string, typeof seedTrades[0]> = {};
  for (const seed of seedTrades) {
    commodityToSeed[seed.commodity] = seed;
  }

  for (const trade of existingTrades) {
    const seed = commodityToSeed[trade.commodity];
    if (!seed) continue;

    const hasLegacyStatus = !validStatuses.has(trade.status);
    const currentIdx = statusOrder.indexOf(trade.status);
    const targetIdx = statusOrder.indexOf(seed.status);

    if (hasLegacyStatus || targetIdx > currentIdx) {
      await storage.updateTradeStatus(trade.id, seed.status);
      const seedDocs = seed.stageDocuments as Record<string, boolean>;
      await storage.updateStageDocuments(trade.id, seedDocs);
    }
  }
}

export async function seedDatabase() {
  const existingTrades = await storage.getTrades();
  if (existingTrades.length > 0) {
    await migrateExistingTrades();
    return;
  }

  let previousHash = GENESIS_HASH;
  const tradeRefs: string[] = [];

  let blockIdx = 0;
  for (let i = 0; i < seedTrades.length; i++) {
    const seed = seedTrades[i];
    const timestamp = new Date(Date.now() - (seedTrades.length - i) * 86400000).toISOString();
    const year = new Date().getFullYear();
    const hexSuffix = Math.random().toString(16).slice(2, 6).toUpperCase();
    const tradeRef = `BFG-${year}-${hexSuffix}`;
    tradeRefs.push(tradeRef);

    const isPreDeal = seed.status === "pre_deal" || seed.status === "initiated";

    if (isPreDeal) {
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
        stageDocuments: (seed as any).stageDocuments || {},
        blockchainHash: null,
        previousHash: null,
        blockNumber: null,
        nonce: null,
      });
    } else {
      blockIdx++;
      const blockNumber = blockIdx;

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
        stageDocuments: (seed as any).stageDocuments || {},
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

  await storage.createKycApplication({
    companyName: "Hunan Steel Corporation",
    registeredAddress: "28 Yuelu Road, Changsha, Hunan, China",
    primaryBusinessAddress: "Changsha Economic Development Zone, Building A",
    contactName: "Li Wei",
    contactTitle: "VP International Procurement",
    contactPhone: "+86 731 8823 4500",
    contactEmail: "liwei@hunansteel.cn",
    website: "https://hunansteel.cn",
    dateOfIncorporation: "08/11/2005",
    countryOfIncorporation: "China",
    countryOfOperation: "China, Southeast Asia",
    registrationNumber: "CN-91430100-MA4L5678X",
    taxIdNumber: "91430100MA4L5678X9",
    businessType: "End User / Manufacturer",
    coreBusinessDescription: "Steel manufacturing and iron ore processing for construction and infrastructure projects across China and Southeast Asia.",
    bankName: "Industrial and Commercial Bank of China",
    bankBranch: "Changsha Central Branch",
    bankAddress: "15 Furong Road, Changsha, Hunan",
    accountName: "Hunan Steel Corporation",
    accountNumber: "CN39 1200 0400 0056 7890 12",
    swiftCode: "ICBKCNBJ",
    bankAccountCurrency: "USD",
    capitalRange: "100M-500M",
    financialCurrency: "CNY",
    employeesCompany: "2,400",
    employeesGroup: "5,800",
    signatoryName: "Li Wei",
    signatoryTitle: "VP International Procurement",
    signatoryCompany: "Hunan Steel Corporation",
    signatoryPlaceDate: "Changsha, 20/01/2026",
  });

  await storage.createKycApplication({
    companyName: "PetroAsia Trading Pte Ltd",
    registeredAddress: "1 Raffles Place, Tower One, Singapore 048616",
    primaryBusinessAddress: "1 Raffles Place, #44-02",
    contactName: "Nguyen Thi Minh",
    contactTitle: "Head of Trading",
    contactPhone: "+65 6438 7700",
    contactEmail: "minh.nguyen@petroasia.sg",
    website: "https://petroasia.sg",
    dateOfIncorporation: "22/07/2012",
    countryOfIncorporation: "Singapore",
    countryOfOperation: "Singapore, Vietnam, Indonesia",
    registrationNumber: "SG-201209876Z",
    taxIdNumber: "M90012345Z",
    businessType: "Trader",
    coreBusinessDescription: "Physical commodity trading specializing in refined petroleum products (ULSD, HSGO, LPG) across Southeast Asian markets.",
    bankName: "DBS Bank",
    bankBranch: "Marina Bay Financial Centre",
    bankAddress: "12 Marina Boulevard, Singapore",
    accountName: "PetroAsia Trading Pte Ltd",
    accountNumber: "SG12 7171 0000 1234 5678",
    swiftCode: "DBSSSGSG",
    bankAccountCurrency: "USD",
    capitalRange: "50M-100M",
    financialCurrency: "SGD",
    employeesCompany: "120",
    signatoryName: "Nguyen Thi Minh",
    signatoryTitle: "Head of Trading",
    signatoryCompany: "PetroAsia Trading Pte Ltd",
    signatoryPlaceDate: "Singapore, 05/02/2026",
  });

  console.log(`Seeded ${seedTrades.length} trades, ${seedDocs.length} documents, and 3 KYC applications`);
}
