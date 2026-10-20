import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import fs from "fs";
import path from "path";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", (_req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    const indexPath = path.resolve(__dirname, "public", "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  next();
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Redact bearer-style secrets and credentials before logging so that
        // reset tokens, raw passwords, and similar sensitive values are never
        // written to application logs or console output.
        const REDACTED_KEYS = new Set([
          "resetUrl", "token", "password", "clientPassword",
          "resetToken", "setupToken", "secret",
        ]);
        const sanitized = JSON.stringify(capturedJsonResponse, (key, value) =>
          REDACTED_KEYS.has(key) ? "[REDACTED]" : value
        );
        logLine += ` :: ${sanitized}`;
      }

      log(logLine);
    }
  });

  next();
});

// One-time data maintenance that runs once the server is already accepting
// connections. These routines touch the database, so they must NOT block the
// initial port bind — otherwise a slow database during a deploy promote would
// stall the health-check probe and fail the deployment.
async function runStartupMaintenance() {
  // Backfill participant IDs for any pre-existing approved KYC clients / team members.
  try {
    const { storage } = await import("./storage");
    const result = await storage.backfillParticipantIds();
    if (result.kyc || result.team) {
      log(`[participant-id] backfilled ${result.kyc} client(s), ${result.team} team member(s)`);
    }
  } catch (e: any) {
    console.error("[participant-id] backfill failed:", e?.message || e);
  }

  // Backfill Banking-module bank accounts from pre-existing approved KYC
  // applications (new approvals sync automatically; this covers older ones).
  try {
    const { backfillBankAccountsFromApprovedKyc } = await import("./bank-sync");
    const created = await backfillBankAccountsFromApprovedKyc();
    if (created) {
      log(`[bank-accounts] backfilled ${created} account(s) from approved KYC`);
    }
  } catch (e: any) {
    console.error("[bank-accounts] backfill from approved KYC failed:", e?.message || e);
  }

  // Migrate any plaintext passwords stored before bcrypt was introduced.
  try {
    const { storage } = await import("./storage");
    const migrated = await storage.migratePasswordsToHashed();
    if (migrated.teamMembers || migrated.kycClients) {
      log(`[password-migration] hashed ${migrated.teamMembers} team member(s), ${migrated.kycClients} client(s)`);
    }
  } catch (e: any) {
    console.error("[password-migration] failed:", e?.message || e);
  }

  // Surface any pre-existing enquiries with a blank/missing commodity. New ones
  // are now blocked at the source, but legacy rows would silently never match —
  // warn so an admin can correct them.
  try {
    const { storage } = await import("./storage");
    const enquiries = await storage.getTradeEnquiries();
    const blank = enquiries.filter((e) => !e.product || !e.product.trim());
    if (blank.length > 0) {
      console.warn(
        `[enquiry-data] ${blank.length} enquiry(ies) have a blank commodity and will never match — correct: ${blank.map((e) => e.enquiryRef).join(", ")}`,
      );
    }
  } catch (e: any) {
    console.error("[enquiry-data] blank-commodity scan failed:", e?.message || e);
  }

  // Prune the generated_docs/ file cache (age + size budget) so it can never
  // again grow until the workspace snapshot is too large to publish. Downloads
  // regenerate pruned files on demand from the document content in the DB.
  try {
    const { pruneGeneratedDocsCache } = await import("./documentFileGenerator");
    const runPrune = () => {
      const { deleted, freedBytes } = pruneGeneratedDocsCache();
      if (deleted > 0) {
        log(`[docs-cache] pruned ${deleted} cached file(s), freed ${(freedBytes / (1024 * 1024)).toFixed(1)} MB`);
      }
    };
    runPrune();
    const timer = setInterval(runPrune, 24 * 60 * 60 * 1000); // daily
    timer.unref(); // never keep the process alive just for pruning
  } catch (e: any) {
    console.error("[docs-cache] prune setup failed:", e?.message || e);
  }

  // One-time backfill: flag legacy hand-edited TFRs (edited before the
  // contentManuallyEdited flag existed) so a details save still requires the
  // rebuild confirmation instead of silently discarding their manual edits.
  try {
    const { backfillTfrManualEditFlags } = await import("./routes");
    const result = await backfillTfrManualEditFlags();
    if (!result.skipped) {
      log(`[tfr-backfill] checked ${result.checked} editable TFR(s), flagged ${result.flagged} as manually edited`);
    }
  } catch (e: any) {
    console.error("[tfr-backfill] legacy manual-edit backfill failed:", e?.message || e);
  }

  // Associate historical trade blocks with their logical commodity parents.
  // This is data-only and idempotent: no block number, hash, predecessor, proof,
  // or mined payload is modified.
  try {
    const { storage } = await import("./storage");
    const result = await storage.backfillProductDealBlocks();
    if (result.linksCreated || result.parentsCreated) {
      log(
        `[product-blocks] linked ${result.linksCreated} historical deal block(s) under ${result.parentsCreated} new commodity parent(s)`,
      );
    }
  } catch (e: any) {
    console.error("[product-blocks] historical association backfill failed:", e?.message || e);
  }

  // Start the live AIS vessel-position feed (inert without AISSTREAM_API_KEY).
  try {
    const { startAisFeed } = await import("./ais");
    startAisFeed();
  } catch (e: any) {
    console.error("[ais] failed to start feed:", e?.message || e);
  }
}

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      // Run database maintenance AFTER the port is open so deploy health
      // checks are never blocked by slow startup queries.
      void runStartupMaintenance();
    },
  );
})();
