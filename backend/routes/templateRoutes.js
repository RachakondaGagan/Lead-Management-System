// ──────────────────────────────────────────────────────────────
// routes/templateRoutes.js — Email Template API routes
// ──────────────────────────────────────────────────────────────

import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { handleGetTemplate, handleSaveTemplate } from "../controllers/templateController.js";

const router = Router();

// All template routes require authentication
router.use(protect);

// GET  /api/template — Fetch the user's saved template (or default)
router.get("/", handleGetTemplate);

// PUT  /api/template — Create or update the user's template
router.put("/", handleSaveTemplate);

export default router;
