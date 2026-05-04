import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertTradeSchema, insertKycSchema, insertDocumentSchema, type Trade } from "@shared/schema";
import { generateTradeHash, generateKycHash, generateKycAmendmentHash, generateEnquiryTradeHash, mineBlock, GENESIS_HASH } from "./blockchain";
import { generateDocumentContent } from "./documentTemplates";
import { seedDatabase } from "./seed";
import { sendKycConfirmationEmail, sendKycApprovalEmail, sendKycRejectionEmail, sendChangeRequestApprovedEmail, sendChangeRequestRejectedEmail, sendDocumentEmail, sendSignaturePendingEmail, sendAmendmentRequestedEmail, sendKycSubmittedAdminEmail, sendKycActionAdminCopyEmail, sendKycOnboardingInviteEmail, sendRegistrationConfirmationEmail, sendRegistrationAdminEmail, sendRegistrationApprovalEmail, sendRegistrationRejectionEmail, sendEnquiryCreatedNotification, sendEnquiryClientResponseNotification, sendEnquiryStatusNotification, sendJobApplicationToHR, sendJobApplicationAcknowledgement } from "./email";
import { generateDocx, generatePdf, getDocFilePath, regenerateWithSignatures } from "./documentFileGenerator";

const ADMIN_CHECKLISTS: Record<string, string[]> = {
  LOI: [
    "Buyer details verified against KYC records",
    "Product specification matches enquiry",
    "Quantity and unit are correct",
    "Price and payment terms acceptable",
    "Laycan / delivery timeline is feasible",
    "Port of loading and discharge correct",
    "Enquiry reference number present and valid",
  ],
  SCO: [
    "Seller details verified against KYC records",
    "LOI reference correctly cited",
    "Product grade and specifications complete",
    "Quantity, price, and unit match LOI",
    "Inspection clause included",
    "Laycan dates consistent with LOI",
    "Payment terms match LOI",
  ],
  FCO: [
    "Seller details verified against KYC records",
    "Product grade and specifications complete",
    "Quantity, price, and unit specified",
    "Payment and delivery terms defined",
    "Validity period stated",
    "Inspection clause included",
    "Signatory authorized",
  ],
  DEAL_RECAP: [
    "Buyer and Seller details correct",
    "LOI and SCO references cited",
    "Product, qty, price match all prior documents",
    "Total contract value calculated correctly",
    "Payment, laycan, inspection terms consistent",
    "Arbitration and governing law clause present",
    "Deal Recap number format correct",
  ],
  SPA: [
    "Deal Recap reference number cited",
    "All commercial terms match Deal Recap",
    "Force majeure clause included",
    "Penalty and dispute resolution defined",
    "Both party signatories identified",
    "SPA number matches Deal Recap number",
    "Governing law and jurisdiction confirmed",
  ],
};
const DEFAULT_CHECKLIST = [
  "Document details complete and accurate",
  "Trade reference verified",
  "Counterparty details correct",
  "Terms and conditions reviewed",
  "Compliance requirements met",
];

