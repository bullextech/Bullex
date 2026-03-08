import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertTradeSchema, insertKycSchema, insertDocumentSchema, type Trade } from "@shared/schema";
import { generateTradeHash, generateKycHash, generateKycAmendmentHash, mineBlock, GENESIS_HASH } from "./blockchain";
import { generateDocumentContent } from "./documentTemplates";
import { seedDatabase } from "./seed";
import { sendKycConfirmationEmail, sendKycApprovalEmail, sendKycRejectionEmail, sendChangeRequestApprovedEmail, sendChangeRequestRejectedEmail, sendDocumentEmail } from "./email";
import { generateDocx, generatePdf, getDocFilePath } from "./documentFileGenerator";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
    username: string;
    role: "admin" | "client";
    clientKycId: string;
    clientCompanyName: string;
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
  if (req.session && req.session.authenticated && req.session.role === "admin") {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.authenticated && req.session.role === "client") {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.set("trust proxy", 1);

  app.use(
    session({
      secret: process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "bullex-dev-only",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
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
      req.session.role = "admin";
      return res.json({ authenticated: true, username, role: "admin" });
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
      return res.json({ authenticated: true, username: req.session.username, role: req.session.role || "admin" });
    }
    res.json({ authenticated: false });
  });

  app.post("/api/client/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    try {
      const kyc = await storage.getKycByClientUsername(username);
      if (!kyc || kyc.clientPassword !== password || kyc.status !== "approved") {
        return res.status(401).json({ message: "Invalid credentials or account not active" });
      }
      req.session.authenticated = true;
      req.session.username = username;
      req.session.role = "client";
      req.session.clientKycId = kyc.id;
      req.session.clientCompanyName = kyc.companyName;
      return res.json({ authenticated: true, username, role: "client", companyName: kyc.companyName });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/client/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
  });

  app.get("/api/client/me", (req, res) => {
    if (req.session && req.session.authenticated && req.session.role === "client") {
      return res.json({
        authenticated: true,
        username: req.session.username,
        role: "client",
        kycId: req.session.clientKycId,
        companyName: req.session.clientCompanyName,
      });
    }
    res.json({ authenticated: false });
  });

  app.get("/api/client/kyc", requireClientAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.session.clientKycId!);
      if (!kyc) return res.status(404).json({ message: "KYC record not found" });
      const { clientPassword, ...safeKyc } = kyc;
      res.json(safeKyc);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC data" });
    }
  });

  app.get("/api/client/trades", requireClientAuth, async (req, res) => {
    try {
      const companyName = req.session.clientCompanyName!;
      const allTrades = await storage.getTrades();
      const clientTrades = allTrades.filter(
        (t) => t.buyerName === companyName || t.sellerName === companyName
      );
      res.json(clientTrades);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });

  app.get("/api/client/trades/:id/documents", requireClientAuth, async (req, res) => {
    try {
      const companyName = req.session.clientCompanyName!;
      const trade = await storage.getTradeById(req.params.id);
      if (!trade) return res.status(404).json({ message: "Trade not found" });
      if (trade.buyerName !== companyName && trade.sellerName !== companyName) {
        return res.status(403).json({ message: "Access denied" });
      }
      const docs = await storage.getTradeDocuments(trade.id);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trade documents" });
    }
  });

  app.get("/api/client/trade-documents/:id/download", requireClientAuth, async (req, res) => {
    try {
      const companyName = req.session.clientCompanyName!;
      const doc = await storage.getTradeDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const trade = await storage.getTradeById(doc.tradeId);
      if (!trade || (trade.buyerName !== companyName && trade.sellerName !== companyName)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const filePath = path.join(tradeUploadsDir, doc.storedName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      res.setHeader("Content-Disposition", `attachment; filename="${doc.originalName}"`);
      res.setHeader("Content-Type", doc.mimeType);
      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  seedDatabase().catch((err) => console.error("Seed error:", err));

  function sanitizeKyc(kyc: any) {
    const { clientPassword, ...safe } = kyc;
    return safe;
  }

  app.get("/api/kyc", async (_req, res) => {
    try {
      const result = await storage.getKycApplications();
      res.json(result.map(sanitizeKyc));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC applications" });
    }
  });

  app.patch("/api/kyc/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reviewNotes, category, products, clientUsername, clientPassword } = req.body;
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
      if (kyc.status === "approved") {
        return res.status(403).json({ message: "Approved applications cannot be modified" });
      }

      if (status === "approved") {
        if (!clientUsername || !clientPassword) {
          return res.status(400).json({ message: "Client username and password are required when approving" });
        }
        const existingUser = await storage.getKycByClientUsername(clientUsername);
        if (existingUser && existingUser.id !== id) {
          return res.status(400).json({ message: "This username is already in use by another client" });
        }
      }

      const updated = await storage.updateKycStatus(id, status, reviewNotes, category, products);

      let finalResult = updated;
      if (status === "approved") {
        await storage.updateKycClientCredentials(id, clientUsername, clientPassword);

        try {
          finalResult = await storage.mintKycBlock(id, generateKycHash, mineBlock, GENESIS_HASH);
          console.log(`[blockchain] KYC block minted for ${updated.companyName}, block #${finalResult.blockNumber}`);
        } catch (err: any) {
          console.error("[blockchain] KYC minting failed:", err.message);
        }

        const emailTo = updated.signatoryEmail || updated.contactEmail;
        if (emailTo) {
          sendKycApprovalEmail(
            emailTo,
            updated.companyName,
            updated.signatoryName || updated.contactName,
            category || updated.category,
            products || updated.products,
            clientUsername,
            clientPassword
          ).catch((err) => console.error("[email] background approval send failed:", err));
        }
        if (updated.filledByEmail && updated.filledByEmail !== emailTo) {
          sendKycApprovalEmail(
            updated.filledByEmail,
            updated.companyName,
            updated.filledByName || "Applicant",
            category || updated.category,
            products || updated.products,
            clientUsername,
            clientPassword
          ).catch((err) => console.error("[email] background approval send to filledBy failed:", err));
        }
      }

      if (status === "rejected") {
        const emailTo = updated.signatoryEmail || updated.contactEmail;
        if (emailTo) {
          sendKycRejectionEmail(
            emailTo,
            updated.companyName,
            updated.signatoryName || updated.contactName,
            reviewNotes
          ).catch((err) => console.error("[email] background rejection send failed:", err));
        }
        if (updated.filledByEmail && updated.filledByEmail !== emailTo) {
          sendKycRejectionEmail(
            updated.filledByEmail,
            updated.companyName,
            updated.filledByName || "Applicant",
            reviewNotes
          ).catch((err) => console.error("[email] background rejection send to filledBy failed:", err));
        }
      }

      res.json(sanitizeKyc(finalResult));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update KYC status" });
    }
  });

  app.get("/api/kyc-change-requests", requireAuth, async (_req, res) => {
    try {
      const requests = await storage.getKycChangeRequests();
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch change requests" });
    }
  });

  app.get("/api/kyc/:id/change-requests", async (req, res) => {
    try {
      const requests = await storage.getKycChangeRequestsByApplicationId(req.params.id);
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch change requests" });
    }
  });

  const ALLOWED_CHANGE_FIELDS = new Set([
    "companyName", "registeredAddress", "primaryBusinessAddress",
    "contactName", "contactTitle", "contactPhone", "contactEmail",
    "countryOfOperation", "businessType", "coreBusinessDescription",
    "bankName", "bankBranch", "bankAddress", "accountName", "accountNumber",
    "swiftCode", "bankAccountCurrency", "bankOfficerName", "bankOfficerEmail",
    "signatoryName", "signatoryTitle", "signatoryEmail", "signatoryCompany",
    "website", "faxNumber",
  ]);

  app.post("/api/kyc/:id/change-request", async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      if (kyc.status !== "approved") return res.status(400).json({ message: "Change requests can only be submitted for approved applications" });
      const { changedFields, reason } = req.body;
      if (!changedFields || typeof changedFields !== "object" || Object.keys(changedFields).length === 0) {
        return res.status(400).json({ message: "changedFields must be a non-empty object" });
      }
      const sanitized: Record<string, string> = {};
      for (const [key, val] of Object.entries(changedFields)) {
        if (ALLOWED_CHANGE_FIELDS.has(key) && typeof val === "string") {
          sanitized[key] = val;
        }
      }
      if (Object.keys(sanitized).length === 0) {
        return res.status(400).json({ message: "No valid fields to change" });
      }
      const created = await storage.createKycChangeRequest({
        kycApplicationId: req.params.id,
        changedFields: sanitized,
        reason: reason || null,
      });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create change request" });
    }
  });

  app.patch("/api/kyc-change-requests/:id/status", requireAuth, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status must be approved or rejected" });
      }
      if (status === "approved") {
        const updatedKyc = await storage.approveAndApplyChangeRequest(req.params.id, adminNotes);

        try {
          const latestBlock = await storage.getLatestBlock();
          const previousHash = latestBlock?.hash || GENESIS_HASH;
          const blockNumber = (latestBlock?.blockNumber || 0) + 1;
          const timestamp = new Date().toISOString();

          const changeReqs = await storage.getKycChangeRequestsByApplicationId(updatedKyc.id);
          const changeReq = changeReqs.find((cr) => cr.id === req.params.id);
          const changedFields = (changeReq?.changedFields || {}) as Record<string, any>;

          const amendmentHash = generateKycAmendmentHash(
            updatedKyc.companyName,
            updatedKyc.registrationNumber,
            changedFields,
            timestamp
          );
          const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestamp, amendmentHash);

          const fieldNames = Object.keys(changedFields).map((k) => k.replace(/([A-Z])/g, " $1").trim()).join(", ");
          await storage.createBlock({
            blockNumber,
            hash: blockHash,
            previousHash,
            nonce,
            tradeCount: 1,
            verified: true,
            timestamp: new Date(timestamp),
            dataType: "kyc_amendment",
            dataId: updatedKyc.id,
            dataSummary: `${updatedKyc.companyName} | Amendment: ${fieldNames}`,
          });
          console.log(`[blockchain] KYC amendment block minted for ${updatedKyc.companyName}, block #${blockNumber}`);
        } catch (err: any) {
          console.error("[blockchain] KYC amendment minting failed:", err.message);
        }

        try {
          const allReqs = await storage.getKycChangeRequestsByApplicationId(updatedKyc.id);
          const changeReqForEmail = allReqs.find((cr) => cr.id === req.params.id);
          const emailTo = updatedKyc.contactEmail || updatedKyc.signatoryEmail;
          if (emailTo && changeReqForEmail) {
            await sendChangeRequestApprovedEmail(
              emailTo,
              updatedKyc.companyName,
              updatedKyc.contactName || updatedKyc.signatoryName || "Participant",
              (changeReqForEmail.changedFields || {}) as Record<string, any>,
              adminNotes
            );
          }
        } catch (err: any) {
          console.error("[email] Change request approval email failed:", err.message);
        }

        res.json({ status: "approved", kycApplication: sanitizeKyc(updatedKyc) });
      } else {
        const updated = await storage.updateKycChangeRequestStatus(req.params.id, status, adminNotes);

        try {
          const changeReqs = await storage.getKycChangeRequests();
          const changeReq = changeReqs.find((cr) => cr.id === req.params.id);
          if (changeReq) {
            const kyc = await storage.getKycApplicationById(changeReq.kycApplicationId);
            if (kyc) {
              const emailTo = kyc.contactEmail || kyc.signatoryEmail;
              if (emailTo) {
                await sendChangeRequestRejectedEmail(
                  emailTo,
                  kyc.companyName,
                  kyc.contactName || kyc.signatoryName || "Participant",
                  (changeReq.changedFields || {}) as Record<string, any>,
                  adminNotes
                );
              }
            }
          }
        } catch (err: any) {
          console.error("[email] Change request rejection email failed:", err.message);
        }

        res.json(updated);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update change request" });
    }
  });

  app.post("/api/kyc", async (req, res) => {
    try {
      const parsed = insertKycSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const result = await storage.createKycApplication(parsed.data);

      const signatoryEmail = parsed.data.signatoryEmail;
      if (signatoryEmail) {
        sendKycConfirmationEmail(
          signatoryEmail,
          parsed.data.companyName,
          parsed.data.signatoryName || parsed.data.contactName
        ).catch((err) => console.error("[email] background send failed:", err));
      }
      if (parsed.data.filledByEmail && parsed.data.filledByEmail !== signatoryEmail) {
        sendKycConfirmationEmail(
          parsed.data.filledByEmail,
          parsed.data.companyName,
          parsed.data.filledByName || "Applicant"
        ).catch((err) => console.error("[email] background send to filledBy failed:", err));
      }

      res.json(sanitizeKyc(result));
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
      const { buyerDetails, sellerDetails, ...docData } = req.body;
      const parsed = insertDocumentSchema.safeParse(docData);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      let trade: Trade | undefined;
      if (parsed.data.tradeRef) {
        const trades = await storage.getTrades();
        trade = trades.find(t => t.tradeRef === parsed.data.tradeRef);
      }
      const content = generateDocumentContent(parsed.data.docType, trade, buyerDetails, sellerDetails);
      const result = await storage.createDocument({
        ...parsed.data,
        content,
        status: "draft",
        buyerEmail: buyerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null,
        sellerEmail: sellerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null,
      });

      try {
        const docxPath = await generateDocx(result.id, result.title, content);
        const pdfPath = await generatePdf(result.id, result.title, content);
        const updated = await storage.updateDocument(result.id, { docxPath, pdfPath });

        const buyerEmail = buyerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        const sellerEmail = sellerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        const buyerName = buyerDetails?.name || "Buyer";
        const sellerName = sellerDetails?.name || "Seller";

        if (buyerEmail) {
          sendDocumentEmail(buyerEmail, buyerName, parsed.data.docType, result.title, "Buyer", pdfPath)
            .catch(err => console.error("[docs] Failed to email buyer:", err));
        }
        if (sellerEmail) {
          sendDocumentEmail(sellerEmail, sellerName, parsed.data.docType, result.title, "Seller", pdfPath)
            .catch(err => console.error("[docs] Failed to email seller:", err));
        }

        res.json(updated);
      } catch (fileErr) {
        console.error("[docs] File generation error (document still created):", fileErr);
        res.json(result);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create document" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      res.json(doc);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  app.patch("/api/documents/:id", requireAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const allowedStatuses = ["draft", "review", "final"];
      const { title, content, status } = req.body;
      const updateData: Record<string, any> = {};
      if (typeof title === "string" && title.trim()) updateData.title = title.trim();
      if (typeof content === "string") updateData.content = content;
      if (typeof status === "string" && allowedStatuses.includes(status)) updateData.status = status;
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      const updated = await storage.updateDocument(req.params.id, updateData);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update document" });
    }
  });

  app.get("/api/documents/:id/download/docx", async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const filePath = doc.docxPath ? getDocFilePath(doc.docxPath) : null;
      if (!filePath) return res.status(404).json({ message: "DOCX file not available" });
      res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.docx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download DOCX" });
    }
  });

  app.get("/api/documents/:id/download/pdf", async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const filePath = doc.pdfPath ? getDocFilePath(doc.pdfPath) : null;
      if (!filePath) return res.status(404).json({ message: "PDF file not available" });
      res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.pdf"`);
      res.setHeader("Content-Type", "application/pdf");
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download PDF" });
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

  app.get("/api/kyc/:id/documents", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getKycDocumentsByApplicationId(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC application documents" });
    }
  });

  app.patch("/api/kyc/:id/link-documents", async (req, res) => {
    try {
      const { id } = req.params;
      const { documentIds } = req.body;
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "documentIds array required" });
      }
      await storage.linkKycDocumentsToApplication(id, documentIds);
      res.json({ message: "Documents linked successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to link documents" });
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
