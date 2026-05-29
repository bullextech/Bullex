import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { getTableColumns } from "drizzle-orm";
import { insertTradeSchema, insertKycSchema, insertDocumentSchema, insertPotentialClientSchema, kycApplications, type Trade } from "@shared/schema";
import { generateTradeHash, generateKycHash, generateKycAmendmentHash, generateEnquiryTradeHash, mineBlock, GENESIS_HASH } from "./blockchain";
import { generateDocumentContent, type PartyDetails } from "./documentTemplates";
import { seedDatabase } from "./seed";
import { sendKycConfirmationEmail, sendKycApprovalEmail, sendKycRejectionEmail, sendChangeRequestApprovedEmail, sendChangeRequestRejectedEmail, sendDocumentEmail, sendSignaturePendingEmail, sendAmendmentRequestedEmail, sendKycSubmittedAdminEmail, sendKycActionAdminCopyEmail, sendKycOnboardingInviteEmail, sendRegistrationConfirmationEmail, sendRegistrationAdminEmail, sendRegistrationApprovalEmail, sendRegistrationRejectionEmail, sendEnquiryCreatedNotification, sendEnquiryClientResponseNotification, sendEnquiryStatusNotification, sendJobApplicationToHR, sendJobApplicationAcknowledgement, sendTeamKycAdminNotification, sendTeamKycConfirmation, sendTeamMemberWelcomeEmail, sendTeamMemberPasswordChangedEmail, sendTeamMemberPasswordResetLinkEmail } from "./email";
import { generateDocx, generatePdf, getDocFilePath, regenerateWithSignatures, generateKycApplicationPdf, generateBlankKycApplicationPdf } from "./documentFileGenerator";
import { attachChat, getSessionIdentity, dmRoomId, canAccessRoom } from "./chat";

async function notify(args: { type: string; title: string; message: string; link?: string | null; severity?: "info" | "success" | "warning" | "alert"; module?: string | null }) {
  try {
    await storage.createNotification({
      type: args.type,
      title: args.title,
      message: args.message,
      link: args.link ?? null,
      severity: args.severity ?? "info",
      module: args.module ?? null,
    });
  } catch (err: any) {
    console.error("[notifications] create failed:", err.message);
  }
}

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
  NCNDA: [
    "Party A details verified against KYC / company records",
    "Party B details verified against approved KYC application",
    "Effective date and term correctly stated",
    "Proposed Transaction description complete",
    "Governing law and jurisdiction confirmed",
    "Non-circumvention clause reviewed",
    "Both party signatories authorised",
    "Sanctions and anti-bribery clauses reviewed",
  ],
  ICA: [
    "Principal details verified against company records",
    "Agent / Broker details verified against approved KYC application",
    "Agent participant ID (agent code) present on the document",
    "Agency type (Exclusive / Non-Exclusive) selected",
    "Commission structure, basis and currency complete",
    "Transaction details (commodity, qty, value, incoterm) consistent",
    "Governing law, seat of arbitration and ICC clause set",
    "AML / sanctions / anti-bribery articles reviewed",
    "Annexure A (IMFPA) and Annexure B (NCNDA) attached",
    "Signatory blocks for Principal and Agent complete",
  ],
};
async function resolveAgentCode(opts: {
  buyerEmail?: string | null;
  sellerEmail?: string | null;
  sentToClientId?: string | null;
  submittedByTeamMemberId?: string | null;
}): Promise<string | null> {
  try {
    // 1) Prefer the explicit client recipient if linked.
    if (opts.sentToClientId) {
      const k = await storage.getKycApplicationById(opts.sentToClientId);
      if (k?.participantId) return k.participantId;
    }
    // 2) Match an approved KYC by buyer/seller email.
    const emails = [opts.buyerEmail, opts.sellerEmail].filter(Boolean) as string[];
    if (emails.length) {
      const all = await storage.getKycApplications();
      for (const e of emails) {
        const hit = all.find(a =>
          a.status === "approved" &&
          a.participantId &&
          [a.signatoryEmail, a.contactEmail, a.filledByEmail].filter(Boolean).some(x => (x as string).toLowerCase() === e.toLowerCase())
        );
        if (hit?.participantId) return hit.participantId;
      }
    }
    // 3) Fall back to the submitting team member's participant ID.
    if (opts.submittedByTeamMemberId) {
      const tm = await storage.getTeamMemberById(opts.submittedByTeamMemberId);
      if (tm?.participantId) return tm.participantId;
    }
  } catch (err) {
    console.error("[agent-code] resolution failed:", err);
  }
  return null;
}

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
    role: "admin" | "client" | "team";
    clientKycId: string;
    clientCompanyName: string;
    allowedModules: string[];
    amendUnlockUntil?: number;
  }
}

const AMEND_UNLOCK_DURATION_MS = 15 * 60 * 1000;

const kycUploadsDir = path.join(process.cwd(), "uploads", "kyc");
const tradeUploadsDir = path.join(process.cwd(), "uploads", "trades");
const enquiryUploadsDir = path.join(process.cwd(), "uploads", "enquiries");
const hrUploadsDir = path.join(process.cwd(), "uploads", "hr");
if (!fs.existsSync(kycUploadsDir)) fs.mkdirSync(kycUploadsDir, { recursive: true });
if (!fs.existsSync(tradeUploadsDir)) fs.mkdirSync(tradeUploadsDir, { recursive: true });
if (!fs.existsSync(enquiryUploadsDir)) fs.mkdirSync(enquiryUploadsDir, { recursive: true });
if (!fs.existsSync(hrUploadsDir)) fs.mkdirSync(hrUploadsDir, { recursive: true });

const allowedExts = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".doc", ".docx", ".xls", ".xlsx"];
const photoExts = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

