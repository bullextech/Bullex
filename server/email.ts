import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { storage } from "./storage";
import { getBrandingLogos } from "./documentFileGenerator";
import { getObjectBuffer } from "./object-files";

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface EmailAttachment {
  filename: string;
  content: string;
}

// Extracts the bare address out of "Name <addr>" or returns the input as-is.
function extractAddress(value: string): string {
  return value.match(/<([^>]+)>/)?.[1]?.trim() || value.trim();
}

// ---------------------------------------------------------------------------
// Sender audit stamp
//
// When an email is triggered by an authenticated admin or team-member request,
// a per-request actor context (set by middleware in routes.ts via
// AsyncLocalStorage) propagates into sendEmail — including across
// fire-and-forget promises — and an audit block is appended to the outgoing
// email: who sent it (system ID + email), from which IP, when, plus an
// HMAC-SHA256 digital stamp over those details so the stamp cannot be forged
// or altered without the server's secret.
// ---------------------------------------------------------------------------

export interface EmailActorContext {
  role: "admin" | "team";
  username: string;
  ip: string;
}

const emailActorStorage = new AsyncLocalStorage<EmailActorContext>();

export function runWithEmailActor<T>(actor: EmailActorContext, fn: () => T): T {
  return emailActorStorage.run(actor, fn);
}

interface ResolvedActor {
  roleLabel: string;
  systemId: string;
  email: string;
  ip: string;
}

async function resolveEmailActor(ctx: EmailActorContext): Promise<ResolvedActor> {
  if (ctx.role === "admin") {
    return {
      roleLabel: "Administrator",
      systemId: "ADMIN",
      email: process.env.ADMIN_EMAIL || "administrator",
      ip: ctx.ip,
    };
  }
  let systemId = ctx.username || "unknown";
  let email = "not on file";
  try {
    const tm = await storage.getTeamMemberByUsername(ctx.username);
    if (tm) {
      systemId = tm.participantId || tm.id;
      if (tm.email) email = tm.email;
    }
  } catch {
    // Fall back to username as the system ID; never block the email itself.
  }
  return { roleLabel: "Team Member", systemId, email, ip: ctx.ip };
}

function buildAuditStampHtml(actor: ResolvedActor, to: string, subject: string): string {
  const timestamp = new Date().toISOString();
  const stampSecret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "bullex-dev-only";
  const stamp = crypto
    .createHmac("sha256", stampSecret)
    .update([actor.roleLabel, actor.systemId, actor.email, actor.ip, to, subject, timestamp].join("|"))
    .digest("hex");
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 12px auto 0 auto; padding: 12px 16px; background-color: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 6px;">
      <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: bold; color: #555555; text-transform: uppercase; letter-spacing: 0.5px;">Sender Audit — Digitally Stamped</p>
      <table style="font-size: 11px; color: #666666; border-collapse: collapse;">
        <tr><td style="padding: 1px 10px 1px 0; white-space: nowrap;">Sent by</td><td style="padding: 1px 0;">${esc(actor.roleLabel)}</td></tr>
        <tr><td style="padding: 1px 10px 1px 0; white-space: nowrap;">System ID</td><td style="padding: 1px 0;">${esc(actor.systemId)}</td></tr>
        <tr><td style="padding: 1px 10px 1px 0; white-space: nowrap;">Email ID</td><td style="padding: 1px 0;">${esc(actor.email)}</td></tr>
        <tr><td style="padding: 1px 10px 1px 0; white-space: nowrap;">IP Address</td><td style="padding: 1px 0;">${esc(actor.ip)}</td></tr>
        <tr><td style="padding: 1px 10px 1px 0; white-space: nowrap;">Timestamp (UTC)</td><td style="padding: 1px 0;">${esc(timestamp)}</td></tr>
      </table>
      <p style="margin: 6px 0 0 0; font-size: 10px; color: #999999; word-break: break-all;">Digital Stamp (HMAC-SHA256): ${stamp}</p>
    </div>`;
}

// All platform email is branded as coming from Bullfrog Group and is sent from
// the docs address. If the bullfrog-group.com domain is not (yet)
// verified with Resend, delivery falls back to the previously configured
// verified sender (EMAIL_FROM, else Resend's onboarding address) so
// transactional mail keeps flowing — with a loud log so it gets fixed.
const PREFERRED_FROM_ADDRESS = "docs@bullfrog-group.com";

async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[], cc?: string[], replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  // node:test exposes NODE_TEST_CONTEXT. Never let either a connected account
  // or a legacy key turn route tests into real outbound email. A test may opt
  // in only when it has installed a mocked transport first.
  if (process.env.NODE_TEST_CONTEXT && process.env.EMAIL_ENABLE_TEST_DELIVERY !== "true") {
    console.log("[email] Resend delivery disabled under node:test");
    return false;
  }

  const primaryFrom = extractAddress(process.env.EMAIL_FROM_OVERRIDE || PREFERRED_FROM_ADDRESS);
  const fallbackFrom = extractAddress(process.env.EMAIL_FROM || "onboarding@resend.dev");

  // If this email was triggered by an authenticated admin/team request, append
  // the digitally-stamped sender audit block.
  let finalHtml = html;
  const actorCtx = emailActorStorage.getStore();
  if (actorCtx) {
    try {
      const actor = await resolveEmailActor(actorCtx);
      finalHtml = html + buildAuditStampHtml(actor, to, subject);
    } catch (error) {
      console.error("[email] Failed to build sender audit stamp (sending without it):", error);
    }
  }

  // Swap the header/footer brand markers for the uploaded logos (inline images).
  const branding = await applyEmailBranding(finalHtml);
  finalHtml = branding.html;

  try {
    const payload: Record<string, any> = {
      from: `Bullfrog Group <${primaryFrom}>`,
      to: [to],
      subject,
      html: finalHtml,
    };
    const allAttachments = [...(attachments || []), ...branding.inlineAttachments];
    if (allAttachments.length > 0) {
      payload.attachments = allAttachments;
    }
    // Every outgoing platform email is CC'd to the legal desk, unless legal is
    // already the recipient or an explicit CC.
    const LEGAL_CC = "legal@bullfrog-group.com";
    const ccList = [...(cc || [])];
    const already = [to, ...ccList].some((a) => a.trim().toLowerCase() === LEGAL_CC);
    if (!already) ccList.push(LEGAL_CC);
    if (ccList.length > 0) {
      payload.cc = ccList;
    }
    // Any email that carries a document attachment is also forwarded (BCC) to
    // the VK desk, unless VK is already a recipient.
    const VK_BCC = "vk@bullfrog-group.com";
    if ((attachments || []).length > 0) {
      const vkAlready = [to, ...ccList].some((a) => extractAddress(a).trim().toLowerCase() === VK_BCC);
      if (!vkAlready) payload.bcc = [VK_BCC];
    }
    if (replyTo) {
      payload.reply_to = replyTo;
    }

    const post = () => apiKey
      ? fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
      : new ReplitConnectors().proxy("resend", "/emails", {
          method: "POST",
          body: payload,
        });

    let response = await post();

    if (!response.ok) {
      const errorData = await response.text();
      const domainNotVerified = response.status === 403 && errorData.includes("not verified");
      if (domainNotVerified && fallbackFrom !== primaryFrom) {
        console.error(`[email] SENDER DOMAIN NOT VERIFIED: cannot send from "${primaryFrom}". Verify the domain at https://resend.com/domains. Falling back to "${fallbackFrom}".`);
        payload.from = `Bullfrog Group <${fallbackFrom}>`;
        response = await post();
        if (!response.ok) {
          const fallbackError = await response.text();
          console.error(`[email] Failed to send email to ${to} (status ${response.status}) using fallback from="${payload.from}": ${fallbackError}`);
          return false;
        }
      } else {
        console.error(`[email] Failed to send email to ${to} (status ${response.status}) using from="${payload.from}": ${errorData}`);
        return false;
      }
    }

    console.log(`[email] Email sent to ${to}: ${subject} (from ${payload.from})`);
    return true;
  } catch (error) {
    console.error("[email] Error sending email:", error);
    return false;
  }
}

// Markers that sendEmail() swaps for the uploaded branding logos (inline cid
// images) when they are configured; the text between the markers is the
// fallback shown when no logo has been uploaded.
const HEADER_BRAND_START = "<!--BX_HEADER_BRAND-->";
const HEADER_BRAND_END = "<!--/BX_HEADER_BRAND-->";
const FOOTER_BRAND_START = "<!--BX_FOOTER_BRAND-->";
const FOOTER_BRAND_END = "<!--/BX_FOOTER_BRAND-->";

