// ──────────────────────────────────────────────────────────────
// routes/chatRoutes.js — Intake agent routes
// ──────────────────────────────────────────────────────────────
import { Router } from "express";
import {
    handleIntakeMessage,
    handleGetHistory,
} from "../controllers/chatController.js";

const router = Router();

// POST /api/chat/intake  — Send a message to the intake agent
router.post("/intake", handleIntakeMessage);

// GET  /api/chat/history/:userId — Retrieve conversation history
router.get("/history/:userId", handleGetHistory);

export default router;
