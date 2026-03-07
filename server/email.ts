export async function sendKycConfirmationEmail(
  to: string,
  companyName: string,
  signatoryName: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not set, skipping KYC confirmation email");
    return false;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1a2e; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Bullex Trading Platform</h1>
        <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Commodity Trading Platform</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
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
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          This is an automated message from Bullex Commodity Trading Platform. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Bullex Trading Platform <onboarding@resend.dev>",
        to: [to],
        subject: `KYC Application Submitted – ${companyName}`,
        html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[email] Failed to send KYC confirmation:", errorData);
      return false;
    }

    console.log(`[email] KYC confirmation sent to ${to} for ${companyName}`);
    return true;
  } catch (error) {
    console.error("[email] Error sending KYC confirmation:", error);
    return false;
  }
}
