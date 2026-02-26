// ──────────────────────────────────────────────────────────────
// controllers/outreachController.js — Email & WhatsApp Outreach
// ──────────────────────────────────────────────────────────────
//
// POST /api/outreach/email     — Send cold email to a lead
// POST /api/outreach/whatsapp  — Send WhatsApp message to a lead
// ──────────────────────────────────────────────────────────────

import Lead from "../models/Lead.js";
import Campaign from "../models/Campaign.js";
import { sendColdEmail } from "../services/emailService.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";

/**
 * POST /api/outreach/email
 *
 * Body: {
 *   leadId: string (MongoDB ObjectId),
 *   senderConfig: { fromName, fromEmail, subject?, replyTo? }
 * }
 */
export async function handleSendEmail(req, res, next) {
    try {
        const { leadId, senderConfig } = req.body;

        // ── Validation ──────────────────────────────────────────
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "'leadId' is required.",
            });
        }

        if (!senderConfig || !senderConfig.fromEmail) {
            return res.status(400).json({
                success: false,
                message: "'senderConfig' with 'fromEmail' is required.",
            });
        }

        // ── Fetch the lead ──────────────────────────────────────
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found.",
            });
        }

        if (!lead.email) {
            return res.status(400).json({
                success: false,
                message: "This lead does not have an email address.",
            });
        }

        // ── Fetch parent campaign for ad copy context ───────────
        const campaign = lead.campaignId
            ? await Campaign.findById(lead.campaignId)
            : null;

        // ── Send the email ──────────────────────────────────────
        const result = await sendColdEmail(lead, senderConfig, campaign);

        if (result.success) {
            // Update lead status in MongoDB
            await Lead.findByIdAndUpdate(leadId, {
                outreachStatus: "email_sent",
            });

            res.json({
                success: true,
                data: {
                    leadId,
                    email: lead.email,
                    messageId: result.messageId,
                    simulated: result.simulated || false,
                    status: "email_sent",
                },
            });
        } else {
            res.status(500).json({
                success: false,
                message: `Failed to send email: ${result.error}`,
            });
        }
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/outreach/whatsapp
 *
 * Body: {
 *   leadId: string (MongoDB ObjectId),
 *   messageBody: string
 * }
 */
export async function handleSendWhatsApp(req, res, next) {
    try {
        const { leadId, messageBody } = req.body;

        // ── Validation ──────────────────────────────────────────
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "'leadId' is required.",
            });
        }

        if (!messageBody) {
            return res.status(400).json({
                success: false,
                message: "'messageBody' is required.",
            });
        }

        // ── Fetch the lead ──────────────────────────────────────
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found.",
            });
        }

        if (!lead.phone) {
            return res.status(400).json({
                success: false,
                message: "This lead does not have a phone number.",
            });
        }

        // ── Send the WhatsApp message ───────────────────────────
        const result = await sendWhatsAppMessage(lead.phone, messageBody);

        if (result.success) {
            // Update lead status in MongoDB
            await Lead.findByIdAndUpdate(leadId, {
                outreachStatus: "whatsapp_sent",
            });

            res.json({
                success: true,
                data: {
                    leadId,
                    phone: lead.phone,
                    messageSid: result.messageSid,
                    simulated: result.simulated || false,
                    status: "whatsapp_sent",
                },
            });
        } else {
            res.status(500).json({
                success: false,
                message: `Failed to send WhatsApp: ${result.error}`,
            });
        }
    } catch (error) {
        next(error);
    }
}
