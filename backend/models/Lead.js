// ──────────────────────────────────────────────────────────────
// models/Lead.js — Mongoose schema for individual leads
// ──────────────────────────────────────────────────────────────
//
// Each Lead is linked to a Campaign. Leads are created during
// Phase 2 (scraping) and their outreach status is updated
// during Phase 3 (email/WhatsApp).
// ──────────────────────────────────────────────────────────────

import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
    {
        // Reference to the parent campaign
        campaignId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Campaign",
            required: true,
            index: true,
        },

        // Lead contact information
        fullName: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            default: null,
        },
        phone: {
            type: String,
            default: null,
        },
        jobTitle: {
            type: String,
            default: null,
        },
        company: {
            type: String,
            default: null,
        },
        linkedinUrl: {
            type: String,
            default: null,
        },
        location: {
            type: String,
            default: null,
        },

        // AI-generated personalization for outreach
        icebreaker: {
            type: String,
            default: null,
        },

        // Outreach pipeline status
        outreachStatus: {
            type: String,
            enum: [
                "new",             // Freshly scraped, no contact yet
                "email_sent",      // Cold email dispatched
                "email_opened",    // Email opened (if tracking enabled)
                "email_replied",   // Lead replied to email
                "whatsapp_sent",   // WhatsApp message dispatched
                "whatsapp_replied",// Lead replied on WhatsApp
                "contacted",       // General: contacted via any channel
                "qualified",       // Lead is qualified
                "converted",       // Deal closed
            ],
            default: "new",
        },

        // Metadata from the scraping source
        source: {
            type: String,
            default: null,  // e.g. "LinkedIn", "Apollo.io", "Google Maps"
        },

        // Raw data from the scraper (for debugging)
        rawData: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for efficient campaign + status queries
leadSchema.index({ campaignId: 1, outreachStatus: 1 });

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
