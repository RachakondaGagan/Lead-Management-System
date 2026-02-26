// ──────────────────────────────────────────────────────────────
// controllers/researchController.js — Deep Research Controller
// ──────────────────────────────────────────────────────────────
//
// Updated to accept the agentic intake format:
//   { userId, comprehensive_business_summary, suggested_search_angles }
//
// Instead of the old rigid { sessionId, intakeSummary } format.
// ──────────────────────────────────────────────────────────────

import { executeDeepResearch } from "../services/researchService.js";
import Session from "../models/Session.js";

/**
 * POST /api/research/analyze
 *
 * Body: {
 *   userId: string,
 *   comprehensive_business_summary: string,
 *   suggested_search_angles: string
 * }
 *
 * Response: {
 *   success: true,
 *   data: { userId, researchReport: { ... } }
 * }
 */
export async function handleResearchAnalysis(req, res, next) {
    try {
        const { userId, comprehensive_business_summary, suggested_search_angles } =
            req.body;

        // ── Validation ────────────────────────────────────────────
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "'userId' is required.",
            });
        }

        if (!comprehensive_business_summary || !suggested_search_angles) {
            return res.status(400).json({
                success: false,
                message:
                    "Both 'comprehensive_business_summary' and 'suggested_search_angles' are required.",
            });
        }

        // ── Run the research agent (may take 30-90s) ──────────────
        console.log(`\n🔬 Research requested for user: ${userId}`);
        const researchReport = await executeDeepResearch(
            comprehensive_business_summary,
            suggested_search_angles,
            userId
        );

        res.json({
            success: true,
            data: {
                userId,
                researchReport,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/research/status/:userId
 * Used by the frontend dashboard to poll for the background research job.
 */
export async function handleGetResearchStatus(req, res, next) {
    try {
        const { userId } = req.params;
        const session = await Session.findOne({ userId });

        if (!session) {
            return res.status(404).json({ success: false, message: "User session not found." });
        }

        res.json({
            success: true,
            data: {
                status: session.status,
                researchResult: session.researchResult,
                researchLogs: session.researchLogs || []
            }
        });
    } catch (error) {
        next(error);
    }
}
