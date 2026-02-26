// ──────────────────────────────────────────────────────────────
// controllers/campaignController.js — Execution Engine
// ──────────────────────────────────────────────────────────────
//
// POST /api/campaign/execute  — Orchestrates Phase 2 pipeline:
//   scrape → deduplicate → AI score → persist
//
// GET  /api/campaign/status/:userId — Poll for execution progress
// GET  /api/campaign/:campaignId/leads — Fetch leads for a campaign
//
// PRODUCTION HARDENING:
//   - Background execution with 202 Accepted pattern
//   - Granular error statuses (failed_scraping)
//   - LLM scoring integration with batch chunking
//   - Bulk insertMany() for database efficiency
//
// ──────────────────────────────────────────────────────────────

import Session from "../models/Session.js";
import Campaign from "../models/Campaign.js";
import Lead from "../models/Lead.js";
import { scrapeLeads, scoreLeadsInBatches } from "../services/scraperService.js";

/**
 * POST /api/campaign/execute
 *
 * Body: { userId: string }
 *
 * Fetches the user's research result from the Session, creates a Campaign,
 * then orchestrates scraping + scoring in the background.
 * Returns 202 Accepted immediately — client polls /api/campaign/status/:userId.
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
            status: "scraping",
            executionLogs: [{ message: "Campaign execution initiated." }],
        });

        console.log(`\n🚀 Campaign created: ${campaign._id} for user: ${userId}`);

        // ── 3. Fire the execution pipeline in the background ────
        // Don't block the HTTP response — return 202 immediately
        executePipeline(campaign).catch((error) => {
            console.error(`❌ Campaign pipeline catastrophic failure for ${campaign._id}:`, error);
        });

        // ── 4. Return 202 Accepted ──────────────────────────────
        res.status(202).json({
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
 * Background execution pipeline: Scrape → Score → Persist
 *
 * Each stage has independent error handling with granular status updates.
 */
async function executePipeline(campaign) {
    const logToDb = async (msg) => {
        await Campaign.updateOne(
            { _id: campaign._id },
            { $push: { executionLogs: { message: msg } } }
        ).catch(() => { });
    };

    let cleanLeads = [];

    // ══ STAGE A: Web Scraping ══════════════════════════════════
    try {
        await logToDb("🔍 Phase 2A: Starting lead scraping...");
        await Campaign.updateOne({ _id: campaign._id }, { status: "scraping" });

        const rawLeads = await scrapeLeads(
            campaign.scraperParameters,
            logToDb
        );

        await logToDb(`🧹 Phase 2B: Cleaning ${rawLeads.length} scraped leads...`);

        // Additional filter: must have at least name + (email OR phone)
        cleanLeads = rawLeads.filter(
            (lead) => lead.fullName && (lead.email || lead.phone)
        );

        await logToDb(`✅ ${cleanLeads.length} leads passed quality filter.`);

    } catch (error) {
        console.error(`❌ Scraping failed for campaign ${campaign._id}:`, error);
        await logToDb(`❌ Scraping failed: ${error.message}`);
        await Campaign.updateOne(
            { _id: campaign._id },
            { status: "failed_scraping", errorMessage: error.message }
        );
        return; // Abort pipeline — can't continue without leads
    }

    // ══ STAGE B: AI Lead Scoring ═══════════════════════════════
    try {
        if (cleanLeads.length > 0) {
            await Campaign.updateOne({ _id: campaign._id }, { status: "scoring" });
            await logToDb(`🧠 Phase 2C: AI-scoring ${cleanLeads.length} leads...`);

            cleanLeads = await scoreLeadsInBatches(
                cleanLeads,
                {
                    target_job_titles: campaign.scraperParameters?.target_job_titles || [],
                    boolean_search_strings: campaign.scraperParameters?.boolean_search_strings || [],
                },
                logToDb
            );

            await logToDb(`✅ ${cleanLeads.length} leads survived AI scoring filter.`);
        }
    } catch (error) {
        console.error(`⚠️ AI scoring failed for campaign ${campaign._id}:`, error);
        await logToDb(`⚠️ AI scoring failed: ${error.message}. Using unscored leads.`);
        // Non-fatal: continue with unscored leads (they still have value)
    }

    // ══ STAGE C: Database Persistence (Bulk Insert) ════════════
    try {
        if (cleanLeads.length > 0) {
            const leadDocs = cleanLeads.map((lead) => ({
                campaignId: campaign._id,
                ...lead,
            }));

            await Lead.insertMany(leadDocs, { ordered: false });
            await logToDb(`💾 ${leadDocs.length} leads saved to database (bulk insert).`);
        } else {
            await logToDb(`⚠️ No leads to persist after filtering.`);
        }
    } catch (error) {
        console.error(`❌ Lead persistence failed for campaign ${campaign._id}:`, error);
        await logToDb(`❌ Database error: ${error.message}`);
        // Non-fatal for duplicate key errors (ordered: false handles partial inserts)
    }

    // ══ FINALIZE ════════════════════════════════════════════════
    await Campaign.updateOne(
        { _id: campaign._id },
        {
            status: "ready",
            leadCount: cleanLeads.length,
        }
    );

    await logToDb(`🎉 Campaign execution complete! ${cleanLeads.length} leads scored & ready for outreach.`);
    console.log(`✅ Campaign ${campaign._id} execution complete. ${cleanLeads.length} leads scored & persisted.`);
}

/**
 * GET /api/campaign/status/:userId
 *
 * Returns the campaign status, execution logs, and lead count.
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
 * Returns all leads for a given campaign, sorted by match score.
 */
export async function handleGetCampaignLeads(req, res, next) {
    try {
        const { campaignId } = req.params;

        const leads = await Lead.find({ campaignId })
            .sort({ matchScore: -1, createdAt: -1 })  // Best-scored leads first
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
