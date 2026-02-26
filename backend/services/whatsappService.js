// ──────────────────────────────────────────────────────────────
// services/whatsappService.js — Twilio WhatsApp Outreach
// ──────────────────────────────────────────────────────────────
//
// Sends WhatsApp messages to leads via Twilio's WhatsApp
// Business API. Supports the Twilio sandbox for development
// and production WhatsApp Business numbers.
// ──────────────────────────────────────────────────────────────

import twilio from "twilio";

/**
 * Send a WhatsApp message to a lead via Twilio.
 *
 * @param {string} toPhoneNumber — Lead's phone number (E.164 format, e.g. +14155551234)
 * @param {string} messageBody   — The message text to send
 * @returns {{ success: boolean, messageSid?: string, error?: string }}
 */
export async function sendWhatsAppMessage(toPhoneNumber, messageBody) {
    // ── Guard: Check Twilio credentials ─────────────────────────
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886"; // Twilio sandbox default

    if (!accountSid || !authToken) {
        console.log("⚠️ Twilio credentials not set — simulating WhatsApp send.");
        return {
            success: true,
            messageSid: `mock-wa-${Date.now()}`,
            simulated: true,
        };
    }

    const client = twilio(accountSid, authToken);

    try {
        // Ensure the number is in WhatsApp format
        const formattedTo = toPhoneNumber.startsWith("whatsapp:")
            ? toPhoneNumber
            : `whatsapp:${toPhoneNumber}`;

        const formattedFrom = fromNumber.startsWith("whatsapp:")
            ? fromNumber
            : `whatsapp:${fromNumber}`;

        const message = await client.messages.create({
            from: formattedFrom,
            to: formattedTo,
            body: messageBody,
        });

        console.log(`✅ WhatsApp sent to ${toPhoneNumber} — SID: ${message.sid}`);

        return {
            success: true,
            messageSid: message.sid,
        };
    } catch (error) {
        console.error(`❌ WhatsApp send error for ${toPhoneNumber}:`, error.message);

        // Handle specific Twilio errors
        if (error.code === 21614) {
            return {
                success: false,
                error: "Phone number is not a valid WhatsApp number.",
            };
        }
        if (error.code === 21608) {
            return {
                success: false,
                error: "Recipient has not opted in to receive WhatsApp messages.",
            };
        }

        return {
            success: false,
            error: error.message,
        };
    }
}
