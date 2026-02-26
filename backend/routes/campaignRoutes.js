// ──────────────────────────────────────────────────────────────
// routes/campaignRoutes.js — Execution Engine routes
// ──────────────────────────────────────────────────────────────
import { Router } from "express";
import {
    handleCampaignExecute,
    handleGetCampaignStatus,
    handleGetCampaignLeads,
} from "../controllers/campaignController.js";

const router = Router();

// POST /api/campaign/execute          — Launch scraping + image gen pipeline
router.post("/execute", handleCampaignExecute);

// GET  /api/campaign/status/:userId   — Poll for campaign execution progress
router.get("/status/:userId", handleGetCampaignStatus);

// GET  /api/campaign/:campaignId/leads — Get all leads for a campaign
router.get("/:campaignId/leads", handleGetCampaignLeads);

export default router;