function createUploader(destDir: string, prefix: string, photoOnly = false) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, destDir),
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname).toLowerCase() || ".bin";
        cb(null, `${prefix}-${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowed = photoOnly ? photoExts : allowedExts;
      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(
          photoOnly
            ? "Photo must be JPG, PNG, or WEBP"
            : "File type not allowed. Accepted: PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX"
        ));
      }
    },
  });
}

function handleMulterError(err: any, res: any) {
  if (err && (err.code === "LIMIT_FILE_SIZE" || err instanceof multer.MulterError)) {
    return res.status(400).json({ message: err.message || "File too large (max 10MB)" });
  }
  if (err) {
    return res.status(400).json({ message: err.message || "File upload error" });
  }
  return false;
}

const teamUploadsDir = path.join(process.cwd(), "uploads", "team");
if (!fs.existsSync(teamUploadsDir)) fs.mkdirSync(teamUploadsDir, { recursive: true });

const kycUpload = createUploader(kycUploadsDir, "kyc");
const tradeUpload = createUploader(tradeUploadsDir, "trade");
const enquiryUpload = createUploader(enquiryUploadsDir, "enquiry");
const hrUpload = createUploader(hrUploadsDir, "hr");
const teamUpload = createUploader(teamUploadsDir, "team");
const teamPhotoUpload = createUploader(teamUploadsDir, "team-photo", true);

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

function requireAmendUnlock(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.authenticated || req.session.role !== "admin") {
    return res.status(401).json({ message: "Admin authentication required" });
  }
  const until = req.session.amendUnlockUntil;
  if (!until || until < Date.now()) {
    return res.status(403).json({
      message: "Amend mode is locked. Re-enter admin password to enable amendments.",
      code: "AMEND_LOCKED",
    });
  }
  return next();
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

  const sessionMiddleware = session({
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
  });
  app.use(sessionMiddleware);

  // Attach WebSocket chat (Bullex Chat: text + WebRTC signaling)
  attachChat(httpServer, sessionMiddleware);

  // ---- Bullex Chat REST endpoints ----
  app.get("/api/chat/me", (req, res) => {
    const identity = getSessionIdentity(req.session);
    if (!identity) return res.status(401).json({ message: "Unauthorized" });
    res.json(identity);
  });

  app.get("/api/chat/users", async (req, res) => {
    const me = getSessionIdentity(req.session);
    if (!me) return res.status(401).json({ message: "Unauthorized" });
    const out: { id: string; name: string; role: string; subtitle?: string }[] = [];
    const adminUser = process.env.ADMIN_USERNAME;
    if (adminUser) out.push({ id: `admin:${adminUser}`, name: adminUser, role: "admin", subtitle: "Bullex Admin" });
    try {
      const teamRows = await storage.getAllTeamMembers();
      for (const t of teamRows) {
        out.push({ id: `team:${t.username}`, name: t.name || t.username, role: "team", subtitle: t.department || t.position || "Team Member" });
      }
    } catch {}
    // Clients must only see Bullex staff (admin + team), never other clients.
    // Only admin and team members may see the full client directory.
    if (me.role === "admin" || me.role === "team") {
      try {
        const kycRows = await storage.getKycApplications();
        for (const k of kycRows) {
          if (k.status === "approved" && k.clientUsername) {
            out.push({ id: `client:${k.id}`, name: k.companyName, role: "client", subtitle: k.contactName || "Client" });
          }
        }
      } catch {}
    }
    res.json(out.filter((u) => u.id !== me.id));
  });

  app.get("/api/chat/messages", async (req, res) => {
    const me = getSessionIdentity(req.session);
    if (!me) return res.status(401).json({ message: "Unauthorized" });
    const roomId = String(req.query.room || "");
    if (!roomId) return res.status(400).json({ message: "room required" });
    if (!canAccessRoom(roomId, me.id)) return res.status(403).json({ message: "Forbidden" });
    const messages = await storage.getChatMessages(roomId, 200);
    res.json(messages);
  });

  app.get("/api/chat/dm-room", (req, res) => {
    const me = getSessionIdentity(req.session);
    if (!me) return res.status(401).json({ message: "Unauthorized" });
    const other = String(req.query.user || "");
    if (!other) return res.status(400).json({ message: "user required" });
    res.json({ roomId: dmRoomId(me.id, other) });
  });
  // ---- end Bullex Chat ----

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
        req.session.allowedModules = teamMember.allowedModules ?? [];
        req.session.save(() => {
          return res.json({ authenticated: true, username: teamMember.username, role: "team", name: teamMember.name, allowedModules: teamMember.allowedModules ?? [] });
        });
      });
      return;
    }
    res.status(401).json({ message: "Invalid username or password" });
  });

  app.get("/api/team/members", requireAuth, async (req, res) => {
    const members = await storage.getAllTeamMembers();
    res.json(members.map(m => ({ ...m, password: undefined })));
  });

  app.post("/api/team/members", requireAdminAuth, async (req, res) => {
    const { username, password, name, department, email, ...rest } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ message: "username, password, and name are required" });
    }
    try {
      const member = await storage.createTeamMember({ username, password, name, department: department || null, email: email || null, ...rest });
      res.json({ ...member, password: undefined });
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  app.patch("/api/team/members/:id", requireAdminAuth, async (req, res) => {
    try {
      const { password, ...data } = req.body;
      if (password !== undefined && password !== null && password !== "") {
        return res.status(400).json({
          message: "Admin password changes are disabled. Use the 'Email Reset Link' button so the team member can set their own password.",
        });
      }
      const member = await storage.updateTeamMember(req.params.id, data);
      res.json({ ...member, password: undefined });
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      res.status(500).json({ message: "Failed to update team member" });
    }
  });

  // Generate & email a one-time password reset link for a team member (admin only)
  app.post("/api/team/members/:id/send-reset-link", requireAdminAuth, async (req, res) => {
    try {
      const member = await storage.getTeamMemberById(req.params.id);
      if (!member) return res.status(404).json({ message: "Team member not found" });
      const recipient = member.email || null;
      if (!recipient) return res.status(400).json({ message: "Team member has no email address on file." });

      const { randomBytes } = await import("crypto");
      const token = randomBytes(32).toString("hex");
      const expiryHours = 2;
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      await storage.invalidateActiveTeamPasswordResetTokens(member.id);
      await storage.createTeamPasswordResetToken(member.id, token, expiresAt);

      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const resetUrl = `${proto}://${host}/team-reset/${token}`;

      let sent = false;
      let emailError: string | undefined;
      try {
        sent = await sendTeamMemberPasswordResetLinkEmail(recipient, member.name || "Team Member", member.username, resetUrl, expiryHours);
        if (!sent) emailError = "Email provider returned a failure (check server logs).";
      } catch (e: any) {
        emailError = e?.message || "Unknown email error";
        console.error("[team-member-reset-link-email] error:", e);
      }
      res.json({ success: sent, emailSent: sent, emailError, recipient, expiresAt, resetUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to send reset link" });
    }
  });

  // Public: verify a team password reset token (no auth)
  app.get("/api/team/reset/:token", async (req, res) => {
    try {
      const row = await storage.getTeamPasswordResetTokenByToken(req.params.token);
      if (!row) return res.status(404).json({ message: "Invalid reset link." });
      if (row.usedAt) return res.status(410).json({ message: "This reset link has already been used." });
      if (new Date(row.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "This reset link has expired." });
      const member = await storage.getTeamMemberById(row.memberId);
      if (!member) return res.status(404).json({ message: "Team member not found." });
      res.json({ valid: true, username: member.username, name: member.name, expiresAt: row.expiresAt });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public: consume a team password reset token and set a new password
  app.post("/api/team/reset/:token", async (req, res) => {
    try {
      const { password } = req.body || {};
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }
      const row = await storage.getTeamPasswordResetTokenByToken(req.params.token);
      if (!row) return res.status(404).json({ message: "Invalid reset link." });
      if (row.usedAt) return res.status(410).json({ message: "This reset link has already been used." });
      if (new Date(row.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "This reset link has expired." });
      const member = await storage.getTeamMemberById(row.memberId);
      if (!member) return res.status(404).json({ message: "Team member not found." });
      await storage.updateTeamMember(member.id, { password });
      await storage.markTeamPasswordResetTokenUsed(row.id);
      await storage.invalidateActiveTeamPasswordResetTokens(member.id);
      res.json({ success: true, username: member.username });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/team/members/:id/photo", requireAdminAuth, (req, res) => {
    teamPhotoUpload.single("photo")(req, res, async (err) => {
      if (handleMulterError(err, res)) return;
      const file = req.file;
      try {
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        const member = await storage.getTeamMemberById(req.params.id);
        if (!member) {
          fs.unlinkSync(path.join(teamUploadsDir, file.filename));
          return res.status(404).json({ message: "Member not found" });
        }
        if (member.photoStoredName) {
          const oldPath = path.join(teamUploadsDir, member.photoStoredName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        const updated = await storage.updateTeamMemberPhoto(req.params.id, file.filename);
        res.json({ ...updated, password: undefined });
      } catch (e: any) {
        if (file) { const fp = path.join(teamUploadsDir, file.filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
        res.status(500).json({ message: e.message });
      }
    });
  });

  app.get("/api/team/members/:id/photo", requireAdminAuth, async (req, res) => {
    try {
      const member = await storage.getTeamMemberById(req.params.id);
      if (!member || !member.photoStoredName) return res.status(404).json({ message: "No photo" });
      const filePath = path.join(teamUploadsDir, member.photoStoredName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/team/members/:id/documents", requireAdminAuth, async (req, res) => {
    const docs = await storage.getTeamMemberDocuments(req.params.id);
    res.json(docs);
  });

  app.post("/api/team/members/:id/documents", requireAdminAuth, teamUpload.single("file"), async (req, res) => {
    const file = req.file;
    try {
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const member = await storage.getTeamMemberById(req.params.id);
      if (!member) {
        fs.unlinkSync(path.join(teamUploadsDir, file.filename));
        return res.status(404).json({ message: "Member not found" });
      }
      const doc = await storage.createTeamMemberDocument({
        memberId: req.params.id,
        docType: req.body.docType || "other",
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
      });
      res.json(doc);
    } catch (err: any) {
      if (file) { const fp = path.join(teamUploadsDir, file.filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/team/documents/:docId/download", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTeamMemberDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const filePath = path.join(teamUploadsDir, doc.storedName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found on disk" });
      res.download(filePath, doc.originalName);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/team/documents/:docId", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTeamMemberDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const filePath = path.join(teamUploadsDir, doc.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await storage.deleteTeamMemberDocument(req.params.docId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/team/members/:id/submissions", requireAdminAuth, async (req, res) => {
    try {
      const [kycs, enquiries, potentialClients] = await Promise.all([
        storage.getKycApplicationsByTeamMemberId(req.params.id),
        storage.getTradeEnquiriesByTeamMemberId(req.params.id),
        storage.getPotentialClientsByTeamMemberId(req.params.id),
      ]);
      res.json({ kycs, enquiries, potentialClients });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/team/members/:id", requireAdminAuth, async (req, res) => {
    try {
      const member = await storage.getTeamMemberById(req.params.id);
      if (member?.photoStoredName) {
        const photoPath = path.join(teamUploadsDir, member.photoStoredName);
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
      }
      const docs = await storage.getTeamMemberDocuments(req.params.id);
      for (const doc of docs) {
        const fp = path.join(teamUploadsDir, doc.storedName);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      await storage.deleteTeamMember(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/team-kyc", requireAdminAuth, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const apps = await storage.getTeamKycApplications();
    // Join participantId from team_members (by teamUsername) so the admin UI can display it.
    const members = await storage.getAllTeamMembers();
    const pidByUsername = new Map(members.map(m => [m.username, m.participantId]));
    res.json(apps.map(a => ({
      ...a,
      teamPassword: undefined,
      participantId: a.teamUsername ? (pidByUsername.get(a.teamUsername) || null) : null,
    })));
  });

  // Send KYC invitation email to a candidate (admin only)
  app.post("/api/team-kyc/invite", requireAdminAuth, async (req, res) => {
    try {
      const { name, email, position, department, message } = req.body;
      if (!email) return res.status(400).json({ message: "Candidate email is required" });

      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const baseUrl = `${proto}://${host}`;
      const params = new URLSearchParams();
      if (name) params.set("name", name);
      if (email) params.set("email", email);
      if (position) params.set("position", position);
      if (department) params.set("department", department);
      params.set("ref", "invite");
      const kycUrl = `${baseUrl}/team-kyc?${params.toString()}`;

      const { sendTeamKycInvite } = await import("./email.js");
      const sent = await sendTeamKycInvite(email, name || "Candidate", position || null, department || null, message || null, kycUrl);
      if (!sent) return res.status(500).json({ message: "Email could not be sent. Check RESEND_API_KEY." });
      res.json({ success: true, kycUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/team-kyc", async (req, res) => {
    try {
      const { fullName, email, ...rest } = req.body;
      if (!fullName || !email) {
        return res.status(400).json({ message: "fullName and email are required" });
      }
      const app = await storage.createTeamKycApplication({ fullName, email, ...rest });
      res.json(app);

      // Fire emails in background after responding
      const submittedAt = new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
      if (adminEmail) {
        sendTeamKycAdminNotification(
          adminEmail,
          fullName,
          email,
          rest.positionApplied || null,
          rest.department || null,
          submittedAt
        ).catch((err) => console.error("[email] team-kyc admin notify failed:", err));
      }
      if (email) {
        sendTeamKycConfirmation(email, fullName)
          .catch((err) => console.error("[email] team-kyc confirmation failed:", err));
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to submit application" });
    }
  });

  // Public photo upload for team KYC application
  app.patch("/api/team-kyc/:id/photo", (req, res) => {
    teamPhotoUpload.single("photo")(req, res, async (err) => {
      if (handleMulterError(err, res)) return;
      const file = req.file;
      try {
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        const app = await storage.getTeamKycApplicationById(req.params.id);
        if (!app) {
          fs.unlinkSync(path.join(teamUploadsDir, file.filename));
          return res.status(404).json({ message: "Application not found" });
        }
        if (app.photoStoredName) {
          const oldPath = path.join(teamUploadsDir, app.photoStoredName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        const updated = await storage.updateTeamKycPhoto(req.params.id, file.filename, file.originalname);
        res.json({ id: updated.id, photoOriginalName: updated.photoOriginalName });
      } catch (e: any) {
        if (file) { const fp = path.join(teamUploadsDir, file.filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
        res.status(500).json({ message: e.message });
      }
    });
  });

  // Serve photo for team KYC application (no auth — UUID provides security-by-obscurity)
  app.get("/api/team-kyc/:id/photo", async (req, res) => {
    try {
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app || !app.photoStoredName) return res.status(404).json({ message: "No photo" });
      const filePath = path.join(teamUploadsDir, app.photoStoredName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      res.set("Cache-Control", "public, max-age=3600");
      res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public document upload for team KYC application
  app.post("/api/team-kyc/:id/documents", (req, res) => {
    teamUpload.single("file")(req, res, async (err) => {
      if (handleMulterError(err, res)) return;
      const file = req.file;
      try {
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        const app = await storage.getTeamKycApplicationById(req.params.id);
        if (!app) {
          fs.unlinkSync(path.join(teamUploadsDir, file.filename));
          return res.status(404).json({ message: "Application not found" });
        }
        const doc = await storage.createTeamKycDocument({
          applicationId: req.params.id,
          docType: req.body.docType || "other",
          originalName: file.originalname,
          storedName: file.filename,
          mimeType: file.mimetype,
          size: file.size,
        });
        res.json(doc);
      } catch (e: any) {
        if (file) { const fp = path.join(teamUploadsDir, file.filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
        res.status(500).json({ message: e.message });
      }
    });
  });

  // List documents for a team KYC application (admin only)
  app.get("/api/team-kyc/:id/documents", requireAdminAuth, async (req, res) => {
    const docs = await storage.getTeamKycDocuments(req.params.id);
    res.json(docs);
  });

  // Delete a team KYC document (admin only)
  app.delete("/api/team-kyc-documents/:docId", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTeamKycDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const filePath = path.join(teamUploadsDir, doc.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await storage.deleteTeamKycDocument(req.params.docId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Download a team KYC document (admin only)
  app.get("/api/team-kyc-documents/:docId/download", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTeamKycDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const filePath = path.join(teamUploadsDir, doc.storedName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      res.download(filePath, doc.originalName);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/team-kyc/:id", requireAdminAuth, async (req, res) => {
    try {
      const { status, reviewNotes, teamUsername, teamPassword, allowedModules } = req.body;
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
              allowedModules: Array.isArray(allowedModules) ? allowedModules : [],
              name: app.fullName,
              department: app.department || null,
              email: app.email || null,
              dateOfBirth: app.dateOfBirth || null,
              gender: app.gender || null,
              nationality: app.nationality || null,
              passportNumber: app.passportNumber || null,
              maritalStatus: app.maritalStatus || null,
              phone: app.phone || null,
              homeAddress: app.homeAddress || null,
              city: app.city || null,
              country: app.country || null,
              position: app.positionApplied || null,
              employmentType: app.employmentType || null,
              startDate: app.expectedStartDate || null,
              highestQualification: app.highestQualification || null,
              institution: app.institution || null,
              graduationYear: app.graduationYear || null,
              previousEmployer: app.previousEmployer || null,
              previousRole: app.previousRole || null,
              yearsExperience: app.yearsExperience || null,
              emergencyName: app.emergencyName || null,
              emergencyRelationship: app.emergencyRelationship || null,
              emergencyPhone: app.emergencyPhone || null,
              bankName: app.bankName || null,
              bankBranch: app.bankBranch || null,
              payrollAccountName: app.payrollAccountName || null,
              payrollAccountNumber: app.payrollAccountNumber || null,
              payrollSwift: app.payrollSwift || null,
              additionalNotes: app.additionalNotes || null,
            });
          } else {
            await storage.updateTeamMember(existing.id, {
              allowedModules: Array.isArray(allowedModules) ? allowedModules : (existing.allowedModules ?? []),
              name: app.fullName,
              department: app.department || null,
              email: app.email || null,
              dateOfBirth: app.dateOfBirth || null,
              gender: app.gender || null,
              nationality: app.nationality || null,
              passportNumber: app.passportNumber || null,
              maritalStatus: app.maritalStatus || null,
              phone: app.phone || null,
              homeAddress: app.homeAddress || null,
              city: app.city || null,
              country: app.country || null,
              position: app.positionApplied || null,
              employmentType: app.employmentType || null,
              startDate: app.expectedStartDate || null,
              highestQualification: app.highestQualification || null,
              institution: app.institution || null,
              graduationYear: app.graduationYear || null,
              previousEmployer: app.previousEmployer || null,
              previousRole: app.previousRole || null,
              yearsExperience: app.yearsExperience || null,
              emergencyName: app.emergencyName || null,
              emergencyRelationship: app.emergencyRelationship || null,
              emergencyPhone: app.emergencyPhone || null,
              bankName: app.bankName || null,
              bankBranch: app.bankBranch || null,
              payrollAccountName: app.payrollAccountName || null,
              payrollAccountNumber: app.payrollAccountNumber || null,
              payrollSwift: app.payrollSwift || null,
              additionalNotes: app.additionalNotes || null,
            });
          }
        } catch (_) {}
      }

      // On approval (transition only): send welcome email + auto-prepare NCNDA for admin to sign & send.
      // Skip if the application was already approved on a prior PATCH so we don't resend or duplicate.
      let emailSent: boolean | null = null;
      let emailError: string | null = null;
      if (status === "approved" && app.status !== "approved") {
        // 1) Welcome email — include participant ID from the freshly-created/updated team member.
        let welcomeParticipantId: string | null = null;
        try {
          if (teamUsername) {
            const tm = await storage.getTeamMemberByUsername(teamUsername);
            welcomeParticipantId = tm?.participantId || null;
          }
        } catch (_) {}
        if (!app.email) {
          emailError = "No email address on the application — welcome email skipped.";
          console.warn("[team-kyc] welcome email skipped: no recipient email");
        } else {
          try {
            emailSent = await sendTeamMemberWelcomeEmail(
              app.email,
              app.fullName,
              app.positionApplied || null,
              app.employmentType || null,
              teamUsername || null,
              welcomeParticipantId,
            );
            if (!emailSent) {
              emailError = `Welcome email was rejected by the email provider. Recipient: ${app.email}. Check server logs and ensure your Resend "from" domain is verified.`;
            }
          } catch (e: any) {
            emailSent = false;
            emailError = `Welcome email failed: ${e?.message || "unknown error"}`;
            console.error("[team-kyc] welcome email failed:", e);
          }
        }

        // 2) Auto-prepare NCNDA (Party A = Bullfrog Group, Party B = team member)
        try {
          const partyA: PartyDetails = {
            name: "Bullfrog Group",
            address: "Dubai, United Arab Emirates",
            contact: "team@bullex.tech",
          };
          const partyB: PartyDetails = {
            name: app.fullName,
            address: [app.homeAddress, app.city, app.country].filter(Boolean).join(", ") || "—",
            contact: app.email || "—",
          };
          const product: any = {
            commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
            governingLaw: "United Arab Emirates",
            recapValidity: "Courts of Dubai, UAE",
            validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
          };
          const title = `NCNDA — ${app.fullName}`;
          const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
          const created = await storage.createDocument({
            docType: "NCNDA",
            title,
            content,
            status: "pending_review",
            adminChecks: buildAdminChecks("NCNDA"),
            buyerEmail: app.email || null,
            sellerEmail: null,
            agentCode: welcomeParticipantId || null,
          } as any);
          try {
            const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", welcomeParticipantId || undefined);
            const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", welcomeParticipantId || undefined);
            await storage.updateDocument(created.id, { docxPath, pdfPath });
          } catch (fileErr) {
            console.error("[team-kyc] NCNDA file generation failed:", fileErr);
          }
        } catch (e) {
          console.error("[team-kyc] auto-NCNDA creation failed:", e);
        }
      }

      res.json({ ...updated, teamPassword: undefined, emailSent, emailError });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update application" });
    }
  });

  // Re-fire welcome email + auto-generate NCNDA for an already-approved team KYC application.
  app.post("/api/team-kyc/:id/resend-welcome", requireAdminAuth, async (req, res) => {
    try {
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app) return res.status(404).json({ message: "Application not found" });
      if (app.status !== "approved") {
        return res.status(400).json({ message: "Application must be approved before resending welcome / NCNDA" });
      }

      let emailSent = false;
      let resendParticipantId: string | null = null;
      try {
        if (app.teamUsername) {
          const tm = await storage.getTeamMemberByUsername(app.teamUsername);
          resendParticipantId = tm?.participantId || null;
        }
      } catch (_) {}
      if (app.email) {
        try {
          emailSent = await sendTeamMemberWelcomeEmail(
            app.email,
            app.fullName,
            app.positionApplied || null,
            app.employmentType || null,
            app.teamUsername || null,
            resendParticipantId,
          );
        } catch (e) {
          console.error("[team-kyc] resend welcome email failed:", e);
        }
      }

      let ncndaDocId: string | null = null;
      try {
        const partyA: PartyDetails = {
          name: "Bullfrog Group",
          address: "Dubai, United Arab Emirates",
          contact: "team@bullex.tech",
        };
        const partyB: PartyDetails = {
          name: app.fullName,
          address: [app.homeAddress, app.city, app.country].filter(Boolean).join(", ") || "—",
          contact: app.email || "—",
        };
        const product: any = {
          commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
          governingLaw: "United Arab Emirates",
          recapValidity: "Courts of Dubai, UAE",
          validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        };
        const title = `NCNDA — ${app.fullName}`;
        const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
        const created = await storage.createDocument({
          docType: "NCNDA",
          title,
          content,
          status: "pending_review",
          adminChecks: buildAdminChecks("NCNDA"),
          buyerEmail: app.email || null,
          sellerEmail: null,
          agentCode: resendParticipantId || null,
        } as any);
        ncndaDocId = created.id;
        try {
          const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", resendParticipantId || undefined);
          const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", resendParticipantId || undefined);
          await storage.updateDocument(created.id, { docxPath, pdfPath });
        } catch (fileErr) {
          console.error("[team-kyc] resend NCNDA file generation failed:", fileErr);
        }
      } catch (e: any) {
        console.error("[team-kyc] resend NCNDA creation failed:", e);
        return res.status(500).json({ message: `NCNDA creation failed: ${e.message || e}` });
      }

      res.json({ success: true, emailSent, ncndaDocId });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to resend welcome" });
    }
  });

  // Generate a fresh NCNDA against an approved team member (Agent).
  // Party A (Issuer) = Bullfrog Group; Party B (Receiving Party) = the team member.
  app.post("/api/team-kyc/:id/generate-ncnda", requireAdminAuth, async (req, res) => {
    try {
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app) return res.status(404).json({ message: "Application not found" });
      if (app.status !== "approved") {
        return res.status(400).json({ message: "Team member must be approved before generating NCNDA" });
      }
      let participantId: string | null = null;
      if (app.teamUsername) {
        const tm = await storage.getTeamMemberByUsername(app.teamUsername);
        participantId = tm?.participantId || null;
      }

      const partyA: any = { name: "Bullfrog Group", address: "Dubai, United Arab Emirates", contact: "team@bullex.tech" };
      const partyB: any = {
        name: app.fullName,
        address: [app.homeAddress, app.city, app.country].filter(Boolean).join(", ") || "—",
        contact: app.email || "—",
      };
      const product: any = {
        commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        recapValidity: "Courts of Dubai, UAE",
        validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      };

      const title = `NCNDA — ${app.fullName}`;
      const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
      const created = await storage.createDocument({
        docType: "NCNDA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("NCNDA"),
        buyerEmail: app.email || null,
        sellerEmail: null,
        agentCode: participantId || null,
      } as any);
      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", participantId || undefined);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", participantId || undefined);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[team-ncnda] file generation failed:", fileErr?.message || fileErr);
      }
      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[team-ncnda] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate NCNDA" });
    }
  });

  // Generate an International Commission Agreement (ICA) against an approved team member (Agent).
  // Principal = Bullfrog Group; Agent = the team member.
  app.post("/api/team-kyc/:id/generate-ica", requireAdminAuth, async (req, res) => {
    try {
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app) return res.status(404).json({ message: "Application not found" });
      if (app.status !== "approved") {
        return res.status(400).json({ message: "Team member must be approved before generating ICA" });
      }
      let participantId: string | null = null;
      if (app.teamUsername) {
        const tm = await storage.getTeamMemberByUsername(app.teamUsername);
        participantId = tm?.participantId || null;
      }
      if (!participantId) {
        return res.status(400).json({ message: "Team member has no participant ID allocated; cannot generate ICA without an agent code" });
      }

      const agentLabel = req.body?.agentLabel || "Agent";
      const agencyType = req.body?.agencyType || "Non-Exclusive";

      const principal: any = { name: "Bullfrog Group", address: "Dubai, United Arab Emirates", contact: "team@bullex.tech" };
      const agent: any = {
        name: app.fullName,
        address: [app.homeAddress, app.city, app.country].filter(Boolean).join(", ") || "—",
        contact: app.email || "—",
      };
      const product: any = {
        effectiveDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        agentLabel,
        agencyType,
        principalCountry: "United Arab Emirates",
        principalEntityType: "Group Holding",
        agentCountry: app.country || undefined,
        agentEntityType: app.employmentType || "Individual",
        agentRepresentative: app.fullName,
        agentDesignation: app.positionApplied || undefined,
        agentBankName: app.bankName || undefined,
        agentBankAddress: app.bankBranch || undefined,
        agentAccountName: app.payrollAccountName || undefined,
        agentAccountNumber: app.payrollAccountNumber || undefined,
        agentSwift: app.payrollSwift || undefined,
        commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        seatOfArbitration: "Dubai, UAE",
        venueOfArbitration: "Dubai International Arbitration Centre (DIAC)",
        numArbitrators: "One",
        termYears: "3",
        recordKeepingYears: "7",
        amlOption: "Standard Commercial Compliance",
        commissionStructure: req.body?.commissionStructure || undefined,
        commissionBasis: req.body?.commissionBasis || undefined,
      };

      const title = `ICA — ${app.fullName}`;
      const content = generateDocumentContent("ICA", undefined, principal, agent, product);
      const created = await storage.createDocument({
        docType: "ICA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("ICA"),
        buyerEmail: null,
        sellerEmail: app.email || null,
        agentCode: participantId,
      } as any);

      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", participantId);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", participantId);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[team-ica] file generation failed:", fileErr?.message || fileErr);
      }
      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[team-ica] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate ICA" });
    }
  });

  // Generate NCNDA against a registered team member (by team_members.id).
  // Party A (Issuer) = Bullfrog Group; Party B (Receiving Party) = the team member (Agent).
  app.post("/api/team-members/:id/generate-ncnda", requireAdminAuth, async (req, res) => {
    try {
      const tm = await storage.getTeamMemberById(req.params.id);
      if (!tm) return res.status(404).json({ message: "Team member not found" });
      const participantId = tm.participantId || null;

      const partyA: any = { name: "Bullfrog Group", address: "Dubai, United Arab Emirates", contact: "team@bullex.tech" };
      const partyB: any = {
        name: tm.name,
        address: [tm.homeAddress, tm.city, tm.country].filter(Boolean).join(", ") || "—",
        contact: tm.email || "—",
      };
      const product: any = {
        commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        recapValidity: "Courts of Dubai, UAE",
        validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      };

      const title = `NCNDA — ${tm.name}`;
      const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
      const created = await storage.createDocument({
        docType: "NCNDA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("NCNDA"),
        buyerEmail: tm.email || null,
        sellerEmail: null,
        agentCode: participantId,
      } as any);
      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", participantId || undefined);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", participantId || undefined);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[tm-ncnda] file generation failed:", fileErr?.message || fileErr);
      }
      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[tm-ncnda] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate NCNDA" });
    }
  });

  // Generate ICA against a registered team member (by team_members.id).
  // Principal = Bullfrog Group; Agent = the team member.
  app.post("/api/team-members/:id/generate-ica", requireAdminAuth, async (req, res) => {
    try {
      const tm = await storage.getTeamMemberById(req.params.id);
      if (!tm) return res.status(404).json({ message: "Team member not found" });
      const participantId = tm.participantId || null;
      if (!participantId) {
        return res.status(400).json({ message: "Team member has no participant ID allocated; cannot generate ICA without an agent code" });
      }

      const agentLabel = req.body?.agentLabel || "Agent";
      const agencyType = req.body?.agencyType || "Non-Exclusive";

      const principal: any = { name: "Bullfrog Group", address: "Dubai, United Arab Emirates", contact: "team@bullex.tech" };
      const agent: any = {
        name: tm.name,
        address: [tm.homeAddress, tm.city, tm.country].filter(Boolean).join(", ") || "—",
        contact: tm.email || "—",
      };
      const product: any = {
        effectiveDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        agentLabel,
        agencyType,
        principalCountry: "United Arab Emirates",
        principalEntityType: "Group Holding",
        agentCountry: tm.country || undefined,
        agentEntityType: tm.employmentType || "Individual",
        agentRepresentative: tm.name,
        agentDesignation: tm.position || undefined,
        agentBankName: tm.bankName || undefined,
        agentBankAddress: tm.bankBranch || undefined,
        agentAccountName: tm.payrollAccountName || undefined,
        agentAccountNumber: tm.payrollAccountNumber || undefined,
        agentSwift: tm.payrollSwift || undefined,
        commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        seatOfArbitration: "Dubai, UAE",
        venueOfArbitration: "Dubai International Arbitration Centre (DIAC)",
        numArbitrators: "One",
        termYears: "3",
        recordKeepingYears: "7",
        amlOption: "Standard Commercial Compliance",
        commissionStructure: req.body?.commissionStructure || undefined,
        commissionBasis: req.body?.commissionBasis || undefined,
      };

      const title = `ICA — ${tm.name}`;
      const content = generateDocumentContent("ICA", undefined, principal, agent, product);
      const created = await storage.createDocument({
        docType: "ICA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("ICA"),
        buyerEmail: null,
        sellerEmail: tm.email || null,
        agentCode: participantId,
      } as any);
      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", participantId);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", participantId);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[tm-ica] file generation failed:", fileErr?.message || fileErr);
      }
      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[tm-ica] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate ICA" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.json({
        authenticated: true,
        username: req.session.username,
        role: req.session.role || "admin",
        allowedModules: req.session.allowedModules ?? null,
      });
    }
    res.json({ authenticated: false });
  });

  // ---- Admin Amend Mode (sudo-style re-auth gate) -------------------------
  app.post("/api/admin/amend-unlock", requireAdminAuth, async (req, res) => {
    const { password } = req.body ?? {};
    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass) return res.status(500).json({ message: "Admin credentials not configured" });
    if (!password || password !== adminPass) {
      return res.status(401).json({ message: "Incorrect admin password." });
    }
    const until = Date.now() + AMEND_UNLOCK_DURATION_MS;
    req.session.amendUnlockUntil = until;
    req.session.save(() => res.json({ unlocked: true, until }));
  });

  app.post("/api/admin/amend-lock", requireAdminAuth, (req, res) => {
    req.session.amendUnlockUntil = undefined;
    req.session.save(() => res.json({ unlocked: false }));
  });

  app.get("/api/admin/amend-status", (req, res) => {
    const until = req.session?.amendUnlockUntil;
    const unlocked = !!until && until > Date.now() && req.session?.role === "admin";
    res.json({ unlocked, until: unlocked ? until : null });
  });

  // ---- Amend endpoints (admin + unlocked) ---------------------------------
  const KYC_AMEND_LOCKED_FIELDS = new Set([
    "id", "status", "blockchainHash", "previousHash", "blockNumber", "nonce",
    "createdAt", "amlStatus", "amlMatches", "amlCheckedAt", "amlCheckedBy",
  ]);

  app.patch("/api/kyc/:id/amend", requireAdminAuth, requireAmendUnlock, async (req, res) => {
    try {
      const existing = await storage.getKycApplication(req.params.id);
      if (!existing) return res.status(404).json({ message: "KYC application not found" });
      const fields: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body ?? {})) {
        if (KYC_AMEND_LOCKED_FIELDS.has(key)) continue;
        fields[key] = value;
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: "No editable fields supplied" });
      }
      const updated = await storage.updateKycApplicationFields(req.params.id, fields);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to amend KYC application" });
    }
  });

  const TEAM_AMEND_LOCKED_FIELDS = new Set([
    "id", "password", "createdAt", "participantId",
  ]);

  app.patch("/api/team/members/:id/amend", requireAdminAuth, requireAmendUnlock, async (req, res) => {
    try {
      const fields: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body ?? {})) {
        if (TEAM_AMEND_LOCKED_FIELDS.has(key)) continue;
        fields[key] = value;
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: "No editable fields supplied" });
      }
      const updated = await storage.updateTeamMember(req.params.id, fields);
      res.json({ ...updated, password: undefined });
    } catch (err: any) {
      if (err?.message?.includes("unique")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      res.status(500).json({ message: err?.message || "Failed to amend team member" });
    }
  });

  const REGISTRATION_AMEND_ALLOWED = new Set([
    "fullName", "companyName", "email", "phone", "country", "roleType",
    "commodities", "message", "reviewNotes",
  ]);

  app.patch("/api/registrations/:id/amend", requireAdminAuth, requireAmendUnlock, async (req, res) => {
    try {
      const fields: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body ?? {})) {
        if (!REGISTRATION_AMEND_ALLOWED.has(key)) continue;
        fields[key] = value;
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: "No editable fields supplied" });
      }
      const updated = await storage.updateRegistrationFields(req.params.id, fields);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to amend registration" });
    }
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

      notify({
        type: response === "accepted" ? "document_accepted" : "document_rejected",
        title: response === "accepted" ? `${doc.docType} accepted by client` : `${doc.docType} amendment requested`,
        message: response === "accepted"
          ? `${req.session.clientCompanyName || "Client"} accepted ${doc.title}`
          : `${req.session.clientCompanyName || "Client"} requested changes to ${doc.title}`,
        link: "/documents",
        severity: response === "accepted" ? "success" : "warning",
        module: "documents",
      });

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

      const fullPath = getDocFilePath(filePath);
      if (!fullPath) return res.status(404).json({ message: "File not found" });

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

  app.get("/api/kyc", requireAuth, async (_req, res) => {
    try {
      const result = await storage.getKycApplications();
      res.json(result.map(sanitizeKyc));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC applications" });
    }
  });

  async function runSanctionsScreening(kycId: string, checkedBy: string) {
    const kyc = await storage.getKycApplicationById(kycId);
    if (!kyc) return null;

    const queries: { label: string; name: string; schema: string }[] = [];
    if (kyc.companyName) queries.push({ label: "Company", name: kyc.companyName, schema: "Company" });
    if (kyc.signatoryName) queries.push({ label: "Authorized Signatory", name: kyc.signatoryName, schema: "Person" });
    if (kyc.contactName && kyc.contactName !== kyc.signatoryName) {
      queries.push({ label: "Primary Contact", name: kyc.contactName, schema: "Person" });
    }

    const allMatches: any[] = [];
    let successfulQueries = 0;
    const apiKey = process.env.OPENSANCTIONS_API_KEY;
    const authHeaders: Record<string, string> = apiKey ? { Authorization: `ApiKey ${apiKey}` } : {};
    for (const q of queries) {
      try {
        const url = `https://api.opensanctions.org/match/default`;
        const body = { queries: { q1: { schema: q.schema, properties: { name: [q.name] } } } };
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const searchUrl = `https://api.opensanctions.org/search/default?q=${encodeURIComponent(q.name)}&limit=5`;
          const sresp = await fetch(searchUrl, { headers: authHeaders });
          if (!sresp.ok) {
            console.error(`[aml] both match and search endpoints failed for "${q.name}" (match ${resp.status}, search ${sresp.status})`);
            continue;
          }
          const sdata: any = await sresp.json();
          for (const r of sdata.results || []) {
            allMatches.push({
              queryLabel: q.label, queryName: q.name,
              matchedName: r.caption, schema: r.schema,
              score: r.score ?? null, datasets: r.datasets || [],
              topics: r.properties?.topics || [], countries: r.properties?.country || [],
              sourceUrl: `https://www.opensanctions.org/entities/${r.id}/`,
            });
          }
          successfulQueries++;
          continue;
        }
        const data: any = await resp.json();
        const results = data?.responses?.q1?.results || [];
        for (const r of results) {
          allMatches.push({
            queryLabel: q.label, queryName: q.name,
            matchedName: r.caption, schema: r.schema,
            score: r.score ?? null, match: r.match ?? false, datasets: r.datasets || [],
            topics: r.properties?.topics || [], countries: r.properties?.country || [],
            sourceUrl: `https://www.opensanctions.org/entities/${r.id}/`,
          });
        }
        successfulQueries++;
      } catch (err: any) {
        console.error(`[aml] screening failed for "${q.name}":`, err.message);
      }
    }

    // Fail-closed: if no queries succeeded, do NOT mark as clear. Persist an error state
    // so the approval gate remains locked until a real screening run completes.
    if (successfulQueries === 0) {
      const reason = apiKey
        ? "Screening provider unreachable — no queries completed successfully."
        : "Screening provider not connected — set OPENSANCTIONS_API_KEY to enable OFAC / UN / PEP screening.";
      const errored = await storage.updateKycAmlScreening(kycId, {
        amlStatus: "not_run",
        amlMatches: [],
        amlCheckedBy: checkedBy,
        amlNotes: reason,
        ofacStatus: "not_run", ofacMatches: [],
        unSanctionsStatus: "not_run", unSanctionsMatches: [],
        pepStatus: "not_run", pepMatches: [],
      });
      return {
        kyc: errored,
        amlStatus: "not_run",
        ofacStatus: "not_run",
        unSanctionsStatus: "not_run",
        pepStatus: "not_run",
        matchCount: 0,
        positiveCount: 0,
      };
    }

    const classifyMatch = (m: any) => {
      const ds: string[] = (m.datasets || []).map((d: string) => String(d).toLowerCase());
      const topics: string[] = (m.topics || []).map((t: string) => String(t).toLowerCase());
      return {
        ofac: ds.some(d => d.includes("us_ofac")),
        un: ds.some(d => d.includes("un_sc")),
        pep: topics.some(t => t.includes("role.pep") || t === "pep") || ds.some(d => /(^|_)peps?(_|$)/.test(d) || d.includes("pep")),
      };
    };
    const isPositive = (m: any) => m.match === true || (m.score != null && m.score >= 0.7);

    const ofacMatches = allMatches.filter(m => classifyMatch(m).ofac);
    const unMatches = allMatches.filter(m => classifyMatch(m).un);
    const pepMatches = allMatches.filter(m => classifyMatch(m).pep);
    const positives = allMatches.filter(isPositive);

    const ofacStatus = ofacMatches.some(isPositive) ? "hit" : "clear";
    const unSanctionsStatus = unMatches.some(isPositive) ? "hit" : "clear";
    const pepStatus = pepMatches.some(isPositive) ? "hit" : "clear";
    const amlStatus = positives.length > 0 ? "flagged" : "clear";

    const updated = await storage.updateKycAmlScreening(kycId, {
      amlStatus,
      amlMatches: allMatches,
      amlCheckedBy: checkedBy,
      ofacStatus, ofacMatches,
      unSanctionsStatus, unSanctionsMatches: unMatches,
      pepStatus, pepMatches,
    });

    if (amlStatus === "flagged") {
      const hits: string[] = [];
      if (ofacStatus === "hit") hits.push("OFAC");
      if (unSanctionsStatus === "hit") hits.push("UN Sanctions");
      if (pepStatus === "hit") hits.push("PEP");
      notify({
        type: "aml_flagged",
        title: "Sanctions / PEP screening flagged",
        message: `${kyc.companyName} — ${positives.length} positive match(es)${hits.length ? ` (${hits.join(", ")})` : ""}`,
        link: "/kyc-admin",
        severity: "alert",
        module: "kyc",
      });
    }

    return {
      kyc: updated,
      amlStatus,
      ofacStatus,
      unSanctionsStatus,
      pepStatus,
      matchCount: allMatches.length,
      positiveCount: positives.length,
    };
  }

  app.post("/api/kyc/:id/aml-check", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const exists = await storage.getKycApplicationById(id);
      if (!exists) return res.status(404).json({ message: "KYC application not found" });
      const checkedBy = req.session.username || "admin";
      const result = await runSanctionsScreening(id, checkedBy);
      if (!result) return res.status(404).json({ message: "KYC application not found" });
      res.json({
        amlStatus: result.amlStatus,
        ofacStatus: result.ofacStatus,
        unSanctionsStatus: result.unSanctionsStatus,
        pepStatus: result.pepStatus,
        matchCount: result.matchCount,
        positiveCount: result.positiveCount,
        kyc: sanitizeKyc(result.kyc),
      });
    } catch (error: any) {
      console.error("[aml] screening error:", error);
      res.status(500).json({ message: error.message || "AML screening failed" });
    }
  });

  app.post("/api/kyc/:id/aml-override", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { notes, decision } = req.body;
      if (!["manual_clear", "blocked"].includes(decision)) {
        return res.status(400).json({ message: "Decision must be 'manual_clear' or 'blocked'" });
      }
      if (!notes || typeof notes !== "string" || notes.trim().length < 5) {
        return res.status(400).json({ message: "Override notes (min 5 chars) are required for audit trail" });
      }
      const kyc = await storage.getKycApplicationById(id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const checkedBy = req.session.username || "admin";
      const updated = await storage.updateKycAmlScreening(id, {
        amlStatus: decision,
        amlCheckedBy: checkedBy,
        amlNotes: notes,
      });
      res.json(sanitizeKyc(updated));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "AML override failed" });
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
      if (status === "approved" && !["clear", "manual_clear"].includes(kyc.amlStatus || "not_run")) {
        return res.status(400).json({ message: "AML / World-Check screening must be completed (clear or manual override) before approval." });
      }

      if (status === "approved" && clientUsername) {
        const existingUser = await storage.getKycByClientUsername(clientUsername);
        if (existingUser && existingUser.id !== id) {
          return res.status(400).json({ message: "This username is already in use by another client" });
        }
      }

      let updated = await storage.updateKycStatus(id, status, reviewNotes, category, products);

      let finalResult = updated;
      if (status === "approved") {
        if (clientUsername && clientPassword) {
          await storage.updateKycClientCredentials(id, clientUsername, clientPassword);
        }
        // Allocate a stable, human-readable participant ID on first approval (idempotent).
        // Fail the approval if allocation fails — clients must have a participant ID.
        try {
          updated = await storage.assignKycParticipantId(id);
          finalResult = updated;
        } catch (err: any) {
          console.error("[participant-id] KYC allocation failed:", err.message);
          return res.status(500).json({ message: "Failed to allocate participant ID; approval not finalised." });
        }

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
            clientPassword,
            updated.participantId
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
            clientPassword,
            updated.participantId
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

  // Generate an NCNDA (Mutual Non-Circumvention / Non-Disclosure Agreement) for an approved KYC application.
  // Party A (Issuer) = Bullfrog Group; Party B (Receiving Party) = the approved participant.
  app.post("/api/kyc/:id/generate-ncnda", requireAdminAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      if (kyc.status !== "approved") {
        return res.status(400).json({ message: "NCNDA can only be generated for approved KYC applications" });
      }

      const partyA: any = {
        name: "Bullfrog Group",
        address: "Dubai, United Arab Emirates",
        contact: "team@bullex.tech",
      };
      const partyB: any = {
        name: kyc.companyName,
        address: [kyc.registeredAddress, kyc.primaryBusinessAddress].filter(Boolean).join(" / ") || "—",
        contact: kyc.signatoryEmail || kyc.contactEmail || "—",
      };
      const product: any = {
        commodity: kyc.products || kyc.coreBusinessDescription || "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        recapValidity: "Courts of Dubai, UAE",
        validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      };

      const title = `NCNDA — ${kyc.companyName}`;
      const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
      const created = await storage.createDocument({
        docType: "NCNDA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("NCNDA"),
        buyerEmail: kyc.signatoryEmail || kyc.contactEmail || null,
        sellerEmail: null,
        sentToClientId: kyc.id,
        agentCode: kyc.participantId || null,
      } as any);

      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", kyc.participantId || undefined);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", kyc.participantId || undefined);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[ncnda] file generation failed:", fileErr?.message || fileErr);
      }

      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[ncnda] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate NCNDA" });
    }
  });

  // Generate an International Commission Agreement (ICA) for an approved KYC application
  // (typically used for Agent / Broker / Facilitator participant categories).
  app.post("/api/kyc/:id/generate-ica", requireAdminAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      if (kyc.status !== "approved") {
        return res.status(400).json({ message: "ICA can only be generated for approved KYC applications" });
      }
      if (!kyc.participantId) {
        return res.status(400).json({ message: "KYC has no participant ID allocated; cannot generate ICA without an agent code" });
      }

      const agentLabel = req.body?.agentLabel || "Agent";
      const agencyType = req.body?.agencyType || "Non-Exclusive";

      const principal = {
        name: "Bullfrog Group",
        address: "Dubai, United Arab Emirates",
        contact: "team@bullex.tech",
      };
      const agent = {
        name: kyc.companyName,
        address: [kyc.registeredAddress, kyc.primaryBusinessAddress].filter(Boolean).join(" / ") || "—",
        contact: kyc.signatoryEmail || kyc.contactEmail || "—",
      };
      const product: any = {
        effectiveDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        agentLabel,
        agencyType,
        principalCountry: "United Arab Emirates",
        principalEntityType: "Group Holding",
        agentCountry: kyc.countryOfOperation || undefined,
        agentEntityType: kyc.businessType || undefined,
        agentRepresentative: kyc.signatoryName || kyc.contactName || undefined,
        agentDesignation: kyc.signatoryTitle || kyc.contactTitle || undefined,
        agentBankName: kyc.bankName || undefined,
        agentBankAddress: kyc.bankAddress || undefined,
        agentAccountName: kyc.accountName || undefined,
        agentAccountNumber: kyc.accountNumber || undefined,
        agentSwift: kyc.swiftCode || undefined,
        commodity: kyc.products || kyc.coreBusinessDescription || undefined,
        governingLaw: "United Arab Emirates",
        seatOfArbitration: "Dubai, UAE",
        venueOfArbitration: "Dubai International Arbitration Centre (DIAC)",
        numArbitrators: "One",
        termYears: "3",
        recordKeepingYears: "7",
        amlOption: "Standard Commercial Compliance",
        commissionStructure: req.body?.commissionStructure || undefined,
        commissionBasis: req.body?.commissionBasis || undefined,
      };

      const title = `ICA — ${kyc.companyName}`;
      const content = generateDocumentContent("ICA", undefined, principal as any, agent as any, product);
      const created = await storage.createDocument({
        docType: "ICA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("ICA"),
        buyerEmail: null,
        sellerEmail: kyc.signatoryEmail || kyc.contactEmail || null,
        sentToClientId: kyc.id,
        agentCode: kyc.participantId,
      } as any);

      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", kyc.participantId);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", kyc.participantId);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[ica] file generation failed:", fileErr?.message || fileErr);
      }

      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[ica] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate ICA" });
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

  app.post("/api/kyc/:id/change-request", requireAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      if (kyc.status !== "approved") return res.status(400).json({ message: "Change requests can only be submitted for approved applications" });
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || kyc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only amend KYC applications you submitted" });
        }
      }
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
      notify({
        type: "kyc_change_request",
        title: "KYC change requested",
        message: `${kyc.companyName} requested changes to ${Object.keys(sanitized).length} field(s)`,
        link: "/kyc-admin",
        severity: "warning",
        module: "kyc",
      });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create change request" });
    }
  });

  app.patch("/api/kyc-change-requests/:id/status", requireAdminAuth, async (req, res) => {
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

  // ─── TEAM MEMBER SELF-VIEW ───
  async function getSessionTeamMemberId(req: Request): Promise<string | null> {
    if (!req.session?.authenticated || req.session.role !== "team" || !req.session.username) return null;
    const tm = await storage.getTeamMemberByUsername(req.session.username);
    return tm?.id ?? null;
  }

  async function getDocSubmittedByLabel(submittedByTeamMemberId: string | null | undefined): Promise<string | undefined> {
    if (!submittedByTeamMemberId) return undefined;
    try {
      const tm = await storage.getTeamMemberById(submittedByTeamMemberId);
      if (!tm) return `Team Member ID: ${submittedByTeamMemberId}`;
      return `${tm.name} (Team ID: ${tm.id})`;
    } catch {
      return `Team Member ID: ${submittedByTeamMemberId}`;
    }
  }

  app.get("/api/team/me/kyc", requireAuth, async (req: Request, res: Response) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const list = await storage.getKycApplicationsByTeamMemberId(tmId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/team/me/enquiries", requireAuth, async (req: Request, res: Response) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const list = await storage.getTradeEnquiriesByTeamMemberId(tmId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── POTENTIAL CLIENTS (team-member CRM) ───
  app.get("/api/team/me/potential-clients", requireAuth, async (req: Request, res: Response) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const list = await storage.getPotentialClientsByTeamMemberId(tmId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/team/me/potential-clients", requireAuth, async (req: Request, res: Response) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const data = insertPotentialClientSchema.parse(req.body);
      const created = await storage.createPotentialClient(tmId, data);
      res.json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/team/me/potential-clients/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const existing = await storage.getPotentialClientById(req.params.id);
      if (!existing || existing.teamMemberId !== tmId) return res.status(404).json({ message: "Not found" });
      const data = insertPotentialClientSchema.partial().parse(req.body);
      const updated = await storage.updatePotentialClient(req.params.id, data);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/team/me/potential-clients/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const existing = await storage.getPotentialClientById(req.params.id);
      if (!existing || existing.teamMemberId !== tmId) return res.status(404).json({ message: "Not found" });
      await storage.deletePotentialClient(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: see all potential clients across team
  app.get("/api/potential-clients", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const list = await storage.getPotentialClients();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── KYC APPLICATION PDF: download + send-to-client ───
  async function ensureKycAccess(req: Request, kyc: any): Promise<{ ok: boolean; message?: string; submittedBy?: string }> {
    if (!req.session?.authenticated) return { ok: false, message: "Not authenticated" };
    if (req.session.role === "admin") {
      const sb = await getDocSubmittedByLabel(kyc.submittedByTeamMemberId);
      return { ok: true, submittedBy: sb };
    }
    if (req.session.role === "team") {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId || kyc.submittedByTeamMemberId !== tmId) return { ok: false, message: "Not authorised for this KYC" };
      const sb = await getDocSubmittedByLabel(tmId);
      return { ok: true, submittedBy: sb };
    }
    return { ok: false, message: "Forbidden" };
  }

  app.get("/api/kyc/:id/pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const access = await ensureKycAccess(req, kyc);
      if (!access.ok) return res.status(403).json({ message: access.message });
      const docs = await storage.getKycDocumentsByApplicationId(kyc.id).catch(() => []);
      const pdfPath = await generateKycApplicationPdf(kyc, docs.map(d => ({ documentType: d.documentType, originalName: d.originalName })), access.submittedBy);
      const safeName = (kyc.companyName || "Bullex").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
      res.download(pdfPath, `KYC_Application_${safeName}.pdf`);
    } catch (error: any) {
      console.error("[kyc-pdf] failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate KYC PDF" });
    }
  });

  app.get("/api/kyc-form/blank-pdf", requireAuth, async (_req: Request, res: Response) => {
    try {
      const pdfPath = await generateBlankKycApplicationPdf();
      res.download(pdfPath, "Bullex_KYC_Application_Form.pdf");
    } catch (error: any) {
      console.error("[blank-kyc-pdf] failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate blank KYC form" });
    }
  });

  app.post("/api/kyc-form/send-blank-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const { recipientEmail, recipientName, ccEmail, message } = req.body || {};
      if (!recipientEmail || typeof recipientEmail !== "string" || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
        return res.status(400).json({ message: "Valid recipientEmail is required" });
      }
      if (recipientName && (typeof recipientName !== "string" || recipientName.length > 200)) return res.status(400).json({ message: "recipientName too long" });
      if (message && (typeof message !== "string" || message.length > 2000)) return res.status(400).json({ message: "message too long" });
      if (ccEmail && (typeof ccEmail !== "string" || !/^\S+@\S+\.\S+$/.test(ccEmail))) return res.status(400).json({ message: "Invalid ccEmail" });

      const pdfPath = await generateBlankKycApplicationPdf();
      const { sendBlankKycApplicationPdfEmail } = await import("./email");

      let senderName = "Bullex Admin";
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        const sb = await getDocSubmittedByLabel(tmId || undefined);
        senderName = sb?.split(" (")[0] || "Bullex Team";
      }

      const ok = await sendBlankKycApplicationPdfEmail(
        recipientEmail,
        recipientName || "Sir/Madam",
        pdfPath,
        senderName,
        typeof message === "string" ? message : undefined,
        ccEmail || undefined,
      );
      if (!ok) return res.status(500).json({ message: "Failed to send blank KYC form email" });
      res.json({ success: true, sentTo: recipientEmail });
    } catch (error: any) {
      console.error("[blank-kyc-pdf-send] failed:", error);
      res.status(500).json({ message: error.message || "Failed to send blank KYC form" });
    }
  });

  app.post("/api/kyc/:id/send-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const { recipientEmail, recipientName, ccEmail, message } = req.body || {};
      if (!recipientEmail || typeof recipientEmail !== "string" || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
        return res.status(400).json({ message: "Valid recipientEmail is required" });
      }
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const access = await ensureKycAccess(req, kyc);
      if (!access.ok) return res.status(403).json({ message: access.message });

      const docs = await storage.getKycDocumentsByApplicationId(kyc.id).catch(() => []);
      const pdfPath = await generateKycApplicationPdf(kyc, docs.map(d => ({ documentType: d.documentType, originalName: d.originalName })), access.submittedBy);

      const { sendKycApplicationPdfEmail } = await import("./email");
      const senderName = req.session?.role === "team" ? (access.submittedBy?.split(" (")[0] || "Bullex Team") : "Bullex Admin";
      const ok = await sendKycApplicationPdfEmail(
        recipientEmail,
        recipientName || "Sir/Madam",
        kyc.companyName,
        pdfPath,
        senderName,
        typeof message === "string" ? message : undefined,
        ccEmail && /^\S+@\S+\.\S+$/.test(ccEmail) ? ccEmail : undefined,
      );
      if (!ok) return res.status(500).json({ message: "Failed to send KYC PDF email" });
      res.json({ success: true, sentTo: recipientEmail });
    } catch (error: any) {
      console.error("[kyc-pdf-send] failed:", error);
      res.status(500).json({ message: error.message || "Failed to send KYC PDF" });
    }
  });

  // ─── ENQUIRY CHANGE REQUESTS ───
  const ALLOWED_ENQUIRY_CHANGE_FIELDS = new Set([
    "product", "specifications", "producer", "quantity", "unit",
    "loadingPort", "dischargePort", "incoterms", "validity", "additionalInfo",
    "origin", "deliveryPeriod", "price", "currency", "paymentTerms",
    "buyerName", "sellerName", "createdBy", "email",
  ]);

  app.get("/api/enquiry-change-requests", requireAuth, async (req, res) => {
    try {
      const all = await storage.getEnquiryChangeRequests();
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.json([]);
        const myEnq = await storage.getTradeEnquiriesByTeamMemberId(tmId);
        const myIds = new Set(myEnq.map(e => e.id));
        return res.json(all.filter(cr => myIds.has(cr.enquiryId)));
      }
      res.json(all);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-enquiries/:id/change-requests", requireAuth, async (req, res) => {
    try {
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || enquiry.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      res.json(await storage.getEnquiryChangeRequestsByEnquiryId(req.params.id));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-enquiries/:id/change-request", requireAuth, async (req, res) => {
    try {
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      // Team members may only request changes on their own enquiries; admins on any.
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || enquiry.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only amend your own enquiries" });
        }
      }
      const lockedStatuses = ["accepted", "closed", "quoted", "under_review"];
      if (!lockedStatuses.includes(enquiry.status)) {
        return res.status(400).json({ message: "Amendments only allowed on accepted/closed/quoted/under-review enquiries. Edit directly while still active." });
      }
      const { changedFields, reason } = req.body;
      if (!changedFields || typeof changedFields !== "object" || Object.keys(changedFields).length === 0) {
        return res.status(400).json({ message: "changedFields must be a non-empty object" });
      }
      const sanitized: Record<string, string> = {};
      for (const [key, val] of Object.entries(changedFields)) {
        if (ALLOWED_ENQUIRY_CHANGE_FIELDS.has(key) && typeof val === "string") sanitized[key] = val;
      }
      if (Object.keys(sanitized).length === 0) return res.status(400).json({ message: "No valid fields to change" });
      const created = await storage.createEnquiryChangeRequest({
        enquiryId: req.params.id,
        changedFields: sanitized,
        reason: reason || null,
      });
      notify({
        type: "enquiry_change_request",
        title: "Enquiry change requested",
        message: `Amendment requested on enquiry ${enquiry.enquiryRef}`,
        link: "/trade-enquiries",
        severity: "warning",
        module: "enquiries",
      });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/enquiry-change-requests/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status must be approved or rejected" });
      }
      if (status === "approved") {
        // Pre-compute block (no DB writes) so amendment + block can be persisted atomically.
        const allReqs = await storage.getEnquiryChangeRequests();
        const pendingReq = allReqs.find((c) => c.id === req.params.id);
        if (!pendingReq) return res.status(404).json({ message: "Change request not found" });
        if (pendingReq.status !== "pending") return res.status(400).json({ message: "Change request is no longer pending" });
        const targetEnquiry = await storage.getTradeEnquiryById(pendingReq.enquiryId);
        if (!targetEnquiry) return res.status(404).json({ message: "Enquiry not found" });

        const changedFields = (pendingReq.changedFields || {}) as Record<string, any>;
        const latestBlock = await storage.getLatestBlock();
        const previousHash = latestBlock?.hash || GENESIS_HASH;
        const blockNumber = (latestBlock?.blockNumber || 0) + 1;
        const timestampIso = new Date().toISOString();
        const amendmentHash = generateKycAmendmentHash(
          targetEnquiry.enquiryRef,
          targetEnquiry.product,
          changedFields,
          timestampIso,
        );
        const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
        const fieldNames = Object.keys(changedFields).map((k) => k.replace(/([A-Z])/g, " $1").trim()).join(", ");

        const updated = await storage.approveAndApplyEnquiryChangeRequest(req.params.id, adminNotes, {
          blockNumber,
          hash: blockHash,
          previousHash,
          nonce,
          timestamp: new Date(timestampIso),
          dataId: targetEnquiry.id,
          dataSummary: `${targetEnquiry.enquiryRef} | Amendment: ${fieldNames}`,
        });
        console.log(`[blockchain] Enquiry amendment block minted for ${updated.enquiryRef}, block #${blockNumber}`);
        res.json({ status: "approved", enquiry: updated });
      } else {
        const updated = await storage.updateEnquiryChangeRequestStatus(req.params.id, status, adminNotes);
        res.json(updated);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/enquiry/send-onboarding-link", requireAuth, async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ message: "Valid email is required." });
      }
      const enquiryUrl = `${req.protocol}://${req.get("host")}/enquiry-register`;
      let senderName: string | undefined;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        const sb = await getDocSubmittedByLabel(tmId || undefined);
        senderName = sb?.split(" (")[0];
      } else if (req.session?.role === "admin") {
        senderName = "Bullex Admin";
      }
      const { sendEnquiryOnboardingInviteEmail } = await import("./email");
      const sent = await sendEnquiryOnboardingInviteEmail(email, enquiryUrl, senderName);
      if (!sent) return res.status(500).json({ message: "Failed to send invitation email." });
      res.json({ success: true, message: `Invitation sent to ${email}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error." });
    }
  });

  app.post("/api/public/trade-enquiries", async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      if (!b.product || typeof b.product !== "string" || !b.product.trim()) {
        return res.status(400).json({ message: "Product is required" });
      }
      if (!b.email || typeof b.email !== "string" || !/^\S+@\S+\.\S+$/.test(b.email)) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      if (!b.createdBy || typeof b.createdBy !== "string" || !b.createdBy.trim()) {
        return res.status(400).json({ message: "Your name / company is required" });
      }
      const str = (v: any, max = 1000) => (typeof v === "string" && v.trim()) ? v.trim().slice(0, max) : null;
      const side = b.side === "sell" ? "sell" : "buy";
      const enquiry = await storage.createTradeEnquiry({
        product: b.product.trim().slice(0, 200),
        side,
        specifications: str(b.specifications, 2000),
        producer: str(b.producer, 200),
        quantity: str(b.quantity, 100),
        unit: str(b.unit, 20) || "MT",
        loadingPort: str(b.loadingPort, 200),
        incoterms: str(b.incoterms, 50),
        validity: str(b.validity, 200),
        additionalInfo: str(b.additionalInfo, 2000),
        createdBy: b.createdBy.trim().slice(0, 200),
        email: b.email.trim(),
        submittedByTeamMemberId: null,
      });
      sendEnquiryCreatedNotification(enquiry).catch(() => {});
      notify({
        type: "enquiry_created",
        title: "New trade enquiry",
        message: `${enquiry.createdBy || "Client"} — ${enquiry.product} (${enquiry.enquiryRef})`,
        link: "/trade-enquiries",
        severity: "info",
        module: "enquiries",
      });
      res.json({ success: true, enquiryRef: enquiry.enquiryRef });
    } catch (error: any) {
      console.error("[public-enquiry] failed:", error);
      res.status(500).json({ message: error.message || "Failed to submit enquiry" });
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
      const data: any = { ...parsed.data };
      // All KYC fields are optional — coerce missing/null values for text columns to
      // empty strings so NOT NULL text columns accept the row when the applicant skips them.
      // Skip non-text columns (timestamp, jsonb, integer, etc.) which cannot accept "".
      const cols: any = getTableColumns(kycApplications);
      for (const k of Object.keys(cols)) {
        const col = cols[k];
        if (!col?.notNull || col?.hasDefault) continue;
        const sqlType = typeof col?.getSQLType === "function" ? col.getSQLType() : "";
        const isText = sqlType === "text" || /^varchar/.test(sqlType);
        if (!isText) continue;
        if (data[k] === undefined || data[k] === null) data[k] = "";
      }
      // Always strip caller-supplied attribution; only the server may set it.
      delete data.submittedByTeamMemberId;
      if (req.session?.authenticated && req.session.role === "team" && req.session.username) {
        const tm = await storage.getTeamMemberByUsername(req.session.username);
        if (tm) data.submittedByTeamMemberId = tm.id;
      }
      const result = await storage.createKycApplication(data);

      // Link any documents that were uploaded during the public registration flow.
      // documentIds is an optional array of KYC document IDs to associate with this application.
      const documentIds = Array.isArray(req.body.documentIds) ? req.body.documentIds : [];
      if (documentIds.length > 0) {
        await storage.linkKycDocumentsToApplication(result.id, documentIds);
      }

      // Mandatory sanctions / PEP screening for every KYC application.
      // Runs in background so it doesn't delay the response or block submission on Yahoo/OpenSanctions latency.
      runSanctionsScreening(result.id, "system:auto")
        .catch((err) => console.error("[aml] auto-screening failed:", err?.message));

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

      notify({
        type: "kyc_submitted",
        title: "New KYC submission",
        message: `${parsed.data.companyName} submitted a KYC application`,
        link: "/kyc-admin",
        severity: "info",
        module: "kyc",
      });

      res.json(sanitizeKyc(result));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create KYC application" });
    }
  });

  app.get("/api/trades", requireAuth, async (_req, res) => {
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

  app.get("/api/documents", requireAuth, async (req, res) => {
    try {
      console.log(`[GET /api/documents] role=${req.session?.role} username=${req.session?.username}`);
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        console.log(`[GET /api/documents] team tmId=${tmId}`);
        if (!tmId) return res.json([]);
        const docs = await storage.getDocumentsByTeamMemberId(tmId);
        console.log(`[GET /api/documents] returning ${docs.length} docs for team member ${tmId}`);
        return res.json(docs);
      }
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

      // Team-member gating: must own the linked enquiry, and the enquiry must be admin-accepted.
      let submittedByTeamMemberId: string | null = null;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.status(403).json({ message: "Team member not found" });
        if (!enquiryRef) {
          return res.status(400).json({ message: "Team members must link the document to one of their accepted enquiries (enquiryRef required)" });
        }
        const allEnq = await storage.getTradeEnquiriesByTeamMemberId(tmId);
        const ownedEnq = allEnq.find(e => e.enquiryRef === enquiryRef);
        if (!ownedEnq) {
          return res.status(403).json({ message: "You can only create documents for enquiries you submitted" });
        }
        if (ownedEnq.status !== "accepted") {
          return res.status(400).json({ message: `Documents can only be created for accepted enquiries (current status: ${ownedEnq.status})` });
        }
        submittedByTeamMemberId = tmId;
      } else if (enquiryRef) {
        // Admin creating a doc against a team-member's enquiry — auto-attribute to the enquiry's owner
        // so that team member can see it in their list.
        try {
          const allEnquiries = await storage.getTradeEnquiries();
          const matched = allEnquiries.find(e => e.enquiryRef === enquiryRef);
          if (matched?.submittedByTeamMemberId) {
            submittedByTeamMemberId = matched.submittedByTeamMemberId;
          }
        } catch (e) {
          console.error("[docs] Failed to resolve enquiry owner for attribution:", e);
        }
      }

      const content = generateDocumentContent(parsed.data.docType, trade, buyerDetails, sellerDetails, { ...productDetails, loiIssueNumber: issueNumber, dealRecapNumber: dealRecapNumber || undefined });
      const adminChecks = buildAdminChecks(parsed.data.docType);
      const buyerEmailExtracted = buyerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null;
      const sellerEmailExtracted = sellerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null;
      const resolvedAgentCode = await resolveAgentCode({
        buyerEmail: buyerEmailExtracted,
        sellerEmail: sellerEmailExtracted,
        sentToClientId: (parsed.data as any).sentToClientId || null,
        submittedByTeamMemberId,
      });
      const result = await storage.createDocument({
        ...parsed.data,
        content,
        status: "pending_review",
        adminChecks,
        issueNumber,
        dealRecapNumber,
        enquiryRef,
        submittedByTeamMemberId,
        agentCode: resolvedAgentCode,
        buyerEmail: buyerEmailExtracted,
        sellerEmail: sellerEmailExtracted,
      } as any);

      try {
        const isLoi = parsed.data.docType === "LOI";
        const submittedByLabel = await getDocSubmittedByLabel(submittedByTeamMemberId);
        const docxPath = await generateDocx(result.id, result.title, content, submittedByLabel, resolvedAgentCode || undefined);
        let pdfPath: string | undefined;
        if (!isLoi) {
          pdfPath = await generatePdf(result.id, result.title, content, submittedByLabel, resolvedAgentCode || undefined);
        }
        const updated = await storage.updateDocument(result.id, { docxPath, ...(pdfPath ? { pdfPath } : {}) });

        const buyerEmail = buyerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        const sellerEmail = sellerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        const buyerName = buyerDetails?.name || "Buyer";
        const sellerName = sellerDetails?.name || "Seller";

        // Do NOT auto-email buyer/seller on creation — documents must pass admin review first.
        // Sending happens explicitly via POST /api/documents/:id/send after approval + signature.
        void pdfPath; void buyerEmail; void sellerEmail; void buyerName; void sellerName;

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
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        const doc = await storage.getDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ message: "Document not found" });
        if (!tmId || doc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "Forbidden" });
        }
        return res.json(doc);
      }
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
      // Team members may only edit their own docs and may NOT mutate status (admin-review controls workflow).
      const isTeam = req.session?.role === "team";
      if (isTeam) {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || doc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only edit documents you created" });
        }
        if (doc.status === "pending_review") {
          return res.status(400).json({ message: "Document is awaiting admin approval and cannot be edited" });
        }
      }
      const allowedStatuses = ["draft", "review", "final"];
      const { title, content, status } = req.body;
      const updateData: Record<string, any> = {};
      if (typeof title === "string" && title.trim()) updateData.title = title.trim();
      if (typeof content === "string") updateData.content = content;
      if (!isTeam && typeof status === "string" && allowedStatuses.includes(status)) updateData.status = status;
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
      const hasSigDocx = doc.docType === "NCNDA" ? (doc.sellerSignature || doc.buyerSignature) : doc.buyerSignature;
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      const submittedByLabel = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
      if (hasSigDocx) {
        const result = await regenerateWithSignatures(
          doc.id, doc.title, doc.content,
          doc.buyerSignature || undefined, doc.sellerSignature || undefined,
          doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
          doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
          doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
          doc.docType,
          submittedByLabel,
          doc.buyerSignedIp || undefined,
          doc.sellerSignedIp || undefined,
          (doc as any).agentCode || undefined,
        );
        const filePath = getDocFilePath(result.docxPath);
        if (!filePath) return res.status(500).json({ message: "Failed to generate DOCX file" });
        res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.docx"`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        return res.sendFile(filePath);
      }
      const docxPath = await generateDocx(doc.id, doc.title, doc.content, submittedByLabel, (doc as any).agentCode || undefined);
      await storage.updateDocument(doc.id, { docxPath });
      const filePath = getDocFilePath(docxPath);
      if (!filePath) return res.status(500).json({ message: "Failed to generate DOCX file" });
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
      const hasSigPdf = doc.docType === "NCNDA" ? (doc.sellerSignature || doc.buyerSignature) : doc.buyerSignature;
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      const submittedByLabelPdf = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
      if (hasSigPdf) {
        const result = await regenerateWithSignatures(
          doc.id, doc.title, doc.content,
          doc.buyerSignature || undefined, doc.sellerSignature || undefined,
          doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
          doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
          doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
          doc.docType,
          submittedByLabelPdf,
          doc.buyerSignedIp || undefined,
          doc.sellerSignedIp || undefined,
          (doc as any).agentCode || undefined,
        );
        const filePath = getDocFilePath(result.pdfPath);
        if (!filePath) return res.status(500).json({ message: "Failed to generate PDF file" });
        res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.pdf"`);
        res.setHeader("Content-Type", "application/pdf");
        return res.sendFile(filePath);
      }
      const pdfPath = await generatePdf(doc.id, doc.title, doc.content, submittedByLabelPdf, (doc as any).agentCode || undefined);
      await storage.updateDocument(doc.id, { pdfPath });
      const filePath = getDocFilePath(pdfPath);
      if (!filePath) return res.status(500).json({ message: "Failed to generate PDF file" });
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
      const hasSigConvert = doc.docType === "NCNDA" ? (doc.sellerSignature || doc.buyerSignature) : doc.buyerSignature;
      if (!hasSigConvert) return res.status(400).json({ message: "Document must be signed before converting to PDF" });

      const submittedByLabelConv = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
      const result = await regenerateWithSignatures(
        doc.id, doc.title, doc.content,
        doc.buyerSignature || undefined, doc.sellerSignature || undefined,
        doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
        doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
        doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
        doc.docType,
        submittedByLabelConv,
        doc.buyerSignedIp || undefined,
        doc.sellerSignedIp || undefined,
        (doc as any).agentCode || undefined,
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

  app.patch("/api/documents/:id/admin-review", requireAdminAuth, async (req: Request, res: Response) => {
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
      const fwd = (req.headers["x-forwarded-for"] as string | undefined) || "";
      const clientIp = (fwd.split(",")[0] || "").trim() || req.ip || (req.socket?.remoteAddress ?? "") || "unknown";
      const updateData: Record<string, any> = {};
      if (party === "buyer") {
        updateData.buyerSignature = signature;
        updateData.buyerSignedAt = now;
        updateData.buyerSignedName = name.trim();
        updateData.buyerSignedIp = clientIp;
      } else {
        updateData.sellerSignature = signature;
        updateData.sellerSignedAt = now;
        updateData.sellerSignedName = name.trim();
        updateData.sellerSignedIp = clientIp;
      }
      const updated = await storage.updateDocument(req.params.id, updateData);

      if (updated.content) {
        try {
          const { regenerateWithSignatures } = await import("./documentFileGenerator");
          const submittedByLabelSign = await getDocSubmittedByLabel(updated.submittedByTeamMemberId);
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
            updated.docType,
            submittedByLabelSign,
            updated.buyerSignedIp || undefined,
            updated.sellerSignedIp || undefined,
            (updated as any).agentCode || undefined,
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
        updateData.buyerSignedIp = null;
      } else {
        updateData.sellerSignature = null;
        updateData.sellerSignedAt = null;
        updateData.sellerSignedName = null;
        updateData.sellerSignedIp = null;
      }
      const updated = await storage.updateDocument(req.params.id, updateData);

      if (updated.content) {
        try {
          const { regenerateWithSignatures } = await import("./documentFileGenerator");
          const submittedByLabelUnsign = await getDocSubmittedByLabel(updated.submittedByTeamMemberId);
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
            updated.docType,
            submittedByLabelUnsign,
            updated.buyerSignedIp || undefined,
            updated.sellerSignedIp || undefined,
            (updated as any).agentCode || undefined,
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

      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || doc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only send documents you created" });
        }
      }

      const isTeamCaller = req.session?.role === "team";
      const allowedSendStatuses = isTeamCaller ? ["draft", "final"] : ["draft", "final", "rejected"];
      if (!allowedSendStatuses.includes(doc.status)) {
        return res.status(400).json({ message: `Cannot send document in '${doc.status}' state. Must be admin-approved before sending.` });
      }

      const isNcnda = doc.docType === "NCNDA";
      const hasSig = isNcnda ? (doc.sellerSignature || doc.buyerSignature) : doc.buyerSignature;
      if (!hasSig) {
        return res.status(400).json({ message: isNcnda ? "NCNDA must be signed by Party A (Issuer) before sending" : "Document must be signed before sending" });
      }

      const { recipientEmail, clientId, ccEmail } = req.body;
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
        const recipientRole = isNcnda ? "Party B" : "Buyer" as any;
        const sendWithAttachment = async () => {
          try {
            const { regenerateWithSignatures } = await import("./documentFileGenerator");
            const submittedByLabelSend = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
            // If sentToClientId is set and doc has no agentCode yet, resolve now.
            let effectiveAgentCode = (doc as any).agentCode || null;
            if (!effectiveAgentCode) {
              effectiveAgentCode = await resolveAgentCode({
                buyerEmail: doc.buyerEmail,
                sellerEmail: doc.sellerEmail,
                sentToClientId: clientId || (doc as any).sentToClientId || null,
                submittedByTeamMemberId: doc.submittedByTeamMemberId || null,
              });
              if (effectiveAgentCode) {
                await storage.updateDocument(doc.id, { agentCode: effectiveAgentCode } as any);
              }
            }
            const fresh = await regenerateWithSignatures(
              doc.id, doc.title, doc.content!,
              doc.buyerSignature || undefined, doc.sellerSignature || undefined,
              doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
              doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
              doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
              doc.docType,
              submittedByLabelSend,
              doc.buyerSignedIp || undefined,
              doc.sellerSignedIp || undefined,
              effectiveAgentCode || undefined,
            );
            await storage.updateDocument(doc.id, { pdfPath: fresh.pdfPath, docxPath: fresh.docxPath });
            await sendDocumentEmail(recipientEmail, isNcnda ? "Party B" : "Recipient", doc.docType, doc.title, recipientRole, fresh.pdfPath, ccEmail || undefined);
          } catch (err: any) {
            console.error("[docs] Failed to email recipient:", err.message);
          }
        };
        sendWithAttachment();
        sendSignaturePendingEmail(recipientEmail, isNcnda ? "Party B (Receiving Party)" : "Recipient", doc.docType, doc.title)
          .catch(err => console.error("[docs] Failed to send signature pending email:", err));
      }

      notify({
        type: "document_sent",
        title: `${doc.docType} sent for review`,
        message: `${doc.title} sent to ${recipientEmail}`,
        link: "/documents",
        severity: "info",
        module: "documents",
      });

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

      notify({
        type: response === "accepted" ? "document_accepted" : "document_rejected",
        title: response === "accepted" ? `${doc.docType} accepted` : `${doc.docType} amendment requested`,
        message: response === "accepted"
          ? `${doc.title} was accepted`
          : `Amendment requested on ${doc.title}`,
        link: "/documents",
        severity: response === "accepted" ? "success" : "warning",
        module: "documents",
      });

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
      const productDetails = { commodity, origin, quantity, incoterm, price, paymentTerms, qualitySpecs, currency: "USD", dealRecapNumber: dealRecapNumber || undefined };

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
        submittedByTeamMemberId: parentDoc.submittedByTeamMemberId || null,
      });

      try {
        const submittedByLabelNext = await getDocSubmittedByLabel(result.submittedByTeamMemberId);
        const nextAgentCode = (parentDoc as any).agentCode || await resolveAgentCode({
          buyerEmail: result.buyerEmail,
          sellerEmail: result.sellerEmail,
          sentToClientId: null,
          submittedByTeamMemberId: result.submittedByTeamMemberId || null,
        });
        if (nextAgentCode) {
          await storage.updateDocument(result.id, { agentCode: nextAgentCode } as any);
        }
        const docxPath = await generateDocx(result.id, result.title, result.content || "", submittedByLabelNext, nextAgentCode || undefined);
        let pdfPath: string | undefined;
        if (nextDocType !== "LOI") {
          pdfPath = await generatePdf(result.id, result.title, result.content || "", submittedByLabelNext, nextAgentCode || undefined);
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

  app.get("/api/kyc-documents", requireAuth, async (req, res) => {
    try {
      const { documentType } = req.query;
      const result = await storage.getKycDocuments(documentType as string | undefined);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC documents" });
    }
  });

  app.get("/api/kyc/:id/documents", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getKycDocumentsByApplicationId(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC application documents" });
    }
  });

  app.patch("/api/kyc/:id/link-documents", requireAuth, async (req, res) => {
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

  app.post("/api/kyc-documents/upload", (req, res, next) => {
    kycUpload.single("file")(req, res, (err: any) => {
      if (err) {
        if (handleMulterError(err, res)) return;
        return res.status(400).json({ message: err.message || "File upload error" });
      }
      next();
    });
  }, async (req, res) => {
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
      // Uploading directly to an existing application requires authentication.
      // Unauthenticated callers (public KYC registration) must leave kycApplicationId empty;
      // documents are linked to the newly-created application server-side on submission.
      if (kycApplicationId && !(req.session?.authenticated)) {
        fs.unlinkSync(file.path);
        return res.status(401).json({ message: "Unauthorized" });
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

  app.get("/api/kyc-documents/:id/download", requireAuth, async (req, res) => {
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

  app.get("/api/trade-documents", requireAuth, async (_req, res) => {
    try {
      const result = await storage.getAllTradeDocuments();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trade documents" });
    }
  });

  app.get("/api/trades/:tradeId/files", requireAuth, async (req, res) => {
    try {
      const result = await storage.getTradeDocuments(req.params.tradeId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trade documents" });
    }
  });

  app.post("/api/trades/:tradeId/files/upload", requireAuth, tradeUpload.single("file"), async (req, res) => {
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

  app.get("/api/trade-documents/:id/view", requireAuth, async (req, res) => {
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

  app.get("/api/trade-documents/:id/download", requireAuth, async (req, res) => {
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

  app.delete("/api/trade-documents/:id", requireAuth, async (req, res) => {
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
  app.get("/api/trade-enquiries", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.json([]);
        return res.json(await storage.getTradeEnquiriesByTeamMemberId(tmId));
      }
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
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || enquiry.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
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
      // Server-controlled attribution only — ignore any caller-supplied submittedByTeamMemberId.
      let submittedByTeamMemberId: string | null = null;
      if (req.session?.authenticated && req.session.role === "team" && req.session.username) {
        const tm = await storage.getTeamMemberByUsername(req.session.username);
        if (tm) submittedByTeamMemberId = tm.id;
      }
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
        submittedByTeamMemberId,
      });
      sendEnquiryCreatedNotification(enquiry).catch(() => {});
      notify({
        type: "enquiry_created",
        title: "New trade enquiry",
        message: `${enquiry.createdBy || "Team"} — ${enquiry.product} (${enquiry.enquiryRef})`,
        link: "/trade-enquiries",
        severity: "info",
        module: "enquiries",
      });
      res.json(enquiry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trade-enquiries/:id/status", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const valid = ["active", "closed", "accepted", "rejected"];
      if (!valid.includes(status)) return res.status(400).json({ message: "Invalid status" });
      const existing = await storage.getTradeEnquiryById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Enquiry not found" });
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
          const buyerName = existing.buyerName || (isBuyer ? (existing.createdBy || "TBD") : "TBD");
          const sellerName = existing.sellerName || (!isBuyer ? (existing.createdBy || "TBD") : "Bullfrog Group");
          // parse numeric price from enquiry price string e.g. "850" or "850 USD/MT"
          const parsedPrice = parseFloat((existing.price || "0").replace(/[^\d.]/g, "")) || 0;
          const qty = parseFloat(existing.quantity || "0") || 0;

          const trade = await storage.createPreDealTrade({
            commodity: existing.product,
            commodityCategory,
            quantity: qty,
            unit: existing.unit || "MT",
            pricePerUnit: parsedPrice,
            totalValue: parsedPrice * qty,
            currency: existing.currency || "USD",
            buyerName,
            sellerName,
            origin: existing.origin || existing.loadingPort || "TBD",
            destination: existing.dischargePort || "TBD",
            incoterm: existing.incoterms || "FOB",
            enquiryRef: existing.enquiryRef,
            specifications: existing.specifications || "",
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
          const updated = await storage.updateTradeEnquiryStatus(req.params.id, status, trade.tradeRef);
          sendEnquiryStatusNotification(existing, status).catch(() => {});
          return res.json({ ...updated, createdTradeRef: trade.tradeRef });
        } catch (err: any) {
          console.error("[trade] Auto-create trade failed:", err.message);
        }
      }

      const updated = await storage.updateTradeEnquiryStatus(req.params.id, status);
      sendEnquiryStatusNotification(existing, status).catch(() => {});
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Verify the current session owns this enquiry. Admins always pass; team members
  // must be the original submitter. Returns the enquiry on success, or sends an error
  // response and returns null on failure (in which case the caller should return).
  async function ensureEnquiryAccess(req: Request, res: Response, enquiryId: string) {
    const enquiry = await storage.getTradeEnquiryById(enquiryId);
    if (!enquiry) { res.status(404).json({ message: "Enquiry not found" }); return null; }
    if (req.session?.role === "team") {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId || enquiry.submittedByTeamMemberId !== tmId) {
        res.status(403).json({ message: "Forbidden" });
        return null;
      }
    }
    return enquiry;
  }

  app.delete("/api/trade-enquiries/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const existing = await ensureEnquiryAccess(req, res, req.params.id);
      if (!existing) return;
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
      const enquiry = await ensureEnquiryAccess(req, res, req.params.id);
      if (!enquiry) return;
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
      const enquiry = await ensureEnquiryAccess(req, res, req.params.id);
      if (!enquiry) {
        const fp = path.join(enquiryUploadsDir, file.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        return;
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
      const enquiry = await ensureEnquiryAccess(req, res, doc.enquiryId);
      if (!enquiry) return;
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
      const doc = await storage.getTradeEnquiryDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const enquiry = await ensureEnquiryAccess(req, res, doc.enquiryId);
      if (!enquiry) return;
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
      notify({
        type: "registration",
        title: "New registration",
        message: `${reg.fullName} (${reg.companyName}) — ${reg.roleType}`,
        link: "/registrations",
        severity: "info",
        module: "registrations",
      });
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

  // ── Team Task Board ───────────────────────────────────────────────────────────
  app.get("/api/tasks", requireAuth, async (_req, res) => {
    try {
      const tasks = await storage.getTeamTasks();
      res.json(tasks);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    try {
      const { title, description, priority, status, assignee, dueDate, createdBy } = req.body;
      if (!title) return res.status(400).json({ message: "Title is required" });
      const task = await storage.createTeamTask({ title, description, priority: priority || "medium", status: status || "todo", assignee, dueDate, createdBy });
      notify({
        type: "task_created",
        title: "New task",
        message: `${title}${assignee ? ` — assigned to ${assignee}` : ""}`,
        link: "/tasks",
        severity: priority === "high" ? "warning" : "info",
        module: "tasks",
      });
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const prev = await storage.getTeamTaskById(req.params.id);
      const task = await storage.updateTeamTask(req.params.id, req.body);
      if (prev && req.body?.status && prev.status !== task.status) {
        notify({
          type: "task_status",
          title: `Task ${task.status === "done" ? "completed" : "moved to " + task.status}`,
          message: `${task.title}${task.assignee ? ` — ${task.assignee}` : ""}`,
          link: "/tasks",
          severity: task.status === "done" ? "success" : "info",
          module: "tasks",
        });
      }
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteTeamTask(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tasks/:id/updates", requireAuth, async (req, res) => {
    try {
      const updates = await storage.getTaskUpdates(req.params.id);
      res.json(updates);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tasks/:id/updates", requireAuth, async (req, res) => {
    try {
      const { author, text } = req.body;
      if (!text) return res.status(400).json({ message: "Text is required" });
      const update = await storage.createTaskUpdate({ taskId: req.params.id, author: author || "Admin", text });
      const task = await storage.getTeamTaskById(req.params.id);
      notify({
        type: "task_update",
        title: `Task update: ${task?.title || "Task"}`,
        message: `${author || "Admin"}: ${text.slice(0, 140)}`,
        link: "/tasks",
        severity: "info",
        module: "tasks",
      });
      res.json(update);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Daily Reports ────────────────────────────────────────────────────────────
  app.get("/api/daily-reports", requireAuth, async (req: Request, res: Response) => {
    try {
      const { date, teamMemberId } = req.query as { date?: string; teamMemberId?: string };
      const filters: { date?: string; teamMemberId?: string } = {};
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) filters.date = date;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.status(403).json({ message: "Team-member only" });
        filters.teamMemberId = tmId;
      } else if (teamMemberId) {
        filters.teamMemberId = teamMemberId;
      }
      const reports = await storage.getDailyReports(filters);
      res.json(reports);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/daily-reports", requireAuth, async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      if (!b.summary || typeof b.summary !== "string" || !b.summary.trim()) {
        return res.status(400).json({ message: "Summary is required" });
      }
      const today = new Date().toISOString().slice(0, 10);
      const reportDate = (typeof b.reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.reportDate)) ? b.reportDate : today;
      let teamMemberId: string;
      let teamMemberName: string;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.status(403).json({ message: "Team member not found" });
        const tm = await storage.getTeamMemberById(tmId);
        teamMemberId = tmId;
        teamMemberName = tm?.name || req.session.username || "Team Member";
      } else {
        teamMemberId = "admin";
        teamMemberName = "Admin";
      }
      const str = (v: any, max = 2000) => (typeof v === "string" && v.trim()) ? v.trim().slice(0, max) : null;
      const created = await storage.createDailyReport({
        teamMemberId,
        teamMemberName,
        reportDate,
        hoursWorked: str(b.hoursWorked, 20),
        summary: b.summary.trim().slice(0, 4000),
        tasksCompleted: str(b.tasksCompleted, 4000),
        blockers: str(b.blockers, 2000),
        nextSteps: str(b.nextSteps, 2000),
      });
      notify({
        type: "daily_report",
        title: `Daily report — ${teamMemberName}`,
        message: `${reportDate}: ${b.summary.trim().slice(0, 160)}`,
        link: "/tasks",
        severity: b.blockers ? "warning" : "info",
        module: "tasks",
      });
      res.json(created);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/daily-reports/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteDailyReport(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/kyc/:id", requireAdminAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      await storage.deleteKycApplication(req.params.id);
      notify({
        type: "kyc_deleted",
        title: "KYC application deleted",
        message: `${kyc.companyName} (status: ${kyc.status}) was removed by admin`,
        link: "/kyc-admin",
        severity: "warning",
        module: "kyc",
      });
      res.json({ success: true });
    } catch (e: any) {
      console.error("[kyc] delete failed:", e);
      res.status(500).json({ message: e.message || "Failed to delete KYC application" });
    }
  });

  // ── Notifications (admin-only inbox) ─────────────────────────────────────────
  app.get("/api/notifications", requireAdminAuth, async (_req, res) => {
    try {
      const rows = await storage.getNotifications(100);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      if (req.session?.role !== "admin") return res.json({ count: 0 });
      const count = await storage.getUnreadNotificationCount();
      res.json({ count });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAdminAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/notifications/read-all", requireAdminAuth, async (_req, res) => {
    try {
      await storage.markAllNotificationsRead();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/notifications/:id", requireAdminAuth, async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── OneDrive Database Backup ─────────────────────────────────────────────────
  app.post("/api/backup/run", requireAdminAuth, async (_req, res) => {
    try {
      const { runBackup } = await import("./onedrive-backup");
      const result = await runBackup();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Backup failed" });
    }
  });

  app.get("/api/backup/list", requireAdminAuth, async (_req, res) => {
    try {
      const { listBackups } = await import("./onedrive-backup");
      const files = await listBackups();
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to list backups" });
    }
  });

  return httpServer;
}
