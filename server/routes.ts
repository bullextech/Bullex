import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTradeSchema, insertKycSchema, insertDocumentSchema } from "@shared/schema";
import { generateTradeHash, mineBlock, GENESIS_HASH } from "./blockchain";
import { seedDatabase } from "./seed";

const stageMandatoryDocs: Record<string, string[]> = {
  pre_deal: ["kyc_registration", "icpo_deal_recap"],
  deal: ["spa", "lc_draft", "lc_copy"],
  execution: ["coa", "cow", "coo", "bl", "beneficiary_cert", "sight_draft", "commercial_invoice"],
  final_payment: [],
};

const allValidDocKeys = new Set([
  "kyc_registration", "loi", "fco", "icpo_deal_recap",
  "spa", "cpa", "lc_draft", "lc_copy", "performance_guarantee",
  "analysis_agency", "stevedoring_agency", "daily_loading_report",
  "coa", "cow", "coo", "bl", "beneficiary_cert", "certificate_insurance", "sight_draft", "commercial_invoice",
  "coa_disport", "cow_disport", "final_invoice", "copy_of_email",
]);

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

      const result = await storage.createPreDealTrade(parsed.data);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create trade" });
    }
  });

  app.patch("/api/trades/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const statusFlow = ["pre_deal", "deal", "execution", "final_payment"];
      if (!status || !statusFlow.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const trade = await storage.getTradeById(id);
      if (!trade) {
        return res.status(404).json({ message: "Trade not found" });
      }
      const currentIdx = statusFlow.indexOf(trade.status);
      const nextIdx = statusFlow.indexOf(status);
      if (nextIdx !== currentIdx + 1) {
        return res.status(409).json({ message: `Cannot transition from ${trade.status} to ${status}. Next valid status: ${statusFlow[currentIdx + 1] || "none"}` });
      }
      const docs = (trade.stageDocuments as Record<string, boolean>) || {};
      const mandatoryForCurrentStage = stageMandatoryDocs[trade.status] || [];
      const missingDocs = mandatoryForCurrentStage.filter((d) => docs[d] !== true);
      if (missingDocs.length > 0) {
        return res.status(409).json({ message: `Mandatory documents not confirmed for ${trade.status}: ${missingDocs.join(", ")}` });
      }

      if (trade.status === "pre_deal" && status === "deal") {
        const updated = await storage.mintTradeBlock(id, status, generateTradeHash, mineBlock, GENESIS_HASH);
        res.json(updated);
      } else {
        const updated = await storage.updateTradeStatus(id, status);
        if (!updated) {
          return res.status(500).json({ message: "Failed to update trade status" });
        }
        res.json(updated);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update trade status" });
    }
  });

  app.patch("/api/trades/:id/documents", async (req, res) => {
    try {
      const { id } = req.params;
      const { docKey, checked } = req.body;
      if (!docKey || typeof checked !== "boolean") {
        return res.status(400).json({ message: "Invalid request body" });
      }
      if (!allValidDocKeys.has(docKey)) {
        return res.status(400).json({ message: `Invalid document key: ${docKey}` });
      }
      const trade = await storage.getTradeById(id);
      if (!trade) {
        return res.status(404).json({ message: "Trade not found" });
      }
      const current = (trade.stageDocuments as Record<string, boolean>) || {};
      current[docKey] = checked;
      const updated = await storage.updateStageDocuments(id, current);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update documents" });
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