function emailWrapper(body: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1a2e; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        ${HEADER_BRAND_START}<h1 style="color: #ffffff; margin: 0; font-size: 24px;">Bullfrog Group</h1>${HEADER_BRAND_END}
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
        ${body}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          This is an automated message from Bullfrog Group, sent via the Bullex Trading Platform. Please do not reply to this email.
        </p>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 20px 16px; text-align: center; border-radius: 8px; margin-top: 12px;">
        ${FOOTER_BRAND_START}<p style="color: #990000; margin: 0; font-size: 16px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.3;">
          Bullex is a proprietary trading platform of Bullfrog Group.
        </p>${FOOTER_BRAND_END}
      </div>
    </div>
  `;
}

// Email-optimised logo images live in Object Storage under fixed names
// (branding/email-header-logo.png = Bullfrog, branding/email-footer-logo.png =
// Bullex). If a fixed object is missing, the corresponding admin-uploaded
// document logo (secondary = header, primary = footer) is used instead.
const EMAIL_LOGO_CACHE = new Map<string, { buffer: Buffer; kind: "png" | "jpg" } | null>();

// Called when admin branding assets change so emails pick up new logos
// without a restart.
export function clearEmailLogoCache(): void {
  EMAIL_LOGO_CACHE.clear();
}

async function getEmailLogo(fixedName: string, settingsSlot: "header" | "footer"): Promise<{ buffer: Buffer; kind: "png" | "jpg" } | null> {
  if (EMAIL_LOGO_CACHE.has(fixedName)) return EMAIL_LOGO_CACHE.get(fixedName) ?? null;
  let logo: { buffer: Buffer; kind: "png" | "jpg" } | null = null;
  try {
    const buffer = await getObjectBuffer("branding", fixedName);
    logo = { buffer, kind: fixedName.endsWith(".png") ? "png" : "jpg" };
  } catch {
    try {
      const logos = await getBrandingLogos();
      const fallback = settingsSlot === "header" ? logos.header : logos.footer;
      if (fallback) logo = { buffer: fallback.buffer, kind: fallback.kind };
    } catch {
      logo = null;
    }
  }
  EMAIL_LOGO_CACHE.set(fixedName, logo);
  return logo;
}

// Swaps the wrapper's brand markers for the branding logos, delivered as
// inline (cid) attachments: Bullfrog logo in the header, Bullex logo in the
// footer. When a logo is not available, the text fallback stays.
async function applyEmailBranding(html: string): Promise<{ html: string; inlineAttachments: any[] }> {
  const inlineAttachments: any[] = [];
  let out = html;
  try {
    const [header, footer] = await Promise.all([
      getEmailLogo("email-header-logo.png", "header"),
      getEmailLogo("email-footer-logo.png", "footer"),
    ]);
    const swap = (start: string, end: string, replacement: string) => {
      const s = out.indexOf(start);
      const e = out.indexOf(end);
      if (s === -1 || e === -1 || e < s) return false;
      out = out.slice(0, s) + replacement + out.slice(e + end.length);
      return true;
    };
    if (header) {
      const img = `<img src="cid:bullfrog-logo" alt="Bullfrog Group" style="max-width: 220px; max-height: 70px; display: inline-block; vertical-align: middle;" />`;
      if (swap(HEADER_BRAND_START, HEADER_BRAND_END, img)) {
        inlineAttachments.push({
          filename: `bullfrog-logo.${header.kind === "png" ? "png" : "jpg"}`,
          content: header.buffer.toString("base64"),
          content_id: "bullfrog-logo",
        });
      }
    }
    if (footer) {
      const img = `<img src="cid:bullex-logo" alt="Bullex" style="max-width: 360px; max-height: 117px; display: inline-block; vertical-align: middle;" />`;
      if (swap(FOOTER_BRAND_START, FOOTER_BRAND_END, img)) {
        inlineAttachments.push({
          filename: `bullex-logo.${footer.kind === "png" ? "png" : "jpg"}`,
          content: footer.buffer.toString("base64"),
          content_id: "bullex-logo",
        });
      }
    }
  } catch (error) {
    console.error("[email] Failed to load branding logos (sending with text branding):", error);
  }
  // Strip any leftover markers so raw comments never reach the recipient.
  out = out
    .replaceAll(HEADER_BRAND_START, "")
    .replaceAll(HEADER_BRAND_END, "")
    .replaceAll(FOOTER_BRAND_START, "")
    .replaceAll(FOOTER_BRAND_END, "");
  return { html: out, inlineAttachments };
}

export async function sendMeetingInviteEmail(
  to: string,
  meetUrl: string,
  opts?: { recipientName?: string; senderName?: string; note?: string },
): Promise<boolean> {
  const recipientName = opts?.recipientName?.trim();
  const senderName = opts?.senderName?.trim() || "The Bullex team";
  const note = opts?.note?.trim();
  const safeUrl = esc(meetUrl);
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">You're invited to a Google Meet</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${recipientName ? esc(recipientName) : "valued client"},</p>
    <p style="color: #475569; line-height: 1.6;">
      ${esc(senderName)} has invited you to a video meeting on Google Meet.
    </p>
    ${note ? `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;"><p style="color: #475569; margin: 0; line-height: 1.6; white-space: pre-wrap;">${esc(note)}</p></div>` : ""}
    <div style="text-align: center; margin: 28px 0;">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer"
         style="display: inline-block; background: #990000; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 15px;">
        Join the meeting
      </a>
    </div>
    <p style="color: #475569; line-height: 1.6; font-size: 14px;">
      Or open this link in your browser:<br />
      <a href="${safeUrl}" style="color: #2563eb; word-break: break-all;">${safeUrl}</a>
    </p>
    <p style="color: #475569; line-height: 1.6; font-size: 14px;">
      If you have any questions or need to reschedule, simply reply to this email or contact us at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, "Your Google Meet invitation – Bullex Trading Platform", emailWrapper(body), undefined, undefined, "docs@bullfrog-group.com");
}

export async function sendKycConfirmationEmail(
  to: string,
  companyName: string,
  signatoryName: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Application Submitted Successfully</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(signatoryName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      Thank you for submitting the KYC application for <strong>${esc(companyName)}</strong> on the Bullex Trading Platform.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Application Status: Submitted</p>
      <p style="color: #15803d; margin: 8px 0 0; font-size: 14px;">
        Your KYC application has been received and is currently under review by our compliance team.
      </p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      Our team will review your application and all submitted documents. You will be notified once the review is complete.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please contact our team at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `KYC Application Submitted – ${companyName}`, emailWrapper(body));
}

export async function sendKycSubmittedAdminEmail(
  adminEmail: string,
  companyName: string,
  contactName: string,
  contactEmail: string,
  businessType: string | null | undefined,
  countryOfOperation: string | null | undefined,
  submittedAt: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">New KYC Application Received</h2>
    <p style="color: #475569; line-height: 1.6;">A new KYC application has been submitted on the Bullex Trading Platform and is awaiting your review.</p>
    <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #92400e; margin: 0; font-weight: 600;">Action Required: Review &amp; Verify</p>
      <p style="color: #a16207; margin: 8px 0 0; font-size: 14px;">Please log in to the admin panel to review the submitted documents and approve or reject this application.</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Company Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(companyName)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Person</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(contactName)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(contactEmail)}</td></tr>
      ${businessType ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Business Type</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(businessType)}</td></tr>` : ""}
      ${countryOfOperation ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Country of Operation</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(countryOfOperation)}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Submitted At</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${esc(submittedAt)}</td></tr>
    </table>
    <p style="color: #475569; line-height: 1.6;">
      Log in to the admin panel at <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">Bullex Admin</a> to take action on this application.
    </p>
  `;
  return sendEmail(adminEmail, `New KYC Application – ${companyName}`, emailWrapper(body));
}

