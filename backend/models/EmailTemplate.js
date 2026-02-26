// ──────────────────────────────────────────────────────────────
// models/EmailTemplate.js — Per-user email template storage
// ──────────────────────────────────────────────────────────────
//
// One document per user (upserted). Stores the raw template
// string with {{tags}} that the compiler will personalize.
// ──────────────────────────────────────────────────────────────

import mongoose from "mongoose";

const emailTemplateSchema = new mongoose.Schema(
    {
        // Tenant key — one template per user
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true,
        },

        // Email subject line (may contain {{tags}})
        subject: {
            type: String,
            default: "Quick question for {{lead_name}} at {{company}}",
        },

        // Raw body template with {{tags}}
        body: {
            type: String,
            default: `Hi {{lead_name}},

{{icebreaker}}

I wanted to reach out because I believe we can help the team at {{company}} achieve significantly better results.

Would you be open to a quick 15-minute call this week to explore if there's a fit?

Best,
LeadFlow AI`,
        },
    },
    { timestamps: true }
);

const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);

export default EmailTemplate;
