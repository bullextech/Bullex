import fs from "fs";
import path from "path";

interface EmailAttachment {
  filename: string;
  content: string;
}

async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[], cc?: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not set, skipping email");
    return false;
  }

  try {
    const payload: Record<string, any> = {
      from: process.env.EMAIL_FROM || "Bullex Trading Platform <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    };
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments;
    }
    if (cc && cc.length > 0) {
      payload.cc = cc;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[email] Failed to send email:", errorData);
      return false;
    }

    console.log(`[email] Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error("[email] Error sending email:", error);
    return false;
  }
}

function emailWrapper(body: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1a2e; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Bullex Trading Platform</h1>
        <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Commodity Trading Platform</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
        ${body}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          This is an automated message from Bullex Commodity Trading Platform. Please do not reply to this email.
        </p>
      </div>
      <div style="background: #990000; padding: 24px 16px; text-align: center; border-radius: 0 0 8px 8px; margin-top: 12px;">
        <p style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.3;">
          Bullex is a proprietary platform of Bullfrog Group.
        </p>
      </div>
    </div>
  `;
}

export async function sendKycConfirmationEmail(
  to: string,
  companyName: string,
  signatoryName: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Application Submitted Successfully</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${signatoryName},</p>
    <p style="color: #475569; line-height: 1.6;">
      Thank you for submitting the KYC application for <strong>${companyName}</strong> on the Bullex Trading Platform.
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
      <a href="mailto:team@bullex.tech" style="color: #2563eb;">team@bullex.tech</a>.
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
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Company Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${companyName}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Person</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${contactName}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${contactEmail}</td></tr>
      ${businessType ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Business Type</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${businessType}</td></tr>` : ""}
      ${countryOfOperation ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Country of Operation</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${countryOfOperation}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Submitted At</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${submittedAt}</td></tr>
    </table>
    <p style="color: #475569; line-height: 1.6;">
      Log in to the admin panel at <a href="mailto:team@bullex.tech" style="color: #2563eb;">Bullex Admin</a> to take action on this application.
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
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Company Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${companyName}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Person</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${contactName}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${contactEmail}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Action Taken</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${actionLabel}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px;">Date</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>
    </table>
    ${reviewNotes ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Review Notes</p>
      <p style="color: #1d4ed8; margin: 8px 0 0; font-size: 14px;">${reviewNotes}</p>
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
  clientPassword?: string | null
): Promise<boolean> {
  const detailsRows = [
    category ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Category</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${category}</td></tr>` : "",
    products ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Products</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${products}</td></tr>` : "",
  ].filter(Boolean).join("");

  const credentialsBlock = (clientUsername && clientPassword) ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Client Portal Login Credentials</p>
      <p style="color: #1d4ed8; margin: 8px 0 0; font-size: 14px;">
        You can now access the Client Portal to view your trades and documents.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 12px 0 0; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 100px;">Username:</td><td style="color: #1e293b; font-weight: 600;">${clientUsername}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0; width: 100px;">Password:</td><td style="color: #1e293b; font-weight: 600;">${clientPassword}</td></tr>
      </table>
      <p style="color: #64748b; margin: 12px 0 0; font-size: 12px;">
        Please keep these credentials secure and do not share them with unauthorized persons.
      </p>
    </div>
  ` : "";

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Application Approved</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${signatoryName},</p>
    <p style="color: #475569; line-height: 1.6;">
      We are pleased to inform you that the KYC application for <strong>${companyName}</strong> has been reviewed and <strong>approved</strong> by our compliance team.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Application Status: Approved</p>
      <p style="color: #15803d; margin: 8px 0 0; font-size: 14px;">
        Your organisation is now registered as a verified participant on the Bullex Trading Platform.
      </p>
    </div>
    ${detailsRows ? `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Company</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${companyName}</td></tr>
      ${detailsRows}
    </table>
    ` : ""}
    ${credentialsBlock}
    <p style="color: #475569; line-height: 1.6;">
      You may now participate in commodity trades on the platform. For any trade inquiries, please contact our trade desk at
      <a href="mailto:trade@bullex.tech" style="color: #2563eb;">trade@bullex.tech</a>.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please contact our team at
      <a href="mailto:team@bullex.tech" style="color: #2563eb;">team@bullex.tech</a>.
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
    <p style="color: #475569; line-height: 1.6;">Dear ${signatoryName},</p>
    <p style="color: #475569; line-height: 1.6;">
      We regret to inform you that the KYC application for <strong>${companyName}</strong> has been reviewed and <strong>rejected</strong> by our compliance team.
    </p>
    ${reviewNotes ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Reason for Rejection</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">${reviewNotes}</p>
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
      <a href="mailto:team@bullex.tech" style="color: #2563eb;">team@bullex.tech</a>.
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
    .map(([key, value]) => `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${fieldLabels[key] || key}</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${value}</td></tr>`)
    .join("");

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Change Request Approved</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${contactName},</p>
    <p style="color: #475569; line-height: 1.6;">
      The change request for <strong>${companyName}</strong> has been reviewed and <strong>approved</strong> by our compliance team. The following updates have been applied to your KYC record:
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Updated Value</th></tr>
      ${changesRows}
    </table>
    ${adminNotes ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Admin Notes</p>
      <p style="color: #1d4ed8; margin: 8px 0 0; font-size: 14px;">${adminNotes}</p>
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
      <a href="mailto:team@bullex.tech" style="color: #2563eb;">team@bullex.tech</a>.
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
    .map(([key, value]) => `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${fieldLabels[key] || key}</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${value}</td></tr>`)
    .join("");

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">KYC Change Request Rejected</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${contactName},</p>
    <p style="color: #475569; line-height: 1.6;">
      The change request for <strong>${companyName}</strong> has been reviewed and <strong>rejected</strong> by our compliance team. The following proposed changes were not applied:
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Proposed Value</th></tr>
      ${changesRows}
    </table>
    ${adminNotes ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Reason for Rejection</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">${adminNotes}</p>
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
      <a href="mailto:team@bullex.tech" style="color: #2563eb;">team@bullex.tech</a>.
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
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Full Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${fullName}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${email}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Phone Number</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${phone || "—"}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Address</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${address || "—"}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px;">Role Applied For</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${roleTitle}</td></tr>
    </table>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e293b; margin: 0 0 8px; font-weight: 600;">About the Applicant</p>
      <p style="color: #475569; margin: 0; line-height: 1.7; font-size: 14px; white-space: pre-wrap;">${aboutYourself || "(No description provided)"}</p>
    </div>
    ${attachmentFilename ? `<p style="color: #475569; font-size: 13px;">A document (<strong>${attachmentFilename}</strong>) has been attached to this email.</p>` : ""}
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
    <p style="color: #475569; line-height: 1.6;">Dear ${fullName},</p>
    <p style="color: #475569; line-height: 1.6;">
      Thank you for your interest in joining <strong>Bullex Commodity Trading Platform</strong>. We have received your application for the following position:
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; margin: 0; font-weight: 600;">Position Applied For</p>
      <p style="color: #1d4ed8; margin: 8px 0 0; font-size: 16px; font-weight: 600;">${roleTitle}</p>
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
    <p style="color: #475569; line-height: 1.6;">Dear ${recipientName},</p>
    <p style="color: #475569; line-height: 1.6;">
      A trade document has been sent to you for review and acceptance via the Bullex Trading Platform:
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 120px;">Document Type:</td><td style="color: #1e293b; font-weight: 600;">${fullType} (${docType})</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Title:</td><td style="color: #1e293b; font-weight: 600;">${docTitle}</td></tr>
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
      <a href="mailto:trade@bullex.tech" style="color: #2563eb;">trade@bullex.tech</a>.
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
    <p style="color: #475569; line-height: 1.6;">Dear ${recipientName},</p>
    <p style="color: #475569; line-height: 1.6;">
      An amendment has been requested for the following trade document on the Bullex Trading Platform:
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 120px;">Document Type:</td><td style="color: #1e293b; font-weight: 600;">${fullType} (${docType})</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Title:</td><td style="color: #1e293b; font-weight: 600;">${docTitle}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Requested By:</td><td style="color: #1e293b; font-weight: 600;">${requestedBy}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Date:</td><td style="color: #1e293b; font-weight: 600;">${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>
      </table>
    </div>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Amendment Notes</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">${amendmentNotes}</p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      Please review the requested changes and amend the document accordingly. Once amended, the document can be resent for approval.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      For any trade inquiries, please contact our trade desk at
      <a href="mailto:trade@bullex.tech" style="color: #2563eb;">trade@bullex.tech</a>.
    </p>
  `;
  return sendEmail(to, `Amendment Requested: ${fullType} (${docType}) – ${docTitle}`, emailWrapper(body));
}

export async function sendDocumentEmail(
  to: string,
  recipientName: string,
  docType: string,
  docTitle: string,
  role: "Buyer" | "Seller" | "Party A" | "Party B",
  pdfFilePath: string,
  ccEmail?: string
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

  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Trade Document Issued</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${recipientName},</p>
    <p style="color: #475569; line-height: 1.6;">
      Please find attached the following trade document issued via the Bullex Trading Platform:
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="color: #64748b; padding: 6px 0; width: 120px;">Document Type:</td><td style="color: #1e293b; font-weight: 600;">${fullType} (${docType})</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Title:</td><td style="color: #1e293b; font-weight: 600;">${docTitle}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Your Role:</td><td style="color: #1e293b; font-weight: 600;">${role}</td></tr>
        <tr><td style="color: #64748b; padding: 6px 0;">Date Issued:</td><td style="color: #1e293b; font-weight: 600;">${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>
      </table>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      The PDF document is attached to this email. Please review the document carefully and contact our trade desk if you have any questions.
    </p>
    <p style="color: #475569; line-height: 1.6;">
      For any trade inquiries, please contact our trade desk at
      <a href="mailto:trade@bullex.tech" style="color: #2563eb;">trade@bullex.tech</a>.
    </p>
  `;

  const attachments: EmailAttachment[] = [{
    filename: `${docType}_${docTitle.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.pdf`,
    content: pdfBase64,
  }];

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
      <a href="${kycUrl}" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 700; font-size: 15px; letter-spacing: 0.05em;">
        START KYC APPLICATION
      </a>
    </div>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
      Or copy and paste this link into your browser:<br/>
      <a href="${kycUrl}" style="color: #2563eb; word-break: break-all;">${kycUrl}</a>
    </p>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions about the process, please contact our team at
      <a href="mailto:team@bullex.tech" style="color: #2563eb;">team@bullex.tech</a>.
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
    <p style="color: #475569; line-height: 1.6;">Dear ${fullName},</p>
    <p style="color: #475569; line-height: 1.6;">
      We are pleased to inform you that your registration as a <strong>${roleType}</strong> for <strong>${companyName}</strong> has been reviewed and <strong>approved</strong> by our team.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Registration Status: Approved</p>
      <p style="color: #15803d; margin: 8px 0 0; font-size: 14px;">
        Our onboarding team will be in touch shortly to guide you through the KYC verification process and grant you access to the platform.
      </p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      For any questions, please contact our team at
      <a href="mailto:trade@bullex.tech" style="color: #2563eb;">trade@bullex.tech</a>.
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
    <p style="color: #475569; line-height: 1.6;">Dear ${fullName},</p>
    <p style="color: #475569; line-height: 1.6;">
      Thank you for your interest in the Bullex Commodity Trading Platform. After reviewing your registration as a <strong>${roleType}</strong> for <strong>${companyName}</strong>, we are unable to proceed at this time.
    </p>
    ${reviewNotes ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Reason</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">${reviewNotes}</p>
    </div>
    ` : `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">Registration Status: Not Approved</p>
      <p style="color: #b91c1c; margin: 8px 0 0; font-size: 14px;">Your registration did not meet our current requirements.</p>
    </div>
    `}
    <p style="color: #475569; line-height: 1.6;">
      If you believe this was in error or would like to discuss further, please contact us at
      <a href="mailto:trade@bullex.tech" style="color: #2563eb;">trade@bullex.tech</a>.
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
    <p style="color: #475569; line-height: 1.6;">Dear ${fullName},</p>
    <p style="color: #475569; line-height: 1.6;">
      Thank you for registering with the <strong>Bullex Commodity Trading Platform</strong>. We have received your registration as a <strong>${roleType}</strong> for <strong>${companyName}</strong>.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Registration Status: Received</p>
      <p style="color: #15803d; margin: 8px 0 0; font-size: 14px;">
        Our team will review your registration and reach out to you shortly to guide you through the next steps, including KYC verification.
      </p>
    </div>
    <p style="color: #475569; line-height: 1.6;">
      If you have any questions, please contact our team at
      <a href="mailto:team@bullex.tech" style="color: #2563eb;">team@bullex.tech</a>.
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
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Full Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${fullName}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Company Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${companyName}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${email}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Phone</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${phone}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Country</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${country}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Role Type</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${roleType}</td></tr>
      ${commodities ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Commodities of Interest</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${commodities}</td></tr>` : ""}
      ${message ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Message</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${message}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Submitted At</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${submittedAt}</td></tr>
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
  const TRADE_EMAIL = "trade@bullex.tech";
  const sideLabel = enquiry.side === "sell" ? "SELL" : "BUY";
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">New Trade Enquiry Submitted</h2>
    <p style="color: #475569; line-height: 1.6;">A new trade enquiry has been created on the Bullex Trading Platform.</p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1d4ed8; margin: 0; font-weight: 600; font-size: 18px;">${enquiry.enquiryRef} — ${sideLabel} ${enquiry.product}</p>
      ${enquiry.quantity ? `<p style="color: #1e40af; margin: 6px 0 0; font-size: 14px;">${enquiry.quantity} ${enquiry.unit || "MT"}</p>` : ""}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Enquiry Ref</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.enquiryRef}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Side</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${sideLabel}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Product</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.product}</td></tr>
      ${enquiry.quantity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Quantity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.quantity} ${enquiry.unit || "MT"}</td></tr>` : ""}
      ${enquiry.specifications ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Specifications</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${enquiry.specifications}</td></tr>` : ""}
      ${enquiry.producer ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Producer / Source</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.producer}</td></tr>` : ""}
      ${enquiry.loadingPort ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Loading Port</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.loadingPort}</td></tr>` : ""}
      ${enquiry.incoterms ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Incoterms</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.incoterms}</td></tr>` : ""}
      ${enquiry.validity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Validity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.validity}</td></tr>` : ""}
      ${enquiry.createdBy ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Created By</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.createdBy}</td></tr>` : ""}
      ${enquiry.email ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Contact Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.email}</td></tr>` : ""}
      ${enquiry.additionalInfo ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Additional Info</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${enquiry.additionalInfo}</td></tr>` : ""}
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
  const TRADE_EMAIL = "trade@bullex.tech";
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
      <p style="color: ${style.text}; margin: 0; font-weight: 700; font-size: 18px;">Status: ${style.label}</p>
      <p style="color: ${style.text}; margin: 6px 0 0; font-size: 14px;">${enquiry.enquiryRef} — ${sideLabel} ${enquiry.product}${enquiry.quantity ? ` | ${enquiry.quantity} ${enquiry.unit || "MT"}` : ""}</p>
      ${tradeNote}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Enquiry Ref</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.enquiryRef}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">New Status</td><td style="color: ${style.text}; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${style.label}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Side</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${sideLabel}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Product</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.product}</td></tr>
      ${enquiry.quantity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Quantity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.quantity} ${enquiry.unit || "MT"}</td></tr>` : ""}
      ${enquiry.loadingPort ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Loading Port</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.loadingPort}</td></tr>` : ""}
      ${enquiry.incoterms ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Incoterms</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.incoterms}</td></tr>` : ""}
      ${enquiry.validity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Validity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.validity}</td></tr>` : ""}
      ${enquiry.createdBy ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Created By</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.createdBy}</td></tr>` : ""}
      ${enquiry.email ? `<tr><td style="color: #64748b; padding: 8px 12px;">Company Email</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;"><a href="mailto:${enquiry.email}" style="color: #1d4ed8;">${enquiry.email}</a></td></tr>` : ""}
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
  const TRADE_EMAIL = "trade@bullex.tech";
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
      <p style="color: ${textColor}; margin: 0; font-weight: 700; font-size: 16px;">${clientCompany} has ${responseLabel} enquiry ${enquiry.enquiryRef}</p>
      <p style="color: ${textColor}; margin: 6px 0 0; font-size: 14px;">${sideLabel} ${enquiry.product}${enquiry.quantity ? ` — ${enquiry.quantity} ${enquiry.unit || "MT"}` : ""}</p>
      ${accepted ? `<p style="color: ${textColor}; margin: 6px 0 0; font-size: 13px; font-weight: 600;">A new trade has been automatically initiated from this enquiry.</p>` : ""}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;"><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th><th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Enquiry Ref</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.enquiryRef}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Product</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.product}</td></tr>
      ${enquiry.quantity ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Quantity</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.quantity} ${enquiry.unit || "MT"}</td></tr>` : ""}
      ${enquiry.loadingPort ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Loading Port</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.loadingPort}</td></tr>` : ""}
      ${enquiry.incoterms ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Incoterms</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${enquiry.incoterms}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Client Response</td><td style="color: ${textColor}; padding: 8px 12px; font-weight: 700;">${responseLabel}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px;">Responded By</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${clientCompany}</td></tr>
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
    <p style="color: #475569; line-height: 1.6;">Dear ${candidateName || "Candidate"},</p>
    <p style="color: #475569; line-height: 1.6;">
      You have been invited by the HR team at <strong>Bullfrog Group</strong> to complete your Staff Onboarding KYC application on the Bullex platform.
    </p>
    ${position || department ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
      ${position ? `<p style="color: #1d4ed8; margin: 0; font-size: 14px;"><strong>Position:</strong> ${position}</p>` : ""}
      ${department ? `<p style="color: #1d4ed8; margin: ${position ? "6px" : "0"} 0 0; font-size: 14px;"><strong>Department:</strong> ${department}</p>` : ""}
    </div>
    ` : ""}
    ${personalMessage ? `
    <div style="background: #f8fafc; border-left: 4px solid #e2e8f0; padding: 12px 16px; margin: 20px 0;">
      <p style="color: #475569; margin: 0; font-style: italic; font-size: 14px;">"${personalMessage}"</p>
    </div>
    ` : ""}
    <p style="color: #475569; line-height: 1.6;">
      Please click the button below to access your personalised KYC form. Complete all sections accurately — your application will be reviewed by our admin team, and upon approval, your Bullex login credentials will be sent to you.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${kycUrl}" style="background: #dc2626; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; letter-spacing: 0.5px;">
        Complete Your KYC Application →
      </a>
    </div>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
      Or copy this link: <a href="${kycUrl}" style="color: #2563eb;">${kycUrl}</a>
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
      <p style="color: #1d4ed8; margin: 0; font-weight: 700; font-size: 16px;">${fullName}</p>
      <p style="color: #3b82f6; margin: 6px 0 0; font-size: 14px;">${applicantEmail}</p>
      ${position ? `<p style="color: #3b82f6; margin: 4px 0 0; font-size: 13px;">Role: ${position}${department ? ` · ${department}` : ""}</p>` : ""}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr style="background: #f8fafc;">
        <th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Field</th>
        <th style="text-align: left; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0;">Details</th>
      </tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Applicant Name</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${fullName}</td></tr>
      <tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Email</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${applicantEmail}</td></tr>
      ${position ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Position Applied</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${position}</td></tr>` : ""}
      ${department ? `<tr><td style="color: #64748b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Department</td><td style="color: #1e293b; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${department}</td></tr>` : ""}
      <tr><td style="color: #64748b; padding: 8px 12px;">Submitted</td><td style="color: #1e293b; padding: 8px 12px; font-weight: 600;">${submittedAt}</td></tr>
    </table>
    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
      <p style="color: #92400e; margin: 0; font-size: 13px;">Please log in to the Bullex admin panel, navigate to Team KYC Applications, and review the submission to allocate login credentials upon approval.</p>
    </div>
  `;
  return sendEmail(to, `New Team KYC Application — ${fullName}`, emailWrapper(body));
}

export async function sendTeamKycConfirmation(
  to: string,
  fullName: string
): Promise<boolean> {
  const body = `
    <h2 style="color: #1e293b; margin: 0 0 16px;">Application Received — Thank You</h2>
    <p style="color: #475569; line-height: 1.6;">Dear ${fullName},</p>
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