export async function sendKycActionAdminCopyEmail(
  adminEmail: string,
  action: "approved" | "rejected",
  companyName: string,
  contactName: string,
  contactEmail: string,
  reviewNotes?: string | null
): Promise<boolean> {
  const isApproved = action === "approved";
  const actionLabel = isApproved ? "Approved" : "Rejected";
  const statusBg = isApproved ? "#f0fdf4" : "#fef2f2";
  const statusBorder = isApproved ? "#bbf7d0" : "#fecaca";
  const statusTextColor = isApproved ? "#166534" : "#991b1b";
  const statusSubColor = isApproved ? "#15803d" : "#b91c1c";
  const statusMsg = isApproved
    ? "The applicant has been notified and their account is now active on the platform."
    : "The applicant has been notified with the reason for rejection.";

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Application ${actionLabel} – Confirmation</h2>
    <p style="color: #475569; line-height: 1.6;">This is a confirmation that the following KYC application has been <strong>${actionLabel.toLowerCase()}</strong> by the Bullex admin panel.</p>
    <div style="background: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: ${statusTextColor}; margin: 0; font-weight: 600;">Status: ${actionLabel}</p>
      <p style="color: ${statusSubColor}; margin: 8px 0 0; font-size: 14px;">${statusMsg}</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Company Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(companyName)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Person</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(contactName)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(contactEmail)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Action Taken</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${actionLabel}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px;">Date</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>
    </table>
    ${reviewNotes ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Review Notes</p>
      <p style="color: #1d4ed8; margin: 8px 0 0; font-size: 14px;">${esc(reviewNotes)}</p>
    </div>
    ` : ""}
    <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0;">This is an automated audit copy sent to the admin account.</p>
  `;
  return sendEmail(adminEmail, `KYC ${actionLabel} – ${companyName}`, emailWrapper(body));
}

export async function sendKycApprovalEmail(
  to: string,
  companyName: string,
  signatoryName: string,
  category?: string | null,
  products?: string | null,
  clientUsername?: string | null,
  clientPortalSetupUrl?: string | null,
  participantId?: string | null
): Promise<boolean> {
  const participantIdRow = participantId
    ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Participant ID</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(participantId)}</td></tr>`
    : "";
  const detailsRows = [
    category ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Category</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(category)}</td></tr>` : "",
    products ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Products</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(products)}</td></tr>` : "",
  ].filter(Boolean).join("");

  const credentialsBlock = (clientUsername && clientPortalSetupUrl) ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Client Portal Access</p>
      <p style="color: #1d4ed8; margin: 8px 0 0; font-size: 14px;">
        You can now access the Client Portal to view your trades and documents.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 12px 0 0; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 100px;">Username:</td><td style="color: #1e293b; font-weight: 600;">${escapeHtml(clientUsername)}</td></tr>
      </table>
      <p style="margin: 16px 0 0;">
        <a href="${escapeHtml(clientPortalSetupUrl)}" style="display: inline-block; background: #1d4ed8; color: #ffffff; text-decoration: none; padding: 10px 20px; font-weight: 600; font-size: 14px; border-radius: 6px;">Set Your Password &amp; Access Portal</a>
      </p>
      <p style="color: #64748b; margin: 12px 0 0; font-size: 12px;">
        This link expires in 72 hours. If it expires, contact <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a> to request a new one.
      </p>
    </div>
  ` : clientUsername ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Client Portal Access</p>
      <p style="color: #475569; margin: 8px 0 0; font-size: 14px;">
        Your username is <strong>${escapeHtml(clientUsername)}</strong>. Please contact <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a> to receive your secure login link.
      </p>
    </div>
  ` : "";

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Application Approved</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(signatoryName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      We are pleased to inform you that the KYC application for <strong>${esc(companyName)}</strong> has been reviewed and <strong>approved</strong> by our compliance team.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Application Status: Approved</p>
      <p style="color: #15803d; margin: 8px 0 0; font-size: 14px;">
        Your organisation is now registered as a verified participant on the Bullex Trading Platform.
      </p>
    </div>
    ${(detailsRows || participantIdRow) ? `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Company</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(companyName)}</td></tr>
      ${participantIdRow}
      ${detailsRows}
    </table>
    ` : ""}
    ${credentialsBlock}
    <p style="color: #475569; line-height: 1.6;">
      You may now participate in commodity trades on the platform. For any trade inquiries, please contact our trade desk at
      <a href="mailto:trade@bullfrog-group.com" style="color: #2563eb;">trade@bullfrog-group.com</a>.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please contact our team at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `KYC Application Approved – ${companyName}`, emailWrapper(body));
}

export async function sendKycRejectionEmail(
  to: string,
  companyName: string,
  signatoryName: string,
  reviewNotes?: string | null
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Application Rejected</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(signatoryName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      We regret to inform you that the KYC application for <strong>${esc(companyName)}</strong> has been reviewed and <strong>rejected</strong> by our compliance team.
    </p>
    ${reviewNotes ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Reason for Rejection</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">${esc(reviewNotes)}</p>
    </div>
    ` : `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Application Status: Rejected</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">
        Your application did not meet the required compliance standards at this time.
      </p>
    </div>
    `}
    <p style="color: #475569; line-height: 1.6;">
      You may submit a new application after addressing the issues noted above. If you believe this decision was made in error or need further clarification, please contact our team at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `KYC Application Rejected – ${companyName}`, emailWrapper(body));
}

export async function sendChangeRequestApprovedEmail(
  to: string,
  companyName: string,
  contactName: string,
  changedFields: Record<string, any>,
  adminNotes?: string | null
): Promise<boolean> {
  const fieldLabels: Record<string, string> = {
    companyName: "Company Name", registeredAddress: "Registered Address", primaryBusinessAddress: "Primary Business Address",
    contactName: "Contact Name", contactTitle: "Contact Title", contactPhone: "Contact Phone", contactEmail: "Contact Email",
    countryOfOperation: "Country of Operation", businessType: "Business Type", coreBusinessDescription: "Core Business Description",
    bankName: "Bank Name", bankAddress: "Bank Address", accountName: "Account Name", accountNumber: "Account Number",
    swiftCode: "SWIFT Code", bankAccountCurrency: "Bank Account Currency",
    signatoryName: "Signatory Name", signatoryTitle: "Signatory Title", signatoryEmail: "Signatory Email",
  };

  const changesRows = Object.entries(changedFields)
    .map(([key, value]) => `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${esc(fieldLabels[key] || key)}</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(value)}</td></tr>`)
    .join("");

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Change Request Approved</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(contactName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      The change request for <strong>${esc(companyName)}</strong> has been reviewed and <strong>approved</strong> by our compliance team. The following updates have been applied to your KYC record:
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Updated Value</th></tr>
      ${changesRows}
    </table>
    ${adminNotes ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Admin Notes</p>
      <p style="color: #1d4ed8; margin: 8px 0 0; font-size: 14px;">${esc(adminNotes)}</p>
    </div>
    ` : ""}
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Status: Approved &amp; Applied</p>
      <p style="color: #15803d; margin: 8px 0 0; font-size: 14px;">
        These changes have been recorded on the blockchain for immutable verification.
      </p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please contact our team at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `KYC Change Request Approved – ${companyName}`, emailWrapper(body));
}

export async function sendChangeRequestRejectedEmail(
  to: string,
  companyName: string,
  contactName: string,
  changedFields: Record<string, any>,
  adminNotes?: string | null
): Promise<boolean> {
  const fieldLabels: Record<string, string> = {
    companyName: "Company Name", registeredAddress: "Registered Address", primaryBusinessAddress: "Primary Business Address",
    contactName: "Contact Name", contactTitle: "Contact Title", contactPhone: "Contact Phone", contactEmail: "Contact Email",
    countryOfOperation: "Country of Operation", businessType: "Business Type", coreBusinessDescription: "Core Business Description",
    bankName: "Bank Name", bankAddress: "Bank Address", accountName: "Account Name", accountNumber: "Account Number",
    swiftCode: "SWIFT Code", bankAccountCurrency: "Bank Account Currency",
    signatoryName: "Signatory Name", signatoryTitle: "Signatory Title", signatoryEmail: "Signatory Email",
  };

  const changesRows = Object.entries(changedFields)
    .map(([key, value]) => `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${esc(fieldLabels[key] || key)}</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${esc(value)}</td></tr>`)
    .join("");

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Change Request Rejected</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(contactName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      The change request for <strong>${esc(companyName)}</strong> has been reviewed and <strong>rejected</strong> by our compliance team. The following proposed changes were not applied:
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Proposed Value</th></tr>
      ${changesRows}
    </table>
    ${adminNotes ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Reason for Rejection</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">${esc(adminNotes)}</p>
    </div>
    ` : ""}
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Status: Rejected</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">
        No changes have been made to your KYC record. You may submit a new change request if needed.
      </p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please contact our team at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `KYC Change Request Rejected – ${companyName}`, emailWrapper(body));
}

