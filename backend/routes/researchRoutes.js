// ──────────────────────────────────────────────────────────────
// routes/researchRoutes.js — Deep Research Agent routes
// ──────────────────────────────────────────────────────────────
import { Router } from "express";
import { handleResearchAnalysis, handleGetResearchStatus } from "../controllers/researchController.js";

const router = Router();

// POST /api/research/analyze — Trigger the Tavily-powered research agent
router.post("/analyze", handleResearchAnalysis);

// GET /api/research/status/:userId - Poll for research completion
router.get("/status/:userId", handleGetResearchStatus);

export default router;