function buildAdminChecks(docType: string): Array<{ label: string; checked: boolean }> {
  const labels = ADMIN_CHECKLISTS[docType] || DEFAULT_CHECKLIST;
  return labels.map(label => ({ label, checked: false }));
}

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
const enquiryUploadsDir = path.join(process.cwd(), "uploads", "enquiries");
const hrUploadsDir = path.join(process.cwd(), "uploads", "hr");
if (!fs.existsSync(kycUploadsDir)) fs.mkdirSync(kycUploadsDir, { recursive: true });
if (!fs.existsSync(tradeUploadsDir)) fs.mkdirSync(tradeUploadsDir, { recursive: true });
if (!fs.existsSync(enquiryUploadsDir)) fs.mkdirSync(enquiryUploadsDir, { recursive: true });
if (!fs.existsSync(hrUploadsDir)) fs.mkdirSync(hrUploadsDir, { recursive: true });

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
const enquiryUpload = createUploader(enquiryUploadsDir, "enquiry");
const hrUpload = createUploader(hrUploadsDir, "hr");

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
  if (req.session && req.session.authenticated && (req.session.role === "admin" || req.session.role === "team")) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
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

  const PgSession = connectPgSimple(session);
  const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  app.use(
    session({
      store: new PgSession({
        pool: pgPool,
        tableName: "session",
        createTableIfMissing: false,
      }),
      secret: process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "bullex-dev-only",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
        sameSite: "none",
      },
    })
  );

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminUser || !adminPass) {
      return res.status(500).json({ message: "Admin credentials not configured" });
    }
    const validUsername = username === adminUser || (adminEmail && username === adminEmail);
    if (validUsername && password === adminPass) {
      req.session.regenerate(() => {
        req.session.authenticated = true;
        req.session.username = adminUser;
        req.session.role = "admin";
        req.session.save(() => {
          return res.json({ authenticated: true, username: adminUser, role: "admin" });
        });
      });
      return;
    }
    const teamMember = await storage.getTeamMemberByUsername(username);
    if (teamMember && teamMember.password === password) {
      req.session.regenerate(() => {
        req.session.authenticated = true;
        req.session.username = teamMember.username;
        req.session.role = "team";
        req.session.save(() => {
          return res.json({ authenticated: true, username: teamMember.username, role: "team", name: teamMember.name });
        });
      });
      return;
    }
    res.status(401).json({ message: "Invalid username or password" });
  });

  app.get("/api/team/members", requireAdminAuth, async (req, res) => {
    const members = await storage.getAllTeamMembers();
    res.json(members.map(m => ({ ...m, password: undefined })));
  });

  app.post("/api/team/members", requireAdminAuth, async (req, res) => {
    const { username, password, name, department, email } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ message: "username, password, and name are required" });
    }
    try {
      const member = await storage.createTeamMember({ username, password, name, department: department || null, email: email || null });
      res.json({ ...member, password: undefined });
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  app.delete("/api/team/members/:id", requireAdminAuth, async (req, res) => {
    await storage.deleteTeamMember(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/team-kyc", requireAdminAuth, async (req, res) => {
    const apps = await storage.getTeamKycApplications();
    res.json(apps.map(a => ({ ...a, teamPassword: undefined })));
  });

  app.post("/api/team-kyc", async (req, res) => {
    try {
      const { fullName, email, ...rest } = req.body;
      if (!fullName || !email) {
        return res.status(400).json({ message: "fullName and email are required" });
      }
      const app = await storage.createTeamKycApplication({ fullName, email, ...rest });
      res.json(app);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to submit application" });
    }
  });

  app.patch("/api/team-kyc/:id", requireAdminAuth, async (req, res) => {
    try {
      const { status, reviewNotes, teamUsername, teamPassword } = req.body;
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app) return res.status(404).json({ message: "Application not found" });

      const updated = await storage.updateTeamKycStatus(
        req.params.id, status, reviewNotes, teamUsername, teamPassword
      );

      if (status === "approved" && teamUsername && teamPassword) {
        try {
          const existing = await storage.getTeamMemberByUsername(teamUsername);
          if (!existing) {
            await storage.createTeamMember({
              username: teamUsername,
              password: teamPassword,
              name: app.fullName,
              department: app.department || null,
              email: app.email || null,
            });
          }
        } catch (_) {}
      }

      res.json({ ...updated, teamPassword: undefined });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update application" });
    }
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
      req.session.regenerate(() => {
        req.session.authenticated = true;
        req.session.username = username;
        req.session.role = "client";
        req.session.clientKycId = kyc.id;
        req.session.clientCompanyName = kyc.companyName;
        req.session.save(() => {
          return res.json({ authenticated: true, username, role: "client", companyName: kyc.companyName });
        });
      });
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

  app.post("/api/client/enquiries/:id/respond", requireClientAuth, async (req, res) => {
    try {
      const { response } = req.body;
      if (!["accepted", "rejected"].includes(response)) {
        return res.status(400).json({ message: "Response must be 'accepted' or 'rejected'" });
      }
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      const companyName = req.session.clientCompanyName!;
      const updated = await storage.updateTradeEnquiryClientResponse(
        req.params.id,
        response,
        companyName
      );

      if (response === "accepted" && enquiry.status !== "accepted") {
        try {
          const categoryMap: Record<string, string> = {
            "Iron Ore": "minerals", "Bauxite": "minerals", "Manganese Ore": "minerals",
            "Copper Cathode": "metals", "Copper Concentrate": "metals", "Aluminium Ingots": "metals",
            "Gasoil 10ppm": "energy", "Gasoil 50ppm": "energy", "LHC": "energy", "HSFO": "energy", "HSGO": "energy",
            "Petcoke – Anode Grade": "petrochemicals", "Petcoke – Fuel Grade": "petrochemicals",
            "NPK": "fertilizers", "Sulphur – Granular": "fertilizers", "Sulphur – Lumps": "fertilizers",
          };
          const commodityCategory = categoryMap[enquiry.product] || "minerals";
          const isBuyer = enquiry.side === "buy";
          const buyerName = isBuyer ? (enquiry.createdBy || companyName) : companyName;
          const sellerName = !isBuyer ? (enquiry.createdBy || companyName) : companyName;

          const trade = await storage.createPreDealTrade({
            commodity: enquiry.product,
            commodityCategory,
            quantity: parseFloat(enquiry.quantity || "0") || 0,
            unit: enquiry.unit || "MT",
            pricePerUnit: 0,
            totalValue: 0,
            currency: "USD",
            buyerName,
            sellerName,
            origin: enquiry.loadingPort || "TBD",
            destination: "TBD",
            incoterm: enquiry.incoterms || "FOB",
          });

          const latestBlock = await storage.getLatestBlock();
          const previousHash = latestBlock ? latestBlock.hash : GENESIS_HASH;
          const blockNumber = latestBlock ? latestBlock.blockNumber + 1 : 1;
          const timestamp = new Date().toISOString();

          const enquiryHash = generateEnquiryTradeHash(
            enquiry.enquiryRef,
            enquiry.product,
            enquiry.side,
            enquiry.quantity,
            companyName,
            timestamp
          );

          const tradeData = `${enquiry.enquiryRef}:${enquiry.product}:TRADE_INITIATED:${trade.tradeRef}:${enquiryHash}`;
          const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestamp, tradeData, 2);

          await storage.createBlock({
            blockNumber,
            hash: blockHash,
            previousHash,
            nonce,
            tradeCount: 1,
            verified: true,
            dataType: "trade",
            dataId: trade.id,
            dataSummary: `Trade ${trade.tradeRef} initiated from ${enquiry.enquiryRef} | ${enquiry.side.toUpperCase()} ${enquiry.product} | Accepted by ${companyName}`,
          });

          console.log(`[trade] Auto-created trade ${trade.tradeRef} from enquiry ${enquiry.enquiryRef}, blockchain block #${blockNumber}`);
        } catch (err: any) {
          console.error("[trade] Auto-create trade from client acceptance failed:", err.message);
        }
      }

      sendEnquiryClientResponseNotification(enquiry, response, companyName).catch(() => {});
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to submit response" });
    }
  });

  app.get("/api/client/enquiries", requireClientAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.session.clientKycId!);
      if (!kyc) return res.status(404).json({ message: "KYC record not found" });
      const allEnquiries = await storage.getTradeEnquiries();
      const kycProducts = (kyc.products || kyc.coreBusinessDescription || "")
        .split(/[,;\/|]+/)
        .map((p: string) => p.trim().toLowerCase())
        .filter(Boolean);
      const matched = allEnquiries.filter((e) => {
        const product = e.product.toLowerCase();
        return kycProducts.some((kp: string) => product.includes(kp) || kp.includes(product));
      });
      res.json(matched);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch enquiries" });
    }
  });

  app.get("/api/client/documents", requireClientAuth, async (req, res) => {
    try {
      const kycId = req.session.clientKycId!;
      const allDocs = await storage.getDocuments();
      const clientDocs = allDocs.filter((d) => d.sentToClientId === kycId && d.status === "sent");
      res.json(clientDocs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/client/documents/:id/respond", requireClientAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      const kycId = req.session.clientKycId!;
      if (doc.sentToClientId !== kycId) {
        return res.status(403).json({ message: "This document was not sent to you" });
      }
      if (doc.status !== "sent" || doc.recipientResponse !== "pending") {
        return res.status(400).json({ message: "Document is not awaiting your response" });
      }

      const { response, amendmentNotes } = req.body;
      if (!["accepted", "rejected"].includes(response)) {
        return res.status(400).json({ message: "Response must be 'accepted' or 'rejected'" });
      }

      const updateData: Record<string, any> = {
        recipientResponse: response,
        recipientRespondedAt: new Date(),
        status: response === "accepted" ? "accepted" : "rejected",
      };
      if (response === "rejected" && amendmentNotes) {
        updateData.recipientAmendmentNotes = amendmentNotes;
      }
      const updated = await storage.updateDocument(doc.id, updateData);

      if (response === "rejected" && amendmentNotes) {
        const clientCompanyName = req.session.clientCompanyName || "Client";
        const notifyEmails = [doc.buyerEmail, doc.sellerEmail, "trade@bullex.tech"].filter(Boolean) as string[];
        const uniqueEmails = [...new Set(notifyEmails)];
        for (const email of uniqueEmails) {
          sendAmendmentRequestedEmail(email, "Trade Desk", doc.docType, doc.title, amendmentNotes, clientCompanyName)
            .catch(err => console.error("[docs] Failed to send amendment email to", email, err));
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to respond to document" });
    }
  });

  app.get("/api/client/documents/:id/download", requireClientAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      const kycId = req.session.clientKycId!;
      if (doc.sentToClientId !== kycId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const filePath = doc.pdfPath || doc.docxPath;
      if (!filePath) return res.status(404).json({ message: "No file available" });

      const fs = await import("fs");
      const path = await import("path");
      const fullPath = path.default.resolve(filePath);
      if (!fs.default.existsSync(fullPath)) return res.status(404).json({ message: "File not found" });

      res.download(fullPath);
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
        // Admin audit copy
        const adminEmailApprove = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
        if (adminEmailApprove) {
          sendKycActionAdminCopyEmail(
            adminEmailApprove,
            "approved",
            updated.companyName,
            updated.contactName || updated.signatoryName || "Unknown",
            updated.contactEmail || updated.signatoryEmail || "",
            reviewNotes
          ).catch((err) => console.error("[email] admin approve copy failed:", err));
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
        // Admin audit copy
        const adminEmailReject = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
        if (adminEmailReject) {
          sendKycActionAdminCopyEmail(
            adminEmailReject,
            "rejected",
            updated.companyName,
            updated.contactName || updated.signatoryName || "Unknown",
            updated.contactEmail || updated.signatoryEmail || "",
            reviewNotes
          ).catch((err) => console.error("[email] admin reject copy failed:", err));
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

  app.post("/api/kyc/send-onboarding-link", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email address is required." });
      }
      const kycUrl = `${req.protocol}://${req.get("host")}/kyc`;
      const sent = await sendKycOnboardingInviteEmail(email, kycUrl);
      if (!sent) {
        return res.status(500).json({ message: "Failed to send invitation email." });
      }
      res.json({ success: true, message: `Invitation sent to ${email}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error." });
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
      const submittedAt = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

      // Email to client (signatory)
      if (signatoryEmail) {
        sendKycConfirmationEmail(
          signatoryEmail,
          parsed.data.companyName,
          parsed.data.signatoryName || parsed.data.contactName
        ).catch((err) => console.error("[email] background send failed:", err));
      }
      // Email to form filler (if different from signatory)
      if (parsed.data.filledByEmail && parsed.data.filledByEmail !== signatoryEmail) {
        sendKycConfirmationEmail(
          parsed.data.filledByEmail,
          parsed.data.companyName,
          parsed.data.filledByName || "Applicant"
        ).catch((err) => console.error("[email] background send to filledBy failed:", err));
      }
      // Email to admin
      const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
      if (adminEmail) {
        const contactEmail = parsed.data.contactEmail || parsed.data.signatoryEmail || parsed.data.filledByEmail || "";
        const contactName = parsed.data.contactName || parsed.data.signatoryName || parsed.data.filledByName || "Unknown";
        sendKycSubmittedAdminEmail(
          adminEmail,
          parsed.data.companyName,
          contactName,
          contactEmail,
          parsed.data.businessType,
          parsed.data.countryOfOperation,
          submittedAt
        ).catch((err) => console.error("[email] admin KYC notification failed:", err));
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

  app.get("/api/documents/next-loi-number", requireAuth, async (req: Request, res: Response) => {
    try {
      const buyerName = (req.query.buyerName as string || "").trim();
      const prefix = buyerName.substring(0, 3).toUpperCase() || "XXX";
      const now = new Date();
      const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const allDocs = await storage.getDocuments();
      const loiDocs = allDocs.filter(d => d.docType === "LOI" && d.issueNumber);
      const serial = 181 + loiDocs.length;
      const issueNumber = `IMP-${prefix}-${ddmm}-${serial}`;
      res.json({ issueNumber });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to generate LOI number" });
    }
  });

  app.get("/api/documents", requireAuth, async (_req, res) => {
    try {
      const result = await storage.getDocuments();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents/preview", requireAuth, async (req, res) => {
    try {
      const { buyerDetails, sellerDetails, productDetails, docType, tradeRef } = req.body;
      if (!docType) return res.status(400).json({ message: "docType is required" });
      let trade: Trade | undefined;
      if (tradeRef) {
        const trades = await storage.getTrades();
        trade = trades.find(t => t.tradeRef === tradeRef);
      }
      const content = generateDocumentContent(docType, trade, buyerDetails, sellerDetails, productDetails);
      res.json({ content });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to preview document" });
    }
  });

  app.post("/api/documents", requireAuth, async (req, res) => {
    try {
      const { buyerDetails, sellerDetails, productDetails, ...docData } = req.body;
      const parsed = insertDocumentSchema.safeParse(docData);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      let trade: Trade | undefined;
      if (parsed.data.tradeRef) {
        const trades = await storage.getTrades();
        trade = trades.find(t => t.tradeRef === parsed.data.tradeRef);
      }
      let issueNumber: string | null = null;
      if (parsed.data.docType === "LOI") {
        const buyName = (buyerDetails?.name || "").trim();
        const prefix = buyName.substring(0, 3).toUpperCase() || "XXX";
        const now = new Date();
        const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
        const allDocs = await storage.getDocuments();
        const loiDocs = allDocs.filter(d => d.docType === "LOI" && d.issueNumber);
        const serial = 181 + loiDocs.length;
        issueNumber = `IMP-${prefix}-${ddmm}-${serial}`;
      }

      let dealRecapNumber: string | null = null;
      if (parsed.data.docType === "DEAL_RECAP" || parsed.data.docType === "SPA") {
        const buyName3 = (buyerDetails?.name || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
        const sellName3 = (sellerDetails?.name || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
        const now = new Date();
        const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
        const allDocs = await storage.getDocuments();
        const prefix = `${buyName3}/${sellName3}-${ddmm}`;
        const samePrefix = allDocs.filter(d => d.dealRecapNumber && d.dealRecapNumber.startsWith(prefix));
        const serial = String(samePrefix.length + 1).padStart(3, "0");
        dealRecapNumber = `${prefix}-${serial}`;
      }

      const enquiryRef = req.body.enquiryRef || null;

      const content = generateDocumentContent(parsed.data.docType, trade, buyerDetails, sellerDetails, { ...productDetails, loiIssueNumber: issueNumber });
      const adminChecks = buildAdminChecks(parsed.data.docType);
      const result = await storage.createDocument({
        ...parsed.data,
        content,
        status: "pending_review",
        adminChecks,
        issueNumber,
        dealRecapNumber,
        enquiryRef,
        buyerEmail: buyerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null,
        sellerEmail: sellerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null,
      });

      try {
        const isLoi = parsed.data.docType === "LOI";
        const docxPath = await generateDocx(result.id, result.title, content);
        let pdfPath: string | undefined;
        if (!isLoi) {
          pdfPath = await generatePdf(result.id, result.title, content);
        }
        const updated = await storage.updateDocument(result.id, { docxPath, ...(pdfPath ? { pdfPath } : {}) });

        const buyerEmail = buyerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        const sellerEmail = sellerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        const buyerName = buyerDetails?.name || "Buyer";
        const sellerName = sellerDetails?.name || "Seller";

        if (pdfPath) {
          if (buyerEmail) {
            sendDocumentEmail(buyerEmail, buyerName, parsed.data.docType, result.title, "Buyer", pdfPath)
              .catch(err => console.error("[docs] Failed to email buyer:", err));
          }
          if (sellerEmail) {
            sendDocumentEmail(sellerEmail, sellerName, parsed.data.docType, result.title, "Seller", pdfPath)
              .catch(err => console.error("[docs] Failed to email seller:", err));
          }
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

  app.get("/api/documents/:id", requireAuth, async (req, res) => {
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
      if (["sent", "accepted"].includes(doc.status)) {
        return res.status(400).json({ message: `Cannot edit document in '${doc.status}' state` });
      }
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
      if (!doc.content) return res.status(404).json({ message: "Document content not available" });
      if (doc.buyerSignature) {
        const result = await regenerateWithSignatures(
          doc.id, doc.title, doc.content,
          doc.buyerSignature || undefined, undefined,
          doc.buyerSignedName || undefined, undefined,
          doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined, undefined,
        );
        const filePath = getDocFilePath(result.docxPath);
        res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.docx"`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        return res.sendFile(filePath);
      }
      const docxPath = await generateDocx(doc.id, doc.title, doc.content);
      await storage.updateDocument(doc.id, { docxPath });
      const filePath = getDocFilePath(docxPath);
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
      if (!doc.content) return res.status(404).json({ message: "Document content not available" });
      if (doc.buyerSignature) {
        const result = await regenerateWithSignatures(
          doc.id, doc.title, doc.content,
          doc.buyerSignature || undefined, undefined,
          doc.buyerSignedName || undefined, undefined,
          doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined, undefined,
        );
        const filePath = getDocFilePath(result.pdfPath);
        res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.pdf"`);
        res.setHeader("Content-Type", "application/pdf");
        return res.sendFile(filePath);
      }
      const pdfPath = await generatePdf(doc.id, doc.title, doc.content);
      await storage.updateDocument(doc.id, { pdfPath });
      const filePath = getDocFilePath(pdfPath);
      res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.pdf"`);
      res.setHeader("Content-Type", "application/pdf");
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download PDF" });
    }
  });

  app.post("/api/documents/:id/convert-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!doc.content) return res.status(400).json({ message: "Document has no content" });
      if (!doc.buyerSignature) return res.status(400).json({ message: "Document must be signed before converting to PDF" });

      const result = await regenerateWithSignatures(
        doc.id, doc.title, doc.content,
        doc.buyerSignature || undefined, undefined,
        doc.buyerSignedName || undefined, undefined,
        doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined, undefined,
      );

      const updated = await storage.updateDocument(doc.id, { pdfPath: result.pdfPath, status: "final" });

      const buyerEmail = doc.buyerEmail;
      const sellerEmail = doc.sellerEmail;
      if (buyerEmail) {
        sendDocumentEmail(buyerEmail, doc.buyerSignedName || "Buyer", doc.docType, doc.title, "Buyer", result.pdfPath)
          .catch(err => console.error("[docs] Failed to email buyer:", err));
      }
      if (sellerEmail) {
        sendDocumentEmail(sellerEmail, "Seller", doc.docType, doc.title, "Seller", result.pdfPath)
          .catch(err => console.error("[docs] Failed to email seller:", err));
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to convert to PDF" });
    }
  });

  app.patch("/api/documents/:id/admin-review", requireAuth, async (req: Request, res: Response) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const { adminChecks, adminReviewNotes, action } = req.body;
      const updateData: Record<string, any> = {};
      if (Array.isArray(adminChecks)) updateData.adminChecks = adminChecks;
      if (typeof adminReviewNotes === "string") updateData.adminReviewNotes = adminReviewNotes;
      if (action === "approve") {
        updateData.status = "draft";
      } else if (action === "reject") {
        updateData.status = "rejected";
      }
      const updated = await storage.updateDocument(req.params.id, updateData);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update admin review" });
    }
  });

  app.post("/api/documents/:id/sign", requireAuth, async (req: Request, res: Response) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.status === "pending_review") {
        return res.status(400).json({ message: "Document must be approved by admin before signing." });
      }
      const { party, signature, name } = req.body;
      if (!party || !["buyer", "seller"].includes(party)) {
        return res.status(400).json({ message: "Party must be 'buyer' or 'seller'" });
      }
      if (!signature || !signature.startsWith("data:image/")) {
        return res.status(400).json({ message: "Invalid signature data" });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Signer name is required" });
      }
      const now = new Date();
      const updateData: Record<string, any> = {};
      if (party === "buyer") {
        updateData.buyerSignature = signature;
        updateData.buyerSignedAt = now;
        updateData.buyerSignedName = name.trim();
      } else {
        updateData.sellerSignature = signature;
        updateData.sellerSignedAt = now;
        updateData.sellerSignedName = name.trim();
      }
      const updated = await storage.updateDocument(req.params.id, updateData);

      if (updated.content) {
        try {
          const { regenerateWithSignatures } = await import("./documentFileGenerator");
          await regenerateWithSignatures(
            updated.id,
            updated.title,
            updated.content,
            updated.buyerSignature || undefined,
            updated.sellerSignature || undefined,
            updated.buyerSignedName || undefined,
            updated.sellerSignedName || undefined,
            updated.buyerSignedAt ? new Date(updated.buyerSignedAt) : undefined,
            updated.sellerSignedAt ? new Date(updated.sellerSignedAt) : undefined,
          );
        } catch (regenErr: any) {
          console.error("Failed to regenerate files with signature:", regenErr.message);
        }
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to sign document" });
    }
  });

  app.delete("/api/documents/:id/sign/:party", requireAuth, async (req: Request, res: Response) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const { party } = req.params;
      if (!["buyer", "seller"].includes(party)) {
        return res.status(400).json({ message: "Party must be 'buyer' or 'seller'" });
      }
      const updateData: Record<string, any> = {};
      if (party === "buyer") {
        updateData.buyerSignature = null;
        updateData.buyerSignedAt = null;
        updateData.buyerSignedName = null;
      } else {
        updateData.sellerSignature = null;
        updateData.sellerSignedAt = null;
        updateData.sellerSignedName = null;
      }
      const updated = await storage.updateDocument(req.params.id, updateData);

      if (updated.content) {
        try {
          const { regenerateWithSignatures } = await import("./documentFileGenerator");
          await regenerateWithSignatures(
            updated.id,
            updated.title,
            updated.content,
            updated.buyerSignature || undefined,
            updated.sellerSignature || undefined,
            updated.buyerSignedName || undefined,
            updated.sellerSignedName || undefined,
            updated.buyerSignedAt ? new Date(updated.buyerSignedAt) : undefined,
            updated.sellerSignedAt ? new Date(updated.sellerSignedAt) : undefined,
          );
        } catch (regenErr: any) {
          console.error("Failed to regenerate files after removing signature:", regenErr.message);
        }
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to remove signature" });
    }
  });

  app.post("/api/documents/:id/send", requireAuth, async (req: Request, res: Response) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      if (!["draft", "final", "rejected"].includes(doc.status)) {
        return res.status(400).json({ message: `Cannot send document in '${doc.status}' state. Must be draft, final, or rejected.` });
      }

      if (!doc.buyerSignature) {
        return res.status(400).json({ message: "Document must be signed before sending" });
      }

      const { recipientEmail, clientId } = req.body;
      if (!recipientEmail) {
        return res.status(400).json({ message: "Recipient email is required" });
      }

      const updated = await storage.updateDocument(doc.id, {
        sentTo: recipientEmail,
        sentToClientId: clientId || null,
        recipientResponse: "pending",
        recipientAmendmentNotes: null,
        status: "sent",
      });

      if (recipientEmail) {
        const pdfOrDocx = doc.pdfPath || doc.docxPath;
        if (pdfOrDocx) {
          sendDocumentEmail(recipientEmail, "Recipient", doc.docType, doc.title, "Bullex Trading", pdfOrDocx)
            .catch(err => console.error("[docs] Failed to email recipient:", err));
        }
        sendSignaturePendingEmail(recipientEmail, "Recipient", doc.docType, doc.title)
          .catch(err => console.error("[docs] Failed to send signature pending email:", err));
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to send document" });
    }
  });

  app.post("/api/documents/:id/respond", requireAuth, async (req: Request, res: Response) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      if (doc.status !== "sent" || doc.recipientResponse !== "pending") {
        return res.status(400).json({ message: "Document must be in 'sent' state with 'pending' response to accept/reject" });
      }

      const { response, amendmentNotes } = req.body;
      if (!["accepted", "rejected"].includes(response)) {
        return res.status(400).json({ message: "Response must be 'accepted' or 'rejected'" });
      }

      const updateData: Record<string, any> = {
        recipientResponse: response,
        recipientRespondedAt: new Date(),
        status: response === "accepted" ? "accepted" : "rejected",
      };
      if (response === "rejected" && amendmentNotes) {
        updateData.recipientAmendmentNotes = amendmentNotes;
      }
      const updated = await storage.updateDocument(doc.id, updateData);

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to respond to document" });
    }
  });

  app.post("/api/documents/:id/create-next", requireAuth, async (req: Request, res: Response) => {
    try {
      const parentDoc = await storage.getDocumentById(req.params.id);
      if (!parentDoc) return res.status(404).json({ message: "Parent document not found" });
      if (parentDoc.recipientResponse !== "accepted") {
        return res.status(400).json({ message: "Parent document must be accepted first" });
      }

      const allowedTransitions: Record<string, string> = {
        LOI: "SCO",
        SCO: "DEAL_RECAP",
        FCO: "DEAL_RECAP",
        DEAL_RECAP: "SPA",
      };
      const expectedNext = allowedTransitions[parentDoc.docType];
      const { nextDocType } = req.body;
      if (!expectedNext || nextDocType !== expectedNext) {
        return res.status(400).json({ message: `Invalid transition: ${parentDoc.docType} can only create ${expectedNext || "nothing"}` });
      }

      const parsedContent: Record<string, string> = {};
      try {
        const lines = (parentDoc.content || "").split("\n");
        for (const line of lines) {
          const m1 = line.match(/^(?:Company|Attention|Address):\s*(.+)$/);
          const m2 = line.match(/^[\s│]*([^│:]+?)\s*│\s*(.+)$/);
          const m3 = line.match(/^([^:]+):\s*(.+)$/);
          if (m2) parsedContent[m2[1].trim()] = m2[2].trim();
          else if (m3) parsedContent[m3[1].trim()] = m3[2].trim();
        }
      } catch {}

      const buyerName = parsedContent["Buyer"] || parsedContent["Buyer Name"] || parsedContent["Issued by Buyer"] || "";
      const sellerName = parsedContent["Seller"] || parsedContent["Seller Name"] || parsedContent["FROM (SELLER)"] || "";
      const commodity = parsedContent["Commodity"] || "";
      const origin = parsedContent["Origin"] || parsedContent["Country of Origin"] || "";
      const quantity = parsedContent["Quantity"] || parsedContent["Contractual Qty"] || "";
      const incoterm = parsedContent["Incoterms"] || parsedContent["Incoterms Terms"] || parsedContent["Purchase Incoterms"] || "";
      const price = parsedContent["Price"] || parsedContent["Price & Currency"] || "";
      const paymentTerms = parsedContent["Payment Terms"] || "";
      const qualitySpecs = parsedContent["Quality Specifications"] || parsedContent["Quality / Spec"] || parsedContent["Commodity Specifications"] || "";

      let dealRecapNumber: string | null = null;
      let enquiryRef = parentDoc.enquiryRef || null;

      if (nextDocType === "DEAL_RECAP" || nextDocType === "SPA") {
        const buyerName3 = (buyerName || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
        const sellerName3 = (sellerName || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
        const now = new Date();
        const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;

        if (nextDocType === "SPA" && parentDoc.dealRecapNumber) {
          dealRecapNumber = parentDoc.dealRecapNumber;
        } else {
          const allDocs = await storage.getDocuments();
          const prefix = `${buyerName3}/${sellerName3}-${ddmm}`;
          const samePrefix = allDocs.filter(d => d.dealRecapNumber && d.dealRecapNumber.startsWith(prefix));
          const serial = String(samePrefix.length + 1).padStart(3, "0");
          dealRecapNumber = `${prefix}-${serial}`;
        }
      }

      const buyerDetails = { name: buyerName, address: "", contact: parentDoc.buyerEmail || "", bank: "", swift: "" };
      const sellerDetails = { name: sellerName, address: "", contact: parentDoc.sellerEmail || "", bank: "", swift: "" };
      const productDetails = { commodity, origin, quantity, incoterm, price, paymentTerms, qualitySpecs, currency: "USD" };

      let trade: Trade | undefined;
      if (parentDoc.tradeRef) {
        const trades = await storage.getTrades();
        trade = trades.find(t => t.tradeRef === parentDoc.tradeRef);
      }

      const content = generateDocumentContent(nextDocType, trade, buyerDetails, sellerDetails, productDetails);

      const title = `${nextDocType} - ${dealRecapNumber || parentDoc.title}`;
      const result = await storage.createDocument({
        docType: nextDocType,
        title,
        tradeRef: parentDoc.tradeRef,
        enquiryRef,
        dealRecapNumber,
        parentDocId: parentDoc.id,
        status: "pending_review",
        adminChecks: buildAdminChecks(nextDocType),
        content: content || `Document created from ${parentDoc.docType}: ${parentDoc.title}`,
        buyerEmail: parentDoc.buyerEmail,
        sellerEmail: parentDoc.sellerEmail,
      });

      try {
        const docxPath = await generateDocx(result.id, result.title, result.content || "");
        let pdfPath: string | undefined;
        if (nextDocType !== "LOI") {
          pdfPath = await generatePdf(result.id, result.title, result.content || "");
        }
        const updated = await storage.updateDocument(result.id, { docxPath, ...(pdfPath ? { pdfPath } : {}) });
        res.json(updated);
      } catch (fileErr) {
        console.error("[docs] File generation error (document still created):", fileErr);
        res.json(result);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create next document" });
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

  // ─── TRADE ENQUIRIES ───
  app.get("/api/trade-enquiries", requireAuth, async (_req: Request, res: Response) => {
    try {
      const enquiries = await storage.getTradeEnquiries();
      res.json(enquiries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-enquiries/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      res.json(enquiry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-enquiries", requireAuth, async (req: Request, res: Response) => {
    try {
      const b = req.body;
      if (!b || typeof b.product !== "string" || !b.product.trim()) {
        return res.status(400).json({ message: "Product is required and must be a string" });
      }
      const str = (v: any) => (typeof v === "string" && v.trim()) ? v.trim() : null;
      const side = b.side === "sell" ? "sell" : "buy";
      const enquiry = await storage.createTradeEnquiry({
        product: b.product.trim(),
        side,
        specifications: str(b.specifications),
        producer: str(b.producer),
        quantity: str(b.quantity),
        unit: str(b.unit) || "MT",
        loadingPort: str(b.loadingPort),
        incoterms: str(b.incoterms),
        validity: str(b.validity),
        additionalInfo: str(b.additionalInfo),
        createdBy: str(b.createdBy),
        email: str(b.email),
      });
      sendEnquiryCreatedNotification(enquiry).catch(() => {});
      res.json(enquiry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trade-enquiries/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const valid = ["active", "closed", "accepted", "rejected"];
      if (!valid.includes(status)) return res.status(400).json({ message: "Invalid status" });
      const existing = await storage.getTradeEnquiryById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Enquiry not found" });
      const updated = await storage.updateTradeEnquiryStatus(req.params.id, status);

      if (status === "accepted" && existing.status !== "accepted") {
        try {
          const categoryMap: Record<string, string> = {
            "Iron Ore": "minerals", "Bauxite": "minerals", "Manganese Ore": "minerals",
            "Copper Cathode": "metals", "Copper Concentrate": "metals", "Aluminium Ingots": "metals",
            "Gasoil 10ppm": "energy", "Gasoil 50ppm": "energy", "LHC": "energy", "HSFO": "energy", "HSGO": "energy",
            "Petcoke – Anode Grade": "petrochemicals", "Petcoke – Fuel Grade": "petrochemicals",
            "NPK": "fertilizers", "Sulphur – Granular": "fertilizers", "Sulphur – Lumps": "fertilizers",
          };
          const commodityCategory = categoryMap[existing.product] || "minerals";

          const isBuyer = existing.side === "buy";
          const buyerName = isBuyer ? (existing.createdBy || "TBD") : "TBD";
          const sellerName = !isBuyer ? (existing.createdBy || "TBD") : "TBD";

          const trade = await storage.createPreDealTrade({
            commodity: existing.product,
            commodityCategory,
            quantity: parseFloat(existing.quantity || "0") || 0,
            unit: existing.unit || "MT",
            pricePerUnit: 0,
            totalValue: 0,
            currency: "USD",
            buyerName,
            sellerName,
            origin: existing.loadingPort || "TBD",
            destination: "TBD",
            incoterm: existing.incoterms || "FOB",
          });

          const latestBlock = await storage.getLatestBlock();
          const previousHash = latestBlock ? latestBlock.hash : GENESIS_HASH;
          const blockNumber = latestBlock ? latestBlock.blockNumber + 1 : 1;
          const timestamp = new Date().toISOString();

          const enquiryHash = generateEnquiryTradeHash(
            existing.enquiryRef,
            existing.product,
            existing.side,
            existing.quantity,
            existing.createdBy || "Admin",
            timestamp
          );

          const tradeData = `${existing.enquiryRef}:${existing.product}:TRADE_INITIATED:${trade.tradeRef}:${enquiryHash}`;
          const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestamp, tradeData, 2);

          await storage.createBlock({
            blockNumber,
            hash: blockHash,
            previousHash,
            nonce,
            tradeCount: 1,
            verified: true,
            dataType: "trade",
            dataId: trade.id,
            dataSummary: `Trade ${trade.tradeRef} initiated from ${existing.enquiryRef} | ${existing.side.toUpperCase()} ${existing.product}`,
          });

          console.log(`[trade] Auto-created trade ${trade.tradeRef} from enquiry ${existing.enquiryRef}, blockchain block #${blockNumber}`);
        } catch (err: any) {
          console.error("[trade] Auto-create trade failed:", err.message);
        }
      }

      sendEnquiryStatusNotification(existing, status).catch(() => {});
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/trade-enquiries/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const existing = await storage.getTradeEnquiryById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Enquiry not found" });
      const docs = await storage.getTradeEnquiryDocuments(req.params.id);
      for (const doc of docs) {
        const filePath = path.join(enquiryUploadsDir, doc.storedName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await storage.deleteTradeEnquiry(req.params.id);
      res.json({ message: "Enquiry deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── TRADE ENQUIRY DOCUMENTS ───
  app.get("/api/trade-enquiries/:id/documents", requireAuth, async (req: Request, res: Response) => {
    try {
      const docs = await storage.getTradeEnquiryDocuments(req.params.id);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-enquiries/:id/documents", requireAuth, enquiryUpload.single("file"), async (req: Request, res: Response) => {
    const file = req.file;
    try {
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) {
        fs.unlinkSync(path.join(enquiryUploadsDir, file.filename));
        return res.status(404).json({ message: "Enquiry not found" });
      }
      const doc = await storage.createTradeEnquiryDocument({
        enquiryId: req.params.id,
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
      });
      res.json(doc);
    } catch (error: any) {
      if (file) {
        const fp = path.join(enquiryUploadsDir, file.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-enquiry-documents/:docId/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const doc = await storage.getTradeEnquiryDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const filePath = path.join(enquiryUploadsDir, doc.storedName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      res.setHeader("Content-Disposition", `attachment; filename="${doc.originalName}"`);
      res.setHeader("Content-Type", doc.mimeType);
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/trade-enquiry-documents/:docId", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteTradeEnquiryDocument(req.params.docId);
      if (!deleted) return res.status(404).json({ message: "Document not found" });
      const filePath = path.join(enquiryUploadsDir, deleted.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const DEFAULT_ROLE_TYPES = [
    "Trader", "Buyer", "Seller", "Broker", "Shipping Company",
    "Quality Assessment Agency", "Logistics Provider", "Financial Institution",
    "Inspection Company", "Insurance Provider", "Legal / Compliance",
  ];

  app.get("/api/role-types", async (_req: Request, res: Response) => {
    try {
      const regs = await storage.getRegistrations();
      const custom = new Set<string>();
      for (const reg of regs) {
        if (reg.roleType.startsWith("Other – ")) {
          const extracted = reg.roleType.replace(/^Other – /, "").trim();
          if (extracted && !DEFAULT_ROLE_TYPES.includes(extracted)) {
            custom.add(extracted);
          }
        }
      }
      const result = [...DEFAULT_ROLE_TYPES, ...Array.from(custom).sort(), "Other"];
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const { insertRegistrationSchema } = await import("@shared/schema");
      const parsed = insertRegistrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid registration data", errors: parsed.error.flatten() });
      }
      const reg = await storage.createRegistration(parsed.data);
      const submittedAt = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
      sendRegistrationConfirmationEmail(reg.email, reg.fullName, reg.roleType, reg.companyName).catch(() => {});
      sendRegistrationAdminEmail(
        "trade@bullex.tech", reg.fullName, reg.companyName, reg.email,
        reg.phone, reg.country, reg.roleType, reg.commodities, reg.message, submittedAt
      ).catch(() => {});
      if (process.env.ADMIN_EMAIL) {
        sendRegistrationAdminEmail(
          process.env.ADMIN_EMAIL, reg.fullName, reg.companyName, reg.email,
          reg.phone, reg.country, reg.roleType, reg.commodities, reg.message, submittedAt
        ).catch(() => {});
      }
      res.status(201).json(reg);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/registrations", requireAuth, async (_req: Request, res: Response) => {
    try {
      const regs = await storage.getRegistrations();
      res.json(regs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/registrations/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status, reviewNotes } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });
      const updated = await storage.updateRegistrationStatus(req.params.id, status, reviewNotes);
      if (status === "approved") {
        sendRegistrationApprovalEmail(updated.email, updated.fullName, updated.companyName, updated.roleType).catch(() => {});
      } else if (status === "rejected") {
        sendRegistrationRejectionEmail(updated.email, updated.fullName, updated.companyName, updated.roleType, reviewNotes).catch(() => {});
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/hr/apply", hrUpload.single("document"), async (req: Request, res: Response) => {
    try {
      const { fullName, email, phone, address, roleTitle, aboutYourself } = req.body;
      if (!fullName?.trim() || !email?.trim() || !roleTitle?.trim()) {
        return res.status(400).json({ message: "Full name, email and role are required." });
      }

      let attachmentBase64: string | undefined;
      let attachmentFilename: string | undefined;
      if (req.file) {
        attachmentBase64 = fs.readFileSync(req.file.path).toString("base64");
        attachmentFilename = req.file.originalname;
        fs.unlinkSync(req.file.path);
      }

      const [hrSent, ackSent] = await Promise.allSettled([
        sendJobApplicationToHR(fullName, email, phone || "", address || "", roleTitle, aboutYourself || "", attachmentBase64, attachmentFilename),
        sendJobApplicationAcknowledgement(email, fullName, roleTitle),
      ]);

      res.json({
        success: true,
        hrEmailSent: hrSent.status === "fulfilled" && hrSent.value,
        ackEmailSent: ackSent.status === "fulfilled" && ackSent.value,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to submit application." });
    }
  });

  return httpServer;
}