export async function sendJobApplicationToHR(
  fullName: string,
  email: string,
  phone: string,
  address: string,
  roleTitle: string,
  aboutYourself: string,
  attachmentBase64?: string,
  attachmentFilename?: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">New Job Application Received</h2>
    <p style="color: #475569; line-height: 1.6;">A new application has been submitted via the Bullex Careers page.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;">
        <th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th>
        <th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th>
      </tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Full Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(fullName)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(email)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Phone Number</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(phone || "—")}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Address</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(address || "—")}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px;">Role Applied For</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${esc(roleTitle)}</td></tr>
    </table>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e293b; margin: 0 0 8px; font-weight: 600;">About the Applicant</p>
      <p style="color: #475569; margin: 0; line-height: 1.7; font-size: 14px; white-space: pre-wrap;">${esc(aboutYourself || "(No description provided)")}</p>
    </div>
    ${attachmentFilename ? `<p style="color: #475569; font-size: 13px;">A document (<strong>${esc(attachmentFilename)}</strong>) has been attached to this email.</p>` : ""}
    <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0;">Submitted: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
  `;
  const attachments = attachmentBase64 && attachmentFilename
    ? [{ filename: attachmentFilename, content: attachmentBase64 }]
    : undefined;
  return sendEmail("career@bullex.tech", `Job Application – ${roleTitle} – ${fullName}`, emailWrapper(body), attachments);
}

export async function sendJobApplicationAcknowledgement(
  toEmail: string,
  fullName: string,
  roleTitle: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Application Received – Thank You</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(fullName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      Thank you for your interest in joining <strong>Bullex Commodity Trading Platform</strong>. We have received your application for the following position:
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Position Applied For</p>
      <p style="color: #1d4ed8; margin: 8px 0 0; font-size: 16px; font-weight: 600;">${esc(roleTitle)}</p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      Our HR team will carefully review your application and all submitted documents. If your profile matches our requirements, we will be in touch to discuss next steps.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">What Happens Next?</p>
      <ul style="color: #15803d; margin: 8px 0 0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
        <li>Our team reviews your application within 5–7 business days</li>
        <li>Shortlisted candidates will be contacted for an initial interview</li>
        <li>All applicants receive a response regardless of outcome</li>
      </ul>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please reach out to our HR team at
      <a href="mailto:career@bullex.tech" style="color: #2563eb;">career@bullex.tech</a>.
    </p>
    <p style="color: #475569; line-height: 1.6;">We appreciate your interest in Bullex and wish you the best of luck.</p>
  `;
  return sendEmail(toEmail, `Application Received – ${roleTitle} | Bullex`, emailWrapper(body));
}

export async function sendSignaturePendingEmail(
  to: string,
  recipientName: string,
  docType: string,
  docTitle: string
): Promise<boolean> {
  const docTypeLabels: Record<string, string> = {
    DEAL_RECAP: "Deal Recap",
    FCO: "Full Corporate Offer",
    SCO: "Soft Corporate Offer",
    ICPO: "Irrevocable Corporate Purchase Order",
    SPA: "Sales & Purchase Agreement",
    LOI: "Letter of Intent",
    POP: "Proof of Product",
    POF: "Proof of Funds",
    BCL: "Bank Comfort Letter",
    NCNDA: "Non-Circumvention Non-Disclosure Agreement",
  };
  const fullType = docTypeLabels[docType] || docType;

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Document Awaiting Your Review</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(recipientName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      A trade document has been sent to you for review and acceptance via the Bullex Trading Platform:
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 120px;">Document Type:</td><td style="color: #1e293b; font-weight: 600;">${esc(fullType)} (${esc(docType)})</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Title:</td><td style="color: #1e293b; font-weight: 600;">${esc(docTitle)}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Date Sent:</td><td style="color: #1e293b; font-weight: 600;">${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>
      </table>
    </div>
    <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #92400e; margin: 0; font-weight: 600;">Action Required</p>
      <p style="color: #a16207; margin: 8px 0 0; font-size: 14px;">
        Please log in to your Client Portal to review this document. You can accept the document or request amendments if changes are needed.
      </p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      For any trade inquiries, please contact our trade desk at
      <a href="mailto:trade@bullfrog-group.com" style="color: #2563eb;">trade@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `Action Required: ${fullType} (${docType}) – ${docTitle}`, emailWrapper(body));
}

export async function sendAmendmentRequestedEmail(
  to: string,
  recipientName: string,
  docType: string,
  docTitle: string,
  amendmentNotes: string,
  requestedBy: string
): Promise<boolean> {
  const docTypeLabels: Record<string, string> = {
    DEAL_RECAP: "Deal Recap",
    FCO: "Full Corporate Offer",
    SCO: "Soft Corporate Offer",
    ICPO: "Irrevocable Corporate Purchase Order",
    SPA: "Sales & Purchase Agreement",
    LOI: "Letter of Intent",
    POP: "Proof of Product",
    POF: "Proof of Funds",
    BCL: "Bank Comfort Letter",
  };
  const fullType = docTypeLabels[docType] || docType;

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Amendment Requested</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(recipientName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      An amendment has been requested for the following trade document on the Bullex Trading Platform:
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 120px;">Document Type:</td><td style="color: #1e293b; font-weight: 600;">${esc(fullType)} (${esc(docType)})</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Title:</td><td style="color: #1e293b; font-weight: 600;">${esc(docTitle)}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Requested By:</td><td style="color: #1e293b; font-weight: 600;">${esc(requestedBy)}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Date:</td><td style="color: #1e293b; font-weight: 600;">${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>
      </table>
    </div>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Amendment Notes</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">${esc(amendmentNotes)}</p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      Please review the requested changes and amend the document accordingly. Once amended, the document can be resent for approval.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      For any trade inquiries, please contact our trade desk at
      <a href="mailto:trade@bullfrog-group.com" style="color: #2563eb;">trade@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `Amendment Requested: ${fullType} (${docType}) – ${docTitle}`, emailWrapper(body));
}

