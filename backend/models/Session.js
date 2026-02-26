// ──────────────────────────────────────────────────────────────
// models/Session.js — Mongoose schema for intake sessions
// ──────────────────────────────────────────────────────────────
//
// Updated for the agentic architecture:
//   • Uses `userId` instead of `sessionId`
//   • Stores `toolCallData` when the agent triggers research
// ──────────────────────────────────────────────────────────────

import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
    {
        // Unique user identifier (passed from the client)
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        // Status of the session lifecycle
        status: {
            type: String,
            enum: ["in_progress", "intake_complete", "research_complete", "campaign_executing", "campaign_complete"],
            default: "in_progress",
        },

        // Data produced by the trigger_deep_research tool call
        // Contains: { comprehensive_business_summary, suggested_search_angles }
        toolCallData: {
            comprehensive_business_summary: { type: String, default: null },
            suggested_search_angles: { type: String, default: null },
        },

        // Full research result JSON from the Deep Research Agent (Phase 2)
        researchResult: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        // Live logs of the research agent's thoughts and actions
        researchLogs: [
            {
                message: String,
                timestamp: { type: Date, default: Date.now }
            }
        ],

        // Raw conversation history (for auditing / debugging)
        conversationHistory: [
            {
                role: { type: String, enum: ["human", "ai"] },
                content: String,
                timestamp: { type: Date, default: Date.now },
            },
        ],
    },
    {
        timestamps: true, // adds createdAt & updatedAt
    }
);

const Session = mongoose.model("Session", sessionSchema);

export default Session;
