// ──────────────────────────────────────────────────────────────
// models/Campaign.js — Mongoose schema for campaigns
// ──────────────────────────────────────────────────────────────
//
// A Campaign is created after Phase 1 research completes.
// It stores the scraper configuration, generated ad assets,
// and tracks execution status through Phase 2 → Phase 3.
// ──────────────────────────────────────────────────────────────

import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
    {
        // Links back to the user who initiated the intake
        userId: {
            type: String,
            required: true,
            index: true,
        },

        // Original research output from Phase 1
        researchResult: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        // Scraper parameters extracted from the research report
        scraperParameters: {
            target_platforms: [String],
            boolean_search_strings: [String],
            target_job_titles: [String],
        },

        // Ad creative concept from research
        adCreativeConcept: {
            visual_prompt: { type: String, default: null },
            ad_copy: { type: String, default: null },
        },

        // Generated ad image URL (populated after DALL-E call)
        adImageUrl: {
            type: String,
            default: null,
        },

        // Count of leads scraped for quick reference
        leadCount: {
            type: Number,
            default: 0,
        },

        // Execution pipeline status
        status: {
            type: String,
            enum: [
                "pending",            // Created, not yet executed
                "scraping",           // Apify actors running
                "generating_image",   // DALL-E 3 call in progress
                "ready",              // Execution complete, leads + image ready
                "outreach_active",    // Outreach emails/WhatsApp being sent
                "completed",          // All outreach finished
                "error",              // Something failed
            ],
            default: "pending",
        },

        // Execution logs for real-time UI feedback
        executionLogs: [
            {
                message: String,
                timestamp: { type: Date, default: Date.now },
            },
        ],

        // Error details if status is "error"
        errorMessage: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const Campaign = mongoose.model("Campaign", campaignSchema);

export default Campaign;
