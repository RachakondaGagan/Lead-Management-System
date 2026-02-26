// ──────────────────────────────────────────────────────────────
// models/Campaign.js — Mongoose schema for campaigns
// ──────────────────────────────────────────────────────────────
//
// A Campaign is created after Phase 1 research completes.
// It stores the scraper configuration and tracks execution
// status through the scraping → scoring → ready pipeline.
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
                "scoring",            // AI lead scoring in progress
                "ready",              // Execution complete, leads ready
                "outreach_active",    // Outreach emails/WhatsApp being sent
                "completed",          // All outreach finished
                "error",              // Generic error
                "failed_scraping",    // Apify scraping specifically failed
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
