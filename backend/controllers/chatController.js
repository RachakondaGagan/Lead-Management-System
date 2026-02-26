// ──────────────────────────────────────────────────────────────
// controllers/chatController.js — Intake Agent Controller
// ──────────────────────────────────────────────────────────────
//
// Accepts { userId, message } and delegates to the agentic
// chatService. Returns the agent's reply and whether the
// trigger_deep_research tool was called.
// ──────────────────────────────────────────────────────────────

import { processIntakeMessage, getUserHistory } from "../services/chatService.js";

/**
 * POST /api/chat/intake
 * Body: { userId: string, message: string }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     reply: "...",
 *     toolTriggered: false,
 *     toolData: null
 *   }
 * }
 */
export async function handleIntakeMessage(req, res, next) {
    try {
        const { userId, message } = req.body;

        // ── Input validation ──────────────────────────────────────
        if (!userId || !message) {
            return res.status(400).json({
                success: false,
                message: "Both 'userId' and 'message' are required.",
            });
        }

        if (typeof userId !== "string" || typeof message !== "string") {
            return res.status(400).json({
                success: false,
                message: "'userId' and 'message' must be strings.",
            });
        }

        // ── Delegate to the agent service ─────────────────────────
        const result = await processIntakeMessage(userId, message);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/chat/history/:userId
 * Retrieve conversation history for a user.
 */
export async function handleGetHistory(req, res, next) {
    try {
        const { userId } = req.params;
        const history = await getUserHistory(userId);

        res.json({
            success: true,
            data: { userId, history },
        });
    } catch (error) {
        next(error);
    }
}