// Sent to the team member who prepared a document once an admin has reviewed it,
// telling them whether it was approved (now available in their My Documents
// section, ready to sign & send) or rejected (returned for amendment).
export async function sendDocumentReviewDecisionEmail(
  to: string,
  recipientName: string,
  docType: string,
  docTitle: string,
  approved: boolean,
  notes?: string,
): Promise<boolean> {
  const docTypeLabels: Record<string, string> = {
    DEAL_RECAP: "Deal Recap",
    FCO: "Full Corporate Offer",
    SCO: "Soft Corporate Offer",
    ICPO: "Irrevocable Corporate Purchase Order",
    SPA: "Sales & Purchase Agreement",
    LOI: "Letter of Intent",
    POP: "Proof of Product",
    POF: "Proof of Funds",
    BCL: "Bank Comfort Letter",
    NCNDA: "Non-Circumvention Non-Disclosure Agreement",
  };
  const fullType = docTypeLabels[docType] || docType;
  const decisionBlock = approved
    ? `
    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #065f46; margin: 0; font-weight: 600;">Approved</p>
      <p style="color: #047857; margin: 8px 0 0; font-size: 14px;">
        This document has been approved by an administrator and is now available in
        the <strong>My Documents</strong> section of your team portal. You can apply
        your signature and send it to the buyer or seller.
      </p>
    </div>`
    : `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Returned for Amendment</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">
        This document was not approved and has been returned for amendment. Please
        review the notes below, update the document in your team portal, and resubmit
        it for approval.
      </p>
      ${notes && notes.trim() ? `<p style="color: #7f1d1d; margin: 12px 0 0; font-size: 14px;"><strong>Admin notes:</strong> ${esc(notes)}</p>` : ""}
    </div>`;
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Document ${approved ? "Approved" : "Returned for Amendment"}</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(recipientName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      A trade document you prepared on the Bullex Trading Platform has been reviewed:
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 120px;">Document Type:</td><td style="color: #1e293b; font-weight: 600;">${esc(fullType)} (${esc(docType)})</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Title:</td><td style="color: #1e293b; font-weight: 600;">${esc(docTitle)}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Reviewed:</td><td style="color: #1e293b; font-weight: 600;">${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>
      </table>
    </div>
    ${decisionBlock}
    <p style="color: #475569; line-height: 1.6;">
      For any trade inquiries, please contact our trade desk at
      <a href="mailto:trade@bullfrog-group.com" style="color: #2563eb;">trade@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(
    to,
    `Document ${approved ? "Approved" : "Returned for Amendment"}: ${fullType} (${docType}) – ${docTitle}`,
    emailWrapper(body),
  );
}

export async function sendDocumentEmail(
  to: string,
  recipientName: string,
  docType: string,
  docTitle: string,
  role: "Buyer" | "Seller" | "Party A" | "Party B",
  pdfFilePath: string,
  ccEmail?: string,
  customMessage?: string,
  docxFilePath?: string,
  // Additional related documents to attach in the SAME email (e.g. the bank
  // drafts derived from an SPA). Each entry's PDF is attached alongside the
  // main document; unreadable files are skipped with a log, never failing the send.
  extraPdfDocs?: { docType: string; docTitle: string; pdfFilePath: string }[]
): Promise<boolean> {
  const docTypeLabels: Record<string, string> = {
    DEAL_RECAP: "Deal Recap",
    FCO: "Full Corporate Offer",
    ICPO: "Irrevocable Corporate Purchase Order",
    SPA: "Sales & Purchase Agreement",
    LOI: "Letter of Intent",
    POP: "Proof of Product",
    POF: "Proof of Funds",
    BCL: "Bank Comfort Letter",
    NCNDA: "Non-Circumvention Non-Disclosure Agreement",
    SCO: "Seller's Conditional Offer",
  };

  const fullType = docTypeLabels[docType] || docType;
  let pdfBase64 = "";
  try {
    const pdfBuffer = fs.readFileSync(pdfFilePath);
    pdfBase64 = pdfBuffer.toString("base64");
  } catch (err) {
    console.error("[email] Failed to read PDF for attachment:", err);
    return false;
  }

  const messageBlock = customMessage && customMessage.trim()
    ? `<div style="background: #f8fafc; border-left: 4px solid #990000; border-radius: 4px; padding: 16px; margin: 16px 0;">
        <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px;">Message from Bullfrog Group</p>
        <p style="color: #1e293b; line-height: 1.6; margin: 0; white-space: pre-wrap;">${esc(customMessage.trim())}</p>
      </div>`
    : "";

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Trade Document Issued</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(recipientName)},</p>
    ${messageBlock}
    <p style="color: #475569; line-height: 1.6;">
      Please find attached the following trade document issued via the Bullex Trading Platform:
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 120px;">Document Type:</td><td style="color: #1e293b; font-weight: 600;">${esc(fullType)} (${esc(docType)})</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Title:</td><td style="color: #1e293b; font-weight: 600;">${esc(docTitle)}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Your Role:</td><td style="color: #1e293b; font-weight: 600;">${esc(role)}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Date Issued:</td><td style="color: #1e293b; font-weight: 600;">${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>
      </table>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      ${docxFilePath
        ? "The PDF and editable DOCX documents are attached to this email."
        : "The PDF document is attached to this email."}
      Please review the document carefully and contact our trade desk if you have any questions.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      For any trade inquiries, please contact our trade desk at
      <a href="mailto:trade@bullfrog-group.com" style="color: #2563eb;">trade@bullfrog-group.com</a>.
    </p>
  `;

  const safeName = docTitle.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
  const attachments: EmailAttachment[] = [{
    filename: `${docType}_${safeName}.pdf`,
    content: pdfBase64,
  }];

  // When a DOCX is requested, delivery is all-or-nothing: callers promise both
  // formats, so never silently send a PDF-only email if the DOCX is unreadable.
  if (docxFilePath) {
    try {
      const docxBase64 = fs.readFileSync(docxFilePath).toString("base64");
      attachments.push({ filename: `${docType}_${safeName}.docx`, content: docxBase64 });
    } catch (err) {
      console.error("[email] Failed to read DOCX for attachment:", err);
      return false;
    }
  }

  for (const extra of extraPdfDocs || []) {
    try {
      const extraBase64 = fs.readFileSync(extra.pdfFilePath).toString("base64");
      const extraSafe = extra.docTitle.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
      attachments.push({ filename: `${extra.docType}_${extraSafe}.pdf`, content: extraBase64 });
    } catch (err) {
      console.error(`[email] Failed to read extra attachment (${extra.docType}):`, err);
    }
  }

  const ccList = ccEmail ? [ccEmail] : undefined;
  return sendEmail(to, `${fullType} (${docType}) – ${docTitle}`, emailWrapper(body), attachments, ccList);
}

export async function sendKycOnboardingInviteEmail(
  to: string,
  kycUrl: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Onboarding Invitation</h2>
    <p style="color: #475569; line-height: 1.6;">You have been invited to complete your KYC (Know Your Customer) onboarding for the <strong>Bullex Commodity Trading Platform</strong>.</p>
    <p style="color: #475569; line-height: 1.6;">
      Please click the button below to begin your application. You will be asked to provide your company details, beneficial ownership information, and supporting documentation.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${esc(kycUrl)}" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 700; font-size: 15px; letter-spacing: 0.05em;">
        START KYC APPLICATION
      </a>
    </div>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
      Or copy and paste this link into your browser:<br/>
      <a href="${esc(kycUrl)}" style="color: #2563eb; word-break: break-all;">${esc(kycUrl)}</a>
    </p>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions about the process, please contact our team at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, "Bullex – KYC Onboarding Invitation", emailWrapper(body));
}

export async function sendRegistrationApprovalEmail(
  to: string,
  fullName: string,
  companyName: string,
  roleType: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Registration Approved</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(fullName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      We are pleased to inform you that your registration as a <strong>${esc(roleType)}</strong> for <strong>${esc(companyName)}</strong> has been reviewed and <strong>approved</strong> by our team.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Registration Status: Approved</p>
      <p style="color: #15803d; margin: 8px 0 0; font-size: 14px;">
        Our onboarding team will be in touch shortly to guide you through the KYC verification process and grant you access to the platform.
      </p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      For any questions, please contact our team at
      <a href="mailto:trade@bullfrog-group.com" style="color: #2563eb;">trade@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `Registration Approved – ${companyName}`, emailWrapper(body));
}

export async function sendRegistrationRejectionEmail(
  to: string,
  fullName: string,
  companyName: string,
  roleType: string,
  reviewNotes?: string | null
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Registration Update</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(fullName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      Thank you for your interest in the Bullex Commodity Trading Platform. After reviewing your registration as a <strong>${esc(roleType)}</strong> for <strong>${esc(companyName)}</strong>, we are unable to proceed at this time.
    </p>
    ${reviewNotes ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Reason</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">${esc(reviewNotes)}</p>
    </div>
    ` : `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Registration Status: Not Approved</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">Your registration did not meet our current requirements.</p>
    </div>
    `}
    <p style="color: #475569; line-height: 1.6;">
      If you believe this was in error or would like to discuss further, please contact us at
      <a href="mailto:trade@bullfrog-group.com" style="color: #2563eb;">trade@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `Registration Update – ${companyName}`, emailWrapper(body));
}

export async function sendRegistrationConfirmationEmail(
  to: string,
  fullName: string,
  roleType: string,
  companyName: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Registration Received</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(fullName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      Thank you for registering with the <strong>Bullex Commodity Trading Platform</strong>. We have received your registration as a <strong>${esc(roleType)}</strong> for <strong>${esc(companyName)}</strong>.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Registration Status: Received</p>
      <p style="color: #15803d; margin: 8px 0 0; font-size: 14px;">
        Our team will review your registration and reach out to you shortly to guide you through the next steps, including KYC verification.
      </p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please contact our team at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, `Registration Received – ${companyName}`, emailWrapper(body));
}

export async function sendRegistrationAdminEmail(
  adminEmail: string,
  fullName: string,
  companyName: string,
  email: string,
  phone: string,
  country: string,
  roleType: string,
  commodities: string | null | undefined,
  message: string | null | undefined,
  submittedAt: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">New Platform Registration</h2>
    <p style="color: #475569; line-height: 1.6;">A new registration has been submitted on the Bullex Trading Platform.</p>
    <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #92400e; margin: 0; font-weight: 600;">Action Required: Review Registration</p>
      <p style="color: #a16207; margin: 8px 0 0; font-size: 14px;">Please review this registration and initiate KYC onboarding if appropriate.</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Full Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(fullName)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Company Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(companyName)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(email)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Phone</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(phone)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Country</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(country)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Role Type</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(roleType)}</td></tr>
      ${commodities ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Commodities of Interest</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(commodities)}</td></tr>` : ""}
      ${message ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Message</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${esc(message)}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Submitted At</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${esc(submittedAt)}</td></tr>
    </table>
  `;
  return sendEmail(adminEmail, `New Registration – ${companyName} (${roleType})`, emailWrapper(body));
}

