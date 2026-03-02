import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTradeSchema } from "@shared/schema";
import { generateTradeHash, mineBlock, GENESIS_HASH } from "./blockchain";
import { seedDatabase } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  seedDatabase().catch((err) => console.error("Seed error:", err));

  app.get("/api/assets", async (_req, res) => {
    try {
      const result = await storage.getAssets();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  app.get("/api/trades", async (_req, res) => {
    try {
      const result = await storage.getTrades();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });

  app.post("/api/trades", async (req, res) => {
    try {
      const parsed = insertTradeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }

      const { assetSymbol, assetName, type, quantity, price, total } = parsed.data;

      if (quantity <= 0 || price <= 0) {
        return res.status(400).json({ message: "Quantity and price must be positive" });
      }

      if (type === "sell") {
        const existing = await storage.getAssetBySymbol(assetSymbol);
        if (!existing || existing.quantity < quantity) {
          return res.status(400).json({
            message: `Insufficient holdings. You have ${existing?.quantity || 0} ${assetSymbol} but tried to sell ${quantity}.`,
          });
        }
      }

      const result = await storage.executeTrade(
        { assetSymbol, assetName, type, quantity, price, total },
        generateTradeHash,
        mineBlock,
        GENESIS_HASH
      );

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create trade" });
    }
  });

  app.get("/api/blocks", async (_req, res) => {
    try {
      const result = await storage.getBlocks();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch blocks" });
    }
  });

  return httpServer;
}
