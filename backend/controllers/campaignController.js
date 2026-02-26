// ──────────────────────────────────────────────────────────────
// controllers/campaignController.js — Execution Engine
// ──────────────────────────────────────────────────────────────
//
// POST /api/campaign/execute  — Orchestrates the full Phase 2
//   pipeline: scrape leads → clean data → generate ad image
//
// GET  /api/campaign/status/:userId — Poll for execution progress
// ──────────────────────────────────────────────────────────────

import Session from "../models/Session.js";
import Campaign from "../models/Campaign.js";
import Lead from "../models/Lead.js";
import { scrapeLeads } from "../services/scraperService.js";
import { generateAdImage } from "../services/imageGenService.js";

/**
 * POST /api/campaign/execute
 *
 * Body: { userId: string }
 *
 * Fetches the user's research result from the Session, creates a Campaign,
 * then orchestrates scraping + image generation in the background.
 */
export async function handleCampaignExecute(req, res, next) {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "'userId' is required.",
            });
        }

        // ── 1. Fetch the session's research result ──────────────
        const session = await Session.findOne({ userId });

        if (!session || !session.researchResult) {
            return res.status(404).json({
                success: false,
                message: "No research result found for this user. Complete Phase 1 first.",
            });
        }

        const research = session.researchResult;

        // ── 2. Create the Campaign document ─────────────────────
        const campaign = await Campaign.create({
            userId,
            researchResult: research,
            scraperParameters: research.scraper_parameters || {},
            adCreativeConcept: research.ad_creative_concept || {},
            status: "scraping",
            executionLogs: [{ message: "Campaign execution initiated." }],
        });

        console.log(`\n🚀 Campaign created: ${campaign._id} for user: ${userId}`);

        // ── 3. Fire the execution pipeline in the background ────
        // Don't block the HTTP response — let the client poll for status
        executePipeline(campaign).catch((error) => {
            console.error(`❌ Campaign pipeline failed for ${campaign._id}:`, error);
        });

        res.json({
            success: true,
            data: {
                campaignId: campaign._id,
                status: campaign.status,
                message: "Campaign execution started. Poll /api/campaign/status/:userId for updates.",
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Background execution pipeline: Scrape → Clean → Generate Image
 */
async function executePipeline(campaign) {
    const logToDb = async (msg) => {
        await Campaign.updateOne(
            { _id: campaign._id },
            { $push: { executionLogs: { message: msg } } }
        ).catch(() => { });
    };

    try {
        // ══ STEP A: Web Scraping ════════════════════════════════
        await logToDb("🔍 Phase 2A: Starting lead scraping...");
        await Campaign.updateOne({ _id: campaign._id }, { status: "scraping" });

        const rawLeads = await scrapeLeads(
            campaign.scraperParameters,
            logToDb  // Pass the logger for real-time updates
        );

        // ══ STEP B: Data Cleaning & Persistence ═════════════════
        await logToDb(`🧹 Phase 2B: Cleaning ${rawLeads.length} raw leads...`);

        // Filter: must have at least name + (email OR phone)
        const cleanLeads = rawLeads.filter(
            (lead) => lead.fullName && (lead.email || lead.phone)
        );

        await logToDb(`✅ ${cleanLeads.length} leads passed quality filter.`);

        // Bulk insert leads linked to this campaign
        if (cleanLeads.length > 0) {
            const leadDocs = cleanLeads.map((lead) => ({
                campaignId: campaign._id,
                ...lead,
            }));

            await Lead.insertMany(leadDocs);
            await logToDb(`💾 ${leadDocs.length} leads saved to database.`);
        }

        // ══ STEP C: Ad Image Generation ═════════════════════════
        await Campaign.updateOne({ _id: campaign._id }, { status: "generating_image" });
        await logToDb("🎨 Phase 2C: Generating ad creative with DALL-E 3...");

        const imageResult = await generateAdImage(
            campaign.adCreativeConcept?.visual_prompt || "Professional B2B ad",
            campaign.adCreativeConcept?.ad_copy || ""
        );

        await logToDb(`✅ Ad image generated successfully.`);

        // ══ FINALIZE ════════════════════════════════════════════
        await Campaign.updateOne(
            { _id: campaign._id },
            {
                status: "ready",
                adImageUrl: imageResult.imageUrl,
                leadCount: cleanLeads.length,
            }
        );

        await logToDb(`🎉 Campaign execution complete! ${cleanLeads.length} leads + 1 ad creative ready.`);
        console.log(`✅ Campaign ${campaign._id} execution complete.`);
    } catch (error) {
        console.error(`❌ Campaign execution error:`, error);
        await logToDb(`❌ Execution failed: ${error.message}`);
        await Campaign.updateOne(
            { _id: campaign._id },
            { status: "error", errorMessage: error.message }
        );
    }
}

/**
 * GET /api/campaign/status/:userId
 *
 * Returns the campaign status, execution logs, lead count, and ad image URL.
 */
export async function handleGetCampaignStatus(req, res, next) {
    try {
        const { userId } = req.params;

        const campaign = await Campaign.findOne({ userId }).sort({ createdAt: -1 });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "No campaign found for this user.",
            });
        }

        // Fetch lead summary stats
        const leadStats = await Lead.aggregate([
            { $match: { campaignId: campaign._id } },
            {
                $group: {
                    _id: "$outreachStatus",
                    count: { $sum: 1 },
                },
            },
        ]);

        res.json({
            success: true,
            data: {
                campaignId: campaign._id,
                status: campaign.status,
                leadCount: campaign.leadCount,
                adImageUrl: campaign.adImageUrl,
                adCopy: campaign.adCreativeConcept?.ad_copy || null,
                executionLogs: campaign.executionLogs || [],
                leadStats,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/campaign/:campaignId/leads
 *
 * Returns all leads for a given campaign.
 */
export async function handleGetCampaignLeads(req, res, next) {
    try {
        const { campaignId } = req.params;

        const leads = await Lead.find({ campaignId })
            .sort({ createdAt: -1 })
            .select("-rawData");  // Exclude bulky raw data

        res.json({
            success: true,
            data: {
                total: leads.length,
                leads,
            },
        });
    } catch (error) {
        next(error);
    }
}