export async function sendEnquiryCreatedNotification(enquiry: {
  enquiryRef: string;
  side: string;
  product: string;
  quantity?: string | null;
  unit?: string | null;
  specifications?: string | null;
  producer?: string | null;
  loadingPort?: string | null;
  incoterms?: string | null;
  validity?: string | null;
  createdBy?: string | null;
  email?: string | null;
  additionalInfo?: string | null;
  createdAt: Date;
}): Promise<boolean> {
  const TRADE_EMAIL = "trade@bullfrog-group.com";
  const sideLabel = enquiry.side === "sell" ? "SELL" : "BUY";
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">New Trade Enquiry Submitted</h2>
    <p style="color: #475569; line-height: 1.6;">A new trade enquiry has been created on the Bullex Trading Platform.</p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1d4ed8; margin: 0; font-weight: 600; font-size: 18px;">${esc(enquiry.enquiryRef)} — ${sideLabel} ${esc(enquiry.product)}</p>
      ${enquiry.quantity ? `<p style="color: #1e40af; margin: 6px 0 0; font-size: 14px;">${esc(enquiry.quantity)} ${esc(enquiry.unit || "MT")}</p>` : ""}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Enquiry Ref</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.enquiryRef)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Side</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${sideLabel}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Product</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.product)}</td></tr>
      ${enquiry.quantity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Quantity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.quantity)} ${esc(enquiry.unit || "MT")}</td></tr>` : ""}
      ${enquiry.specifications ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Specifications</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${esc(enquiry.specifications)}</td></tr>` : ""}
      ${enquiry.producer ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Producer / Source</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.producer)}</td></tr>` : ""}
      ${enquiry.loadingPort ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Loading Port</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.loadingPort)}</td></tr>` : ""}
      ${enquiry.incoterms ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Incoterms</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.incoterms)}</td></tr>` : ""}
      ${enquiry.validity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Validity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.validity)}</td></tr>` : ""}
      ${enquiry.createdBy ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Created By</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.createdBy)}</td></tr>` : ""}
      ${enquiry.email ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.email)}</td></tr>` : ""}
      ${enquiry.additionalInfo ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Additional Info</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${esc(enquiry.additionalInfo)}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Submitted At</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${new Date(enquiry.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>
    </table>
  `;
  return sendEmail(TRADE_EMAIL, `New Enquiry – ${enquiry.enquiryRef} | ${sideLabel} ${enquiry.product}`, emailWrapper(body));
}

export async function sendEnquiryStatusNotification(enquiry: {
  enquiryRef: string;
  side: string;
  product: string;
  quantity?: string | null;
  unit?: string | null;
  loadingPort?: string | null;
  incoterms?: string | null;
  createdBy?: string | null;
  email?: string | null;
  validity?: string | null;
}, newStatus: string): Promise<boolean> {
  const TRADE_EMAIL = "trade@bullfrog-group.com";
  const sideLabel = enquiry.side === "sell" ? "SELL" : "BUY";

  const statusStyles: Record<string, { bg: string; border: string; text: string; label: string }> = {
    accepted:     { bg: "#dcfce7", border: "#86efac", text: "#15803d", label: "ACCEPTED" },
    rejected:     { bg: "#fee2e2", border: "#fca5a5", text: "#b91c1c", label: "REJECTED" },
    closed:       { bg: "#f1f5f9", border: "#cbd5e1", text: "#475569", label: "CLOSED" },
    active:       { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", label: "ACTIVE / PENDING" },
    under_review: { bg: "#fefce8", border: "#fde047", text: "#854d0e", label: "UNDER REVIEW" },
    quoted:       { bg: "#f0fdf4", border: "#86efac", text: "#166534", label: "QUOTED" },
  };
  const style = statusStyles[newStatus] || { bg: "#f1f5f9", border: "#cbd5e1", text: "#475569", label: newStatus.toUpperCase() };

  const tradeNote = newStatus === "accepted"
    ? `<p style="color: ${style.text}; margin: 6px 0 0; font-size: 13px; font-weight: 600;">A new trade has been automatically initiated from this enquiry.</p>`
    : "";

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Enquiry Status Updated</h2>
    <p style="color: #475569; line-height: 1.6;">The status of a trade enquiry on the Bullex Trading Platform has been updated.</p>
    <div style="background: ${style.bg}; border: 1px solid ${style.border}; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: ${style.text}; margin: 0; font-weight: 700; font-size: 18px;">Status: ${esc(style.label)}</p>
      <p style="color: ${style.text}; margin: 6px 0 0; font-size: 14px;">${esc(enquiry.enquiryRef)} — ${sideLabel} ${esc(enquiry.product)}${enquiry.quantity ? ` | ${esc(enquiry.quantity)} ${esc(enquiry.unit || "MT")}` : ""}</p>
      ${tradeNote}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Enquiry Ref</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.enquiryRef)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">New Status</td><td style="color: ${style.text}; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${esc(style.label)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Side</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${sideLabel}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Product</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.product)}</td></tr>
      ${enquiry.quantity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Quantity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.quantity)} ${esc(enquiry.unit || "MT")}</td></tr>` : ""}
      ${enquiry.loadingPort ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Loading Port</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.loadingPort)}</td></tr>` : ""}
      ${enquiry.incoterms ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Incoterms</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.incoterms)}</td></tr>` : ""}
      ${enquiry.validity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Validity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.validity)}</td></tr>` : ""}
      ${enquiry.createdBy ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Created By</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.createdBy)}</td></tr>` : ""}
      ${enquiry.email ? `<tr><td style="color: #64748b; padding: 8px 12px;">Company Email</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;"><a href="mailto:${esc(enquiry.email)}" style="color: #1d4ed8;">${esc(enquiry.email)}</a></td></tr>` : ""}
    </table>
  `;
  return sendEmail(TRADE_EMAIL, `Enquiry ${style.label} – ${enquiry.enquiryRef} | ${sideLabel} ${enquiry.product}`, emailWrapper(body));
}

export async function sendEnquiryClientResponseNotification(enquiry: {
  enquiryRef: string;
  side: string;
  product: string;
  quantity?: string | null;
  unit?: string | null;
  loadingPort?: string | null;
  incoterms?: string | null;
}, clientResponse: string, clientCompany: string): Promise<boolean> {
  const TRADE_EMAIL = "trade@bullfrog-group.com";
  const sideLabel = enquiry.side === "sell" ? "SELL" : "BUY";

  const accepted = clientResponse === "accepted";
  const responseLabel = accepted ? "ACCEPTED" : "REJECTED";
  const highlightColor = accepted ? "#dcfce7" : "#fee2e2";
  const borderColor = accepted ? "#86efac" : "#fca5a5";
  const textColor = accepted ? "#15803d" : "#b91c1c";

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Client Enquiry Response</h2>
    <p style="color: #475569; line-height: 1.6;">A client has responded to a trade enquiry on the Bullex Trading Platform.</p>
    <div style="background: ${highlightColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: ${textColor}; margin: 0; font-weight: 700; font-size: 16px;">${esc(clientCompany)} has ${responseLabel} enquiry ${esc(enquiry.enquiryRef)}</p>
      <p style="color: ${textColor}; margin: 6px 0 0; font-size: 14px;">${sideLabel} ${esc(enquiry.product)}${enquiry.quantity ? ` — ${esc(enquiry.quantity)} ${esc(enquiry.unit || "MT")}` : ""}</p>
      ${accepted ? `<p style="color: ${textColor}; margin: 6px 0 0; font-size: 13px; font-weight: 600;">A new trade has been automatically initiated from this enquiry.</p>` : ""}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Enquiry Ref</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.enquiryRef)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Product</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.product)}</td></tr>
      ${enquiry.quantity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Quantity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.quantity)} ${esc(enquiry.unit || "MT")}</td></tr>` : ""}
      ${enquiry.loadingPort ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Loading Port</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.loadingPort)}</td></tr>` : ""}
      ${enquiry.incoterms ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Incoterms</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(enquiry.incoterms)}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Client Response</td><td style="color: ${textColor}; padding: 8px 12px; font-weight: 700;">${responseLabel}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px;">Responded By</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${esc(clientCompany)}</td></tr>
    </table>
  `;
  return sendEmail(TRADE_EMAIL, `Enquiry ${responseLabel} – ${enquiry.enquiryRef} by ${clientCompany}`, emailWrapper(body));
}

