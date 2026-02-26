// ──────────────────────────────────────────────────────────────
// controllers/templateController.js — Email Template CRUD
// ──────────────────────────────────────────────────────────────
//
// GET /api/template     — Fetch user's template (or default)
// PUT /api/template     — Upsert user's template
//
// TENANT ISOLATION: All queries are scoped to req.user._id
// (populated by the `protect` middleware), enforcing that
// users can only read/write their own templates.
// ──────────────────────────────────────────────────────────────

import EmailTemplate from "../models/EmailTemplate.js";

// Default template — returned when user has no saved template yet
const DEFAULT_TEMPLATE = {
    subject: "Quick question for {{lead_name}} at {{company}}",
    body: `Hi {{lead_name}},

{{icebreaker}}

I wanted to reach out because I believe we can help the team at {{company}} achieve significantly better results.

Would you be open to a quick 15-minute call this week to explore if there's a fit?

Best,
LeadFlow AI`,
};

/**
 * GET /api/template
 *
 * Returns the authenticated user's saved email template.
 * If no template exists yet, returns the default without saving it.
 */
export async function handleGetTemplate(req, res, next) {
    try {
        const template = await EmailTemplate.findOne({ userId: req.user._id });

        res.json({
            success: true,
            data: template
                ? { subject: template.subject, body: template.body }
                : DEFAULT_TEMPLATE,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PUT /api/template
 *
 * Creates or updates the authenticated user's email template.
 * Body: { subject: string, body: string }
 *
 * SECURITY: The filter `{ userId: req.user._id }` guarantees
 * a user cannot overwrite another user's template, even if they
 * pass a different userId in the request body.
 */
export async function handleSaveTemplate(req, res, next) {
    try {
        const { subject, body } = req.body;

        if (typeof subject !== "string" || typeof body !== "string") {
            return res.status(400).json({
                success: false,
                message: "'subject' and 'body' must be strings.",
            });
        }

        if (!subject.trim() || !body.trim()) {
            return res.status(400).json({
                success: false,
                message: "'subject' and 'body' cannot be empty.",
            });
        }

        const template = await EmailTemplate.findOneAndUpdate(
            { userId: req.user._id }, // ← Tenant-isolated filter
            {
                $set: {
                    subject: subject.trim(),
                    body: body.trim(),
                },
            },
            { upsert: true, new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: "Template saved successfully.",
            data: { subject: template.subject, body: template.body },
        });
    } catch (error) {
        next(error);
    }
}
