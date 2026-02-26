// ──────────────────────────────────────────────────────────────
// routes/outreachRoutes.js — Outreach Engine routes
// ──────────────────────────────────────────────────────────────
import { Router } from "express";
import {
    handleSendEmail,
    handleSendWhatsApp,
} from "../controllers/outreachController.js";

const router = Router();

// POST /api/outreach/email    — Send cold email to a lead
router.post("/email", handleSendEmail);

// POST /api/outreach/whatsapp — Send WhatsApp message to a lead
router.post("/whatsapp", handleSendWhatsApp);

export default router;