export async function sendTeamKycInvite(
  to: string,
  candidateName: string,
  position: string | null,
  department: string | null,
  personalMessage: string | null,
  kycUrl: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">You're Invited to Join Bullfrog Group</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(candidateName || "Candidate")},</p>
    <p style="color: #475569; line-height: 1.6;">
      You have been invited by the HR team at <strong>Bullfrog Group</strong> to complete your Staff Onboarding KYC application on the Bullex platform.
    </p>
    ${position || department ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
      ${position ? `<p style="color: #1d4ed8; margin: 0; font-size: 14px;"><strong>Position:</strong> ${esc(position)}</p>` : ""}
      ${department ? `<p style="color: #1d4ed8; margin: ${position ? "6px" : "0"} 0 0; font-size: 14px;"><strong>Department:</strong> ${esc(department)}</p>` : ""}
    </div>
    ` : ""}
    ${personalMessage ? `
    <div style="background: #f8fafc; border-left: 4px solid #e2e8f0; padding: 12px 16px; margin: 20px 0;">
      <p style="color: #475569; margin: 0; font-style: italic; font-size: 14px;">"${esc(personalMessage)}"</p>
    </div>
    ` : ""}
    <p style="color: #475569; line-height: 1.6;">
      Please click the button below to access your personalised KYC form. Complete all sections accurately — your application will be reviewed by our admin team, and upon approval, your Bullex login credentials will be sent to you.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${esc(kycUrl)}" style="background: #dc2626; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; letter-spacing: 0.5px;">
        Complete Your KYC Application →
      </a>
    </div>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
      Or copy this link: <a href="${esc(kycUrl)}" style="color: #2563eb;">${esc(kycUrl)}</a>
    </p>
    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 24px 0;">
      <p style="color: #92400e; margin: 0; font-size: 13px;">
        This invitation was sent on behalf of Bullfrog Group HR. If you believe this was sent in error, please disregard this email.
      </p>
    </div>
    <p style="color: #475569; margin: 24px 0 0;">Warm regards,<br /><strong>Bullfrog Group HR Team</strong></p>
  `;
  return sendEmail(
    to,
    `Staff Onboarding Invitation${position ? ` — ${position}` : ""} · Bullfrog Group`,
    emailWrapper(body)
  );
}

export async function sendTeamKycAdminNotification(
  to: string,
  fullName: string,
  applicantEmail: string,
  position: string | null,
  department: string | null,
  submittedAt: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">New Team KYC Application Received</h2>
    <p style="color: #475569; line-height: 1.6;">A new staff onboarding application has been submitted and requires your review.</p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1d4ed8; margin: 0; font-weight: 700; font-size: 16px;">${esc(fullName)}</p>
      <p style="color: #3b82f6; margin: 6px 0 0; font-size: 14px;">${esc(applicantEmail)}</p>
      ${position ? `<p style="color: #3b82f6; margin: 4px 0 0; font-size: 13px;">Role: ${esc(position)}${department ? ` · ${esc(department)}` : ""}</p>` : ""}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;">
        <th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th>
        <th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th>
      </tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Applicant Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(fullName)}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(applicantEmail)}</td></tr>
      ${position ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Position Applied</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(position)}</td></tr>` : ""}
      ${department ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Department</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(department)}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Submitted</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${esc(submittedAt)}</td></tr>
    </table>
    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
      <p style="color: #92400e; margin: 0; font-size: 13px;">Please log in to the Bullex admin panel, navigate to Team KYC Applications, and review the submission to allocate login credentials upon approval.</p>
    </div>
  `;
  return sendEmail(to, `New Team KYC Application — ${fullName}`, emailWrapper(body));
}

export async function sendTeamKycUpdateNotification(
  to: string,
  fullName: string,
  applicantEmail: string,
  eventTitle: string,
  eventDetail: string | null,
  occurredAt: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Team KYC Update — ${esc(eventTitle)}</h2>
    <p style="color: #475569; line-height: 1.6;">An update has been made to a team onboarding application.</p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1d4ed8; margin: 0; font-weight: 700; font-size: 16px;">${esc(fullName)}</p>
      <p style="color: #3b82f6; margin: 6px 0 0; font-size: 14px;">${esc(applicantEmail)}</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Update</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(eventTitle)}</td></tr>
      ${eventDetail ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Details</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${esc(eventDetail)}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">When</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${esc(occurredAt)}</td></tr>
    </table>
    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
      <p style="color: #92400e; margin: 0; font-size: 13px;">Log in to the Bullex admin panel and open Team KYC Applications to review this update.</p>
    </div>
  `;
  return sendEmail(to, `Team KYC Update — ${eventTitle} — ${fullName}`, emailWrapper(body));
}

export async function sendTeamKycConfirmation(
  to: string,
  fullName: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Application Received — Thank You</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${esc(fullName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      Your employment onboarding application has been successfully submitted to the Bullex Team. Our HR/Admin team will review your details and get back to you shortly.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">&#10003; Application Status: Submitted</p>
      <p style="color: #166534; margin: 8px 0 0; font-size: 13px;">Your statutory declaration has been recorded. All details are held securely and treated in strict confidence.</p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      Once your application is reviewed and approved, you will receive your Bullex platform login credentials by email.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      For any questions in the meantime, please contact HR at <a href="mailto:career@bullex.tech" style="color: #2563eb;">career@bullex.tech</a>.
    </p>
    <p style="color: #475569; margin: 24px 0 0;">Warm regards,<br /><strong>Bullfrog Group HR Team</strong></p>
  `;
  return sendEmail(to, "Bullex — Your Team KYC Application Has Been Received", emailWrapper(body));
}

export async function sendTeamMemberWelcomeEmail(
  to: string,
  fullName: string,
  position: string | null,
  employmentType: string | null,
  username: string | null,
  participantId: string | null = null,
): Promise<boolean> {
  const isAgent = (employmentType || "").toLowerCase() === "agent";
  const roleLine = position
    ? `${position}${employmentType ? ` (${employmentType})` : ""}`
    : (employmentType || "Team Member");
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Welcome to Bullfrog Group, ${escapeHtml(fullName)}</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${escapeHtml(fullName)},</p>
    <p style="color: #475569; line-height: 1.6;">
      On behalf of <strong>Bullfrog Group</strong>, it is our pleasure to welcome you on board as
      <strong>${escapeHtml(roleLine)}</strong>. We are delighted to have you join our team and look
      forward to a long, successful and rewarding association.
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 700;">&#10003; Your Team KYC has been approved</p>
      ${participantId ? `<p style="color: #166534; margin: 6px 0 0; font-size: 13px;">Your Bullfrog Group Participant ID: <strong style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(participantId)}</strong></p>` : ""}
      ${username ? `<p style="color: #166534; margin: 6px 0 0; font-size: 13px;">Your Bullex login username: <strong>${escapeHtml(username)}</strong> (password shared separately).</p>` : ""}
    </div>

    <h3 style="color: #1e293b; margin: 24px 0 8px;">About Bullex Trading Platform</h3>
    <p style="color: #475569; line-height: 1.6;">
      <strong>Bullex</strong> is the proprietary commodity trading platform of Bullfrog Group — an
      institutional-grade, blockchain-backed system used across our global operations to manage the
      full commodity trade lifecycle. It brings together client onboarding, trade execution, document
      generation, and immutable verification in a single, audited environment.
    </p>
    <ul style="color: #475569; line-height: 1.7; padding-left: 20px;">
      <li><strong>Client Onboarding &amp; KYC</strong> — institutional KYC capture with admin review and approval workflow.</li>
      <li><strong>Trade Lifecycle Management</strong> — track every deal from enquiry through pre-deal, deal, execution and final payment.</li>
      <li><strong>Document Generation</strong> — produce LOI, SCO, ICPO, Deal Recap, SPA, NCNDA, BL, COO and more, with digital signatures and PDF/DOCX export.</li>
      <li><strong>Blockchain Verification</strong> — every trade, KYC and amendment is hashed and recorded on our private ledger for tamper-evident provenance.</li>
      <li><strong>Client &amp; Team Portals</strong> — approved counterparties and our internal team each work in dedicated, role-aware portals.</li>
    </ul>

    <h3 style="color: #1e293b; margin: 24px 0 8px;">Your Role at Bullex</h3>
    <p style="color: #475569; line-height: 1.6;">
      ${isAgent
        ? `As an <strong>Agent</strong> of Bullfrog Group, you will use Bullex to introduce and manage prospective counterparties, log enquiries on behalf of clients you represent, and track the resulting deals through the platform. A Mutual Non-Circumvention Non-Disclosure Agreement (NCNDA) covering your engagement is being prepared and will be sent to you shortly for execution.`
        : `As part of the Bullex team, you will use the platform to support clients, originate and execute trades, prepare and circulate trade documentation, and contribute to the integrity of our blockchain-verified record of business.`
      }
    </p>

    <p style="color: #475569; line-height: 1.6;">
      Please complete any pending document signatures sent to you separately, and reach out to
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a> with any questions
      about access, training or your first steps on the platform.
    </p>

    <p style="color: #475569; margin: 24px 0 0;">Warm welcome and best wishes,<br /><strong>Vaman Kumar</strong><br />CEO, Bullfrog Group</p>
  `;
  return sendEmail(to, `Welcome to Bullfrog Group — ${fullName}`, emailWrapper(body));
}

export async function sendTeamMemberPasswordResetLinkEmail(
  to: string,
  fullName: string,
  username: string,
  resetUrl: string,
  expiryHours: number,
): Promise<boolean> {
  const safeName = escapeHtml(fullName || "Team Member");
  const safeUser = escapeHtml(username);
  const safeUrl = escapeHtml(resetUrl);
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Reset Your Bullex Password</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${safeName},</p>
    <p style="color: #475569; line-height: 1.6;">
      A Bullfrog Group administrator has initiated a password reset for your Bullex Trading Platform account
      (username: <strong>${safeUser}</strong>). Click the secure link below to set a new password of your choice.
      The link will expire in <strong>${esc(expiryHours)} hour${expiryHours === 1 ? "" : "s"}</strong> and can only be used once.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;background:#990000;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.05em;text-transform:uppercase;border-radius:4px;">
        Set New Password
      </a>
    </div>
    <p style="color: #64748b; line-height: 1.6; font-size: 12px;">
      If the button doesn't work, copy and paste this URL into your browser:<br/>
      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;color:#334155;">${safeUrl}</span>
    </p>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px;margin:18px 0;color:#92400e;font-size:13px;line-height:1.55;">
      <strong>Security notice:</strong> If you did not expect this reset, you may ignore this email — the link will expire automatically.
      For any concerns, contact <a href="mailto:docs@bullfrog-group.com" style="color:#92400e;">docs@bullfrog-group.com</a>.
    </div>
    <p style="color:#475569;margin:24px 0 0;">Regards,<br/><strong>Bullfrog Group — Bullex Team</strong></p>
  `;
  return sendEmail(to, "Bullex — Reset Your Password", emailWrapper(body), undefined, undefined, "docs@bullfrog-group.com");
}

