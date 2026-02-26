// ──────────────────────────────────────────────────────────────
// services/emailService.js — Cold Email Outreach via Nodemailer
// ──────────────────────────────────────────────────────────────
//
// Sends personalized cold emails using SMTP (via Nodemailer).
// Personalizes the email with lead-specific data (icebreaker,
// company name, job title) for higher response rates.
// ──────────────────────────────────────────────────────────────

import nodemailer from "nodemailer";

/**
 * Create an SMTP transporter from environment variables.
 * Supports Gmail, SendGrid, AWS SES, or any SMTP provider.
 */
function createTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",  // true for 465, false for 587
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

/**
 * Send a personalized cold email to a lead.
 *
 * @param {Object} lead         — Lead document from MongoDB
 * @param {Object} senderConfig — { fromName, fromEmail, subject?, replyTo? }
 * @param {Object} campaign     — Campaign document (for ad copy context)
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
export async function sendColdEmail(lead, senderConfig, campaign = null) {
    // ── Guard: Check SMTP credentials ───────────────────────────
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log("⚠️ SMTP credentials not set — simulating email send.");
        return {
            success: true,
            messageId: `mock-${Date.now()}`,
            simulated: true,
        };
    }

    const transporter = createTransporter();

    // ── Build the personalized email ────────────────────────────
    const firstName = lead.fullName?.split(" ")[0] || "there";
    const icebreaker = lead.icebreaker || `I came across your work at ${lead.company || "your company"} and was impressed.`;
    const adCopy = campaign?.adCreativeConcept?.ad_copy || "";

    const subject = senderConfig.subject
        || `Quick question for ${firstName} at ${lead.company || "your team"}`;

    const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; color: #1e293b;">
            <p style="font-size: 15px; line-height: 1.7;">Hi ${firstName},</p>
            
            <p style="font-size: 15px; line-height: 1.7;">${icebreaker}</p>
            
            <p style="font-size: 15px; line-height: 1.7;">
                ${adCopy || "I wanted to reach out because I believe we can help your team achieve significantly better results."}
            </p>
            
            <p style="font-size: 15px; line-height: 1.7;">
                Would you be open to a quick 15-minute call this week to explore if there's a fit?
            </p>
            
            <p style="font-size: 15px; line-height: 1.7;">
                Best,<br/>
                <strong>${senderConfig.fromName || "LeadFlow AI"}</strong>
            </p>
        </div>
    `;

    const textBody = [
        `Hi ${firstName},`,
        "",
        icebreaker,
        "",
        adCopy || "I wanted to reach out because I believe we can help your team achieve significantly better results.",
        "",
        "Would you be open to a quick 15-minute call this week to explore if there's a fit?",
        "",
        `Best,`,
        senderConfig.fromName || "LeadFlow AI",
    ].join("\n");

    try {
        const info = await transporter.sendMail({
            from: `"${senderConfig.fromName || "LeadFlow AI"}" <${senderConfig.fromEmail || process.env.SMTP_USER}>`,
            to: lead.email,
            replyTo: senderConfig.replyTo || senderConfig.fromEmail || process.env.SMTP_USER,
            subject,
            text: textBody,
            html: htmlBody,
        });

        console.log(`✅ Email sent to ${lead.email} — Message ID: ${info.messageId}`);

        return {
            success: true,
            messageId: info.messageId,
        };
    } catch (error) {
        console.error(`❌ Email send error for ${lead.email}:`, error.message);

        return {
            success: false,
            error: error.message,
        };
    }
}
