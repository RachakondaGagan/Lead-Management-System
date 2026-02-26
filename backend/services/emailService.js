// ──────────────────────────────────────────────────────────────
// services/emailService.js — Resend-Powered Outreach Engine
// ──────────────────────────────────────────────────────────────
//
// ARCHITECTURE: Resend SDK + Dynamic Template Compiler
// ─────────────────────────────────────────────────────
// 1. Fetch the user's saved EmailTemplate from MongoDB
// 2. compileTemplate() replaces {{tags}} with real lead data
// 3. Wrap the compiled body in a minimal HTML shell
// 4. Send via resend.emails.send()
//
// SUPPORTED TAGS:
//   {{lead_name}}   → Lead's first name
//   {{company}}     → Lead's company
//   {{icebreaker}}  → AI-generated personalization hook
//
// FALLBACK: If RESEND_API_KEY is missing, simulates send.
// ──────────────────────────────────────────────────────────────

import { Resend } from "resend";
import EmailTemplate from "../models/EmailTemplate.js";

// ══════════════════════════════════════════════════════════════
// DEFAULT TEMPLATE (used when user hasn't saved one yet)
// ══════════════════════════════════════════════════════════════

const DEFAULT_SUBJECT = "Quick question for {{lead_name}} at {{company}}";
const DEFAULT_BODY = `Hi {{lead_name}},

{{icebreaker}}

I wanted to reach out because I believe we can help the team at {{company}} achieve significantly better results.

Would you be open to a quick 15-minute call this week to explore if there's a fit?

Best,
LeadFlow AI`;

// ══════════════════════════════════════════════════════════════
// TEMPLATE COMPILER
// ══════════════════════════════════════════════════════════════

/**
 * Replace all supported {{tags}} in a template string with
 * real lead data. Pure function — no side effects.
 *
 * @param {string} template — Raw template string with {{tags}}
 * @param {object} lead     — Lead document from MongoDB
 * @returns {string}        — Fully personalized string
 */
export function compileTemplate(template, lead) {
    const firstName = lead.fullName?.split(" ")[0] || "there";
    const company = lead.company || "your company";
    const icebreaker =
        lead.icebreaker ||
        `I came across your work at ${company} and was genuinely impressed by what your team is building.`;

    return template
        .replace(/\{\{lead_name\}\}/g, firstName)
        .replace(/\{\{company\}\}/g, company)
        .replace(/\{\{icebreaker\}\}/g, icebreaker);
}

// ══════════════════════════════════════════════════════════════
// HTML WRAPPER
// ══════════════════════════════════════════════════════════════

/**
 * Wrap a plain-text email body in a clean, deliverable HTML shell.
 * Preserves line breaks via <br> and avoids heavy templates.
 *
 * @param {string} text — Compiled plain-text body
 * @param {string} fromName — Sender display name
 * @returns {string} — HTML email
 */
function wrapInHtml(text, fromName) {
    const htmlBody = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;max-width:600px;width:100%;">
          <!-- Header bar -->
          <tr>
            <td style="background:#000000;padding:20px 32px;">
              <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-0.2px;">LeadFlow AI</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#1e293b;font-size:15px;line-height:1.75;">
              ${htmlBody}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Sent via LeadFlow AI · Unsubscribe
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════
// MAIN SEND FUNCTION
// ══════════════════════════════════════════════════════════════

/**
 * Send a personalized cold email to a lead using Resend.
 *
 * @param {Object} lead         — Lead document from MongoDB
 * @param {Object} senderConfig — { fromName, fromEmail, replyTo? }
 * @param {string} [userId]     — User ID to fetch their saved template
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
export async function sendColdEmail(lead, senderConfig, userId = null) {
    // ── Guard: No API key → simulate ──────────────────────────
    if (!process.env.RESEND_API_KEY) {
        console.log("⚠️ RESEND_API_KEY not set — simulating email send.");
        return {
            success: true,
            messageId: `simulated-${Date.now()}`,
            simulated: true,
        };
    }

    // ── 1. Fetch user's saved template (or use default) ────────
    let subjectTemplate = DEFAULT_SUBJECT;
    let bodyTemplate = DEFAULT_BODY;

    if (userId) {
        try {
            const savedTemplate = await EmailTemplate.findOne({ userId });
            if (savedTemplate) {
                subjectTemplate = savedTemplate.subject;
                bodyTemplate = savedTemplate.body;
            }
        } catch (err) {
            console.warn("⚠️ Could not load email template, using default:", err.message);
        }
    }

    // ── 2. Compile: replace {{tags}} with real lead data ───────
    const compiledSubject = compileTemplate(subjectTemplate, lead);
    const compiledBody = compileTemplate(bodyTemplate, lead);

    // ── 3. Build the HTML email ─────────────────────────────────
    const htmlEmail = wrapInHtml(compiledBody, senderConfig.fromName || "LeadFlow AI");

    // ── 4. Send via Resend ──────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromAddress = senderConfig.fromEmail
        ? `${senderConfig.fromName || "LeadFlow AI"} <${senderConfig.fromEmail}>`
        : `LeadFlow AI <onboarding@resend.dev>`; // Resend's test sender

    try {
        const { data, error } = await resend.emails.send({
            from: fromAddress,
            to: [lead.email],
            reply_to: senderConfig.replyTo || senderConfig.fromEmail,
            subject: compiledSubject,
            html: htmlEmail,
        });

        if (error) {
            console.error(`❌ Resend API error for ${lead.email}:`, error.message);
            return { success: false, error: error.message };
        }

        console.log(`✅ Email sent to ${lead.email} via Resend — ID: ${data.id}`);
        return { success: true, messageId: data.id };

    } catch (error) {
        console.error(`❌ Email send exception for ${lead.email}:`, error.message);
        return { success: false, error: error.message };
    }
}