export async function sendClientPasswordResetLinkEmail(
  to: string,
  fullName: string,
  username: string,
  resetUrl: string,
  expiryHours: number,
): Promise<boolean> {
  const safeName = escapeHtml(fullName || "Client");
  const safeUser = escapeHtml(username);
  const safeUrl = escapeHtml(resetUrl);
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Reset Your Bullex Client Password</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${safeName},</p>
    <p style="color: #475569; line-height: 1.6;">
      A Bullfrog Group administrator has initiated a password reset for your Bullex Client Portal account
      (username: <strong>${safeUser}</strong>). Click the secure link below to set a new password.
      The link expires in <strong>${esc(expiryHours)} hour${expiryHours === 1 ? "" : "s"}</strong> and can be used only once.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;background:#990000;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.05em;text-transform:uppercase;border-radius:4px;">
        Set New Password
      </a>
    </div>
    <p style="color: #64748b; line-height: 1.6; font-size: 12px;">
      If the button doesn't work, copy and paste this URL into your browser:<br/>
      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;color:#334155;">${safeUrl}</span>
    </p>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px;margin:18px 0;color:#92400e;font-size:13px;line-height:1.55;">
      <strong>Security notice:</strong> If you did not expect this reset, ignore this email and contact
      <a href="mailto:docs@bullfrog-group.com" style="color:#92400e;">docs@bullfrog-group.com</a>.
    </div>
    <p style="color:#475569;margin:24px 0 0;">Regards,<br/><strong>Bullfrog Group — Bullex Team</strong></p>
  `;
  return sendEmail(to, "Bullex Client Portal — Reset Your Password", emailWrapper(body), undefined, undefined, "docs@bullfrog-group.com");
}

export async function sendTeamMemberPasswordChangedEmail(
  to: string,
  fullName: string,
  username: string,
  newPassword: string,
): Promise<boolean> {
  const safeName = escapeHtml(fullName || "Team Member");
  const safeUser = escapeHtml(username);
  const safePass = escapeHtml(newPassword);
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Your Bullex Password Has Been Updated</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${safeName},</p>
    <p style="color: #475569; line-height: 1.6;">
      This is a confirmation that your Bullex Trading Platform login password was changed by a Bullfrog Group administrator.
      Please use the new credentials below for your next sign in.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="color:#1e293b;margin:0 0 6px;font-size:13px;"><strong>Username:</strong> <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${safeUser}</span></p>
      <p style="color:#1e293b;margin:0;font-size:13px;"><strong>New password:</strong> <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${safePass}</span></p>
    </div>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px;margin:18px 0;color:#92400e;font-size:13px;line-height:1.55;">
      <strong>Security notice:</strong> If you did not request this change, please contact
      <a href="mailto:docs@bullfrog-group.com" style="color:#92400e;">docs@bullfrog-group.com</a> immediately.
      For your safety, we recommend updating this password to one only you know after your next sign in.
    </div>
    <p style="color:#475569;margin:24px 0 0;">Regards,<br/><strong>Bullfrog Group — Bullex Team</strong></p>
  `;
  return sendEmail(to, "Bullex — Your Password Has Been Updated", emailWrapper(body));
}

export async function sendKycApplicationPdfEmail(
  to: string,
  recipientName: string,
  companyName: string,
  pdfFilePath: string,
  senderName?: string,
  message?: string,
  ccEmail?: string,
): Promise<boolean> {
  let pdfBase64 = "";
  try {
    const pdfBuffer = fs.readFileSync(pdfFilePath);
    pdfBase64 = pdfBuffer.toString("base64");
  } catch (err) {
    console.error("[email] Failed to read KYC PDF for attachment:", err);
    return false;
  }

  const safeName = companyName.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
  const filename = `KYC_Application_${safeName || "Bullex"}.pdf`;

  const safeCompany = escapeHtml(companyName);
  const safeRecipient = escapeHtml(recipientName || "Sir/Madam");
  const safeSender = senderName ? escapeHtml(senderName) : "";
  const safeMessage = message ? escapeHtml(message).replace(/\n/g, "<br/>") : "";
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Application — ${safeCompany}</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${safeRecipient},</p>
    <p style="color: #475569; line-height: 1.6;">
      Please find attached the KYC application form for <strong>${safeCompany}</strong>, issued via the Bullex Trading Platform${safeSender ? ` by ${safeSender}` : ""}.
    </p>
    ${safeMessage ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:18px 0;color:#334155;font-size:14px;line-height:1.55;"><strong style="color:#1e293b;">Message:</strong><br/>${safeMessage}</div>` : ""}
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please contact our team at
      <a href="mailto:docs@bullfrog-group.com" style="color: #2563eb;">docs@bullfrog-group.com</a>.
    </p>
  `;

  const attachments: EmailAttachment[] = [{ filename, content: pdfBase64 }];
  const ccList = ccEmail ? [ccEmail] : undefined;
  return sendEmail(to, `KYC Application — ${companyName}`, emailWrapper(body), attachments, ccList);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function sendBlankKycApplicationPdfEmail(
  to: string,
  recipientName: string,
  pdfFilePath: string,
  senderName?: string,
  message?: string,
  ccEmail?: string,
): Promise<boolean> {
  let pdfBase64 = "";
  try {
    const pdfBuffer = fs.readFileSync(pdfFilePath);
    pdfBase64 = pdfBuffer.toString("base64");
  } catch (err) {
    console.error("[email] Failed to read blank KYC PDF for attachment:", err);
    return false;
  }

  const filename = `Bullex_KYC_Application_Form.pdf`;
  const safeName = escapeHtml(recipientName || "Sir/Madam");
  const safeSender = senderName ? escapeHtml(senderName) : "";
  const safeMessage = message ? escapeHtml(message).replace(/\n/g, "<br/>") : "";
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Bullex KYC Application Form</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${safeName},</p>
    <p style="color: #475569; line-height: 1.6;">
      Please find attached the <strong>Bullex KYC Application Form</strong>${safeSender ? `, sent by ${safeSender}` : ""}. Kindly complete every section in block capitals and return the signed form, along with the requested supporting documents, to <a href="mailto:docs@bullfrog-group.com" style="color:#2563eb;">docs@bullfrog-group.com</a>.
    </p>
    ${safeMessage ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:18px 0;color:#334155;font-size:14px;line-height:1.55;"><strong style="color:#1e293b;">Message:</strong><br/>${safeMessage}</div>` : ""}
    <p style="color: #475569; line-height: 1.6;">
      Once received, our onboarding team will review your application and revert with the next steps. If preferred, you may complete the application online via our portal.
    </p>
  `;

  const attachments: EmailAttachment[] = [{ filename, content: pdfBase64 }];
  const ccList = ccEmail ? [ccEmail] : undefined;
  return sendEmail(to, "Bullex KYC Application Form", emailWrapper(body), attachments, ccList);
}

export async function sendEnquiryOnboardingInviteEmail(to: string, enquiryUrl: string, senderName?: string): Promise<boolean> {
  const safeUrl = enquiryUrl;
  const safeSender = senderName ? escapeHtml(senderName) : "";
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Trade Enquiry Invitation</h2>
    <p style="color: #475569; line-height: 1.6;">
      You have been invited${safeSender ? ` by <strong>${safeSender}</strong>` : ""} to submit a trade enquiry through the <strong>Bullex Commodity Trading Platform</strong>.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      Click the button below to share your commodity requirements (product, quantity, loading port, Incoterms, validity, etc.). Our trade desk will revert with a quotation.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${safeUrl}" style="display: inline-block; background: #990000; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 700; font-size: 15px; letter-spacing: 0.05em;">
        SUBMIT TRADE ENQUIRY
      </a>
    </div>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
      Or copy and paste this link into your browser:<br/>
      <a href="${safeUrl}" style="color: #2563eb; word-break: break-all;">${safeUrl}</a>
    </p>
    <p style="color: #475569; line-height: 1.6;">
      For any questions, please contact our trade desk at
      <a href="mailto:trade@bullfrog-group.com" style="color: #2563eb;">trade@bullfrog-group.com</a>.
    </p>
  `;
  return sendEmail(to, "Bullex – Trade Enquiry Invitation", emailWrapper(body));
}
