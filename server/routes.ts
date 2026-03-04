import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertTradeSchema, insertKycSchema, insertDocumentSchema } from "@shared/schema";
import { generateTradeHash, mineBlock, GENESIS_HASH } from "./blockchain";
import { seedDatabase } from "./seed";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
    username: string;
  }
}

const kycUploadsDir = path.join(process.cwd(), "uploads", "kyc");
const tradeUploadsDir = path.join(process.cwd(), "uploads", "trades");
if (!fs.existsSync(kycUploadsDir)) fs.mkdirSync(kycUploadsDir, { recursive: true });
if (!fs.existsSync(tradeUploadsDir)) fs.mkdirSync(tradeUploadsDir, { recursive: true });

const allowedExts = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"];

function createUploader(destDir: string, prefix: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, destDir),
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `${prefix}-${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("File type not allowed. Accepted: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX"));
      }
    },
  });
}

const kycUpload = createUploader(kycUploadsDir, "kyc");
const tradeUpload = createUploader(tradeUploadsDir, "trade");

const VALID_KYC_DOC_TYPES = [
  "certificate_of_incorporation",
  "memorandum_articles",
  "business_registration",
  "company_registration",
  "board_resolution_poa",
  "passport_copy",
  "audited_financial_statements",
  "bank_reference_letter",
  "proof_of_address",
];

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

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use(
    session({
      secret: process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "bullex-dev-only",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    })
  );

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminUser || !adminPass) {
      return res.status(500).json({ message: "Admin credentials not configured" });
    }
    if (username === adminUser && password === adminPass) {
      req.session.authenticated = true;
      req.session.username = username;
      return res.json({ authenticated: true, username });
    }
    res.status(401).json({ message: "Invalid username or password" });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.json({ authenticated: true, username: req.session.username });
    }
    res.json({ authenticated: false });
  });

  seedDatabase().catch((err) => console.error("Seed error:", err));

  app.get("/api/kyc", async (_req, res) => {
    try {
      const result = await storage.getKycApplications();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC applications" });
    }
  });

  app.patch("/api/kyc/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reviewNotes } = req.body;
      if (!status || !["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be: approved, rejected, or pending" });
      }
      if (reviewNotes !== undefined && (typeof reviewNotes !== "string" || reviewNotes.length > 2000)) {
        return res.status(400).json({ message: "Review notes must be a string under 2000 characters" });
      }
      const kyc = await storage.getKycApplicationById(id);
      if (!kyc) {
        return res.status(404).json({ message: "KYC application not found" });
      }
      const updated = await storage.updateKycStatus(id, status, reviewNotes);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update KYC status" });
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

  app.post("/api/trades", requireAuth, async (req, res) => {
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

  app.patch("/api/trades/:id/status", requireAuth, async (req, res) => {
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

  app.patch("/api/trades/:id/documents", requireAuth, async (req, res) => {
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

  app.post("/api/documents", requireAuth, async (req, res) => {
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

  app.get("/api/kyc-documents", async (req, res) => {
    try {
      const { documentType } = req.query;
      const result = await storage.getKycDocuments(documentType as string | undefined);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC documents" });
    }
  });

  app.post("/api/kyc-documents/upload", kycUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const { documentType, kycApplicationId } = req.body;
      if (!documentType || !VALID_KYC_DOC_TYPES.includes(documentType)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: "Invalid document type" });
      }
      const doc = await storage.createKycDocument({
        kycApplicationId: kycApplicationId || null,
        documentType,
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
      });
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to upload document" });
    }
  });

  app.get("/api/kyc-documents/:id/download", async (req, res) => {
    try {
      const docs = await storage.getKycDocuments();
      const doc = docs.find((d) => d.id === req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      const filePath = path.join(kycUploadsDir, doc.storedName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }
      res.setHeader("Content-Disposition", `attachment; filename="${doc.originalName}"`);
      res.setHeader("Content-Type", doc.mimeType);
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download document" });
    }
  });

  app.delete("/api/kyc-documents/:id", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getKycDocuments();
      const doc = docs.find((d) => d.id === req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      const filePath = path.join(kycUploadsDir, doc.storedName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await storage.deleteKycDocument(doc.id);
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete document" });
    }
  });

  app.get("/api/trade-documents", async (_req, res) => {
    try {
      const result = await storage.getAllTradeDocuments();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trade documents" });
    }
  });

  app.get("/api/trades/:tradeId/files", async (req, res) => {
    try {
      const result = await storage.getTradeDocuments(req.params.tradeId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trade documents" });
    }
  });

  app.post("/api/trades/:tradeId/files/upload", tradeUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const { documentKey } = req.body;
      if (!documentKey || !allValidDocKeys.has(documentKey)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: "Invalid document key" });
      }
      const trade = await storage.getTradeById(req.params.tradeId);
      if (!trade) {
        fs.unlinkSync(file.path);
        return res.status(404).json({ message: "Trade not found" });
      }
      const doc = await storage.createTradeDocument({
        tradeId: req.params.tradeId,
        documentKey,
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
      });
      const current = (trade.stageDocuments as Record<string, boolean>) || {};
      current[documentKey] = true;
      await storage.updateStageDocuments(trade.id, current);
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to upload trade document" });
    }
  });

  app.get("/api/trade-documents/:id/view", async (req, res) => {
    try {
      const doc = await storage.getTradeDocumentById(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      const filePath = path.join(tradeUploadsDir, doc.storedName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }
      res.setHeader("Content-Disposition", `inline; filename="${doc.originalName}"`);
      res.setHeader("Content-Type", doc.mimeType);
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to view document" });
    }
  });

  app.get("/api/trade-documents/:id/download", async (req, res) => {
    try {
      const doc = await storage.getTradeDocumentById(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      const filePath = path.join(tradeUploadsDir, doc.storedName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }
      res.setHeader("Content-Disposition", `attachment; filename="${doc.originalName}"`);
      res.setHeader("Content-Type", doc.mimeType);
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download document" });
    }
  });

  app.delete("/api/trade-documents/:id", async (req, res) => {
    try {
      const doc = await storage.getTradeDocumentById(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      const filePath = path.join(tradeUploadsDir, doc.storedName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await storage.deleteTradeDocument(doc.id);
      const trade = await storage.getTradeById(doc.tradeId);
      if (trade) {
        const current = (trade.stageDocuments as Record<string, boolean>) || {};
        const remaining = await storage.getTradeDocuments(doc.tradeId);
        const hasOtherForKey = remaining.some((d) => d.documentKey === doc.documentKey);
        if (!hasOtherForKey) {
          current[doc.documentKey] = false;
          await storage.updateStageDocuments(doc.tradeId, current);
        }
      }
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete trade document" });
    }
  });

  return httpServer;
}
