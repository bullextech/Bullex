import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTradeSchema, insertKycSchema, insertDocumentSchema } from "@shared/schema";
import { generateTradeHash, mineBlock, GENESIS_HASH } from "./blockchain";
import { seedDatabase } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  seedDatabase().catch((err) => console.error("Seed error:", err));

  app.get("/api/kyc", async (_req, res) => {
    try {
      const result = await storage.getKycApplications();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC applications" });
    }
  });

  app.post("/api/kyc", async (req, res) => {
    try {
      const parsed = insertKycSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const result = await storage.createKycApplication(parsed.data);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create KYC application" });
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

      const { quantity, pricePerUnit } = parsed.data;
      if (quantity <= 0 || pricePerUnit <= 0) {
        return res.status(400).json({ message: "Quantity and price must be positive" });
      }

      const result = await storage.executeTrade(
        parsed.data,
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

  app.get("/api/documents", async (_req, res) => {
    try {
      const result = await storage.getDocuments();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const parsed = insertDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const result = await storage.createDocument({
        ...parsed.data,
        status: "draft",
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create document" });
    }
  });

  return httpServer;
}
