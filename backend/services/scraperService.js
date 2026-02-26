// ──────────────────────────────────────────────────────────────
// services/scraperService.js — Apify Lead Scraper + AI Scoring
// ──────────────────────────────────────────────────────────────
//
// PRODUCTION HARDENING:
//   - Email validation rejects garbage ("N/A", missing @, etc.)
//   - Lead deduplication by email OR fullName+company composite
//   - LLM batch scoring: chunks of 20 leads → Gemini for relevance
//   - Apify actor timeout (120s max per run)
//   - Graceful per-platform error handling
//
// ──────────────────────────────────────────────────────────────

import { ApifyClient } from "apify-client";
import { tavily } from "@tavily/core";
import { ChatOpenAI } from "@langchain/openai";

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// ── Constants ────────────────────────────────────────────────
const APIFY_TIMEOUT_SECS = 120;
const SCORING_BATCH_SIZE = 20;
const MIN_MATCH_SCORE = 40;

// ── Apify Actor IDs for different platforms ──────────────────
const ACTOR_IDS = {
    linkedin: "powerai/linkedin-peoples-search-scraper",
    google_maps: "compass/crawler-google-places",
    website: "apify/website-content-crawler",
    google_search: "apify/google-search-scraper",
    instagram: "apify/instagram-scraper",
    facebook_pages: "apify/facebook-pages-scraper",
    twitter: "apify/twitter-scraper",
};

// ══════════════════════════════════════════════════════════════
// EMAIL VALIDATION
// ══════════════════════════════════════════════════════════════

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JUNK_EMAIL_VALUES = new Set([
    "n/a", "na", "none", "null", "undefined", "-", ".",
    "no email", "noemail", "email", "test", "example",
]);

function isValidEmail(email) {
    if (!email || typeof email !== "string") return false;
    const cleaned = email.trim().toLowerCase();
    if (JUNK_EMAIL_VALUES.has(cleaned)) return false;
    return EMAIL_REGEX.test(cleaned);
}

// ══════════════════════════════════════════════════════════════
// LEAD DEDUPLICATION
// ══════════════════════════════════════════════════════════════

function deduplicateLeads(leads) {
    const seen = new Set();
    const unique = [];

    for (const lead of leads) {
        // Primary key: email (if valid)
        if (lead.email) {
            const emailKey = lead.email.toLowerCase().trim();
            if (seen.has(`email:${emailKey}`)) continue;
            seen.add(`email:${emailKey}`);
        }

        // Secondary key: fullName + company composite
        if (lead.fullName && lead.company) {
            const compositeKey = `${lead.fullName.toLowerCase().trim()}|${lead.company.toLowerCase().trim()}`;
            if (seen.has(`composite:${compositeKey}`)) continue;
            seen.add(`composite:${compositeKey}`);
        }

        unique.push(lead);
    }

    return unique;
}

// ══════════════════════════════════════════════════════════════
// LLM BATCH SCORING ENGINE
// ══════════════════════════════════════════════════════════════

/**
 * Score leads in batches of SCORING_BATCH_SIZE using Gemini.
 * Returns leads enriched with `matchScore` (0-100).
 * Filters out leads scoring below MIN_MATCH_SCORE.
 *
 * @param {Array} leads — Normalized lead objects
 * @param {Object} context — { target_job_titles, boolean_search_strings }
 * @param {Function} logCallback — async (msg) => void
 * @returns {Array} — Scored and filtered leads
 */
export async function scoreLeadsInBatches(leads, context, logCallback = async () => { }) {
    // Guard: No API key → skip scoring, return all with default score
    if (!process.env.GOOGLE_API_KEY) {
        await logCallback("⚠️ GOOGLE_API_KEY not set — skipping AI scoring, returning all leads.");
        return leads.map(l => ({ ...l, matchScore: 50 }));
    }

    if (leads.length === 0) return [];

    const scoringModel = new ChatOpenAI({
        modelName: "gpt-oss-120b",
        temperature: 0.1,
        openAIApiKey: "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",
        apiKey: "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",
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
        }
    });

    const batches = [];
    for (let i = 0; i < leads.length; i += SCORING_BATCH_SIZE) {
        batches.push(leads.slice(i, i + SCORING_BATCH_SIZE));
    }

    await logCallback(`🧠 Scoring ${leads.length} leads in ${batches.length} batch(es)...`);

    const allScoredLeads = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];

        // Build a lightweight representation for the LLM (no rawData)
        const batchForLLM = batch.map((lead, idx) => ({
            index: idx,
            fullName: lead.fullName,
            email: lead.email || "N/A",
            jobTitle: lead.jobTitle || "Unknown",
            company: lead.company || "Unknown",
            location: lead.location || "Unknown",
        }));

        const scoringPrompt = `You are a Lead Quality Scoring Agent. Score each lead's relevance to the target criteria.

## TARGET CRITERIA
- Target Job Titles: ${(context.target_job_titles || []).join(", ") || "Not specified"}
- Search Context: ${(context.boolean_search_strings || []).slice(0, 2).join("; ") || "General B2B leads"}

## LEADS TO SCORE (Batch ${batchIdx + 1}/${batches.length})
${JSON.stringify(batchForLLM, null, 2)}

## SCORING RULES
- Score 0-100 based on how well each lead matches the target criteria.
- 80-100: Perfect match (exact job title, relevant company)
- 60-79: Strong match (related title, relevant industry)
- 40-59: Moderate match (tangentially related)
- 0-39: Poor match (irrelevant industry, wrong persona, or junk data)
- Leads with NO job title AND NO company should score <= 30.

## OUTPUT FORMAT
Return ONLY a JSON array of objects with { "index": number, "score": number, "reason": string }.
No explanation, no code fences. Just the JSON array.`;

        try {
            const response = await scoringModel.invoke(scoringPrompt);
            const responseText = typeof response.content === "string"
                ? response.content
                : JSON.stringify(response.content);

            // Parse the scores
            const cleaned = responseText.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
            const scores = JSON.parse(cleaned);

            // Merge scores back into leads
            for (const scoreEntry of scores) {
                const idx = scoreEntry.index;
                if (idx >= 0 && idx < batch.length) {
                    allScoredLeads.push({
                        ...batch[idx],
                        matchScore: Math.max(0, Math.min(100, scoreEntry.score || 0)),
                    });
                }
            }

            await logCallback(`  ✅ Batch ${batchIdx + 1}: ${scores.length} leads scored.`);
        } catch (error) {
            console.error(`❌ Scoring batch ${batchIdx + 1} failed:`, error.message);
            await logCallback(`  ⚠️ Batch ${batchIdx + 1} scoring failed. Assigning default score.`);

            // Fallback: assign default score of 50 for this batch
            for (const lead of batch) {
                allScoredLeads.push({ ...lead, matchScore: 50 });
            }
        }
    }

    // Filter out low-quality leads
    const qualifiedLeads = allScoredLeads.filter(l => l.matchScore >= MIN_MATCH_SCORE);
    const rejected = allScoredLeads.length - qualifiedLeads.length;

    await logCallback(`📊 Scoring complete: ${qualifiedLeads.length} qualified, ${rejected} rejected (below ${MIN_MATCH_SCORE} threshold).`);

    // Sort by score descending
    return qualifiedLeads.sort((a, b) => b.matchScore - a.matchScore);
}

// ══════════════════════════════════════════════════════════════
// MAIN SCRAPEROPERATION
// ══════════════════════════════════════════════════════════════

/**
 * Scrape leads using Apify based on the research report's scraper parameters.
 *
 * @param {Object} scraperParameters — { target_platforms, boolean_search_strings, target_job_titles }
 * @param {Function} logCallback     — async (msg) => void, for real-time logging
 * @returns {Array<Object>}          — Normalized, deduplicated lead objects ready for scoring
 */
export async function scrapeLeads(scraperParameters, logCallback = async () => { }) {
    const { target_platforms = ["linkedin"], boolean_search_strings = [], target_job_titles = [] } = scraperParameters;

    // ── Guard: Check API token ──────────────────────────────────
    if (!process.env.APIFY_API_TOKEN) {
        await logCallback("⚠️ APIFY_API_TOKEN not set — trying Tavily scraper fallback.");
        return scrapeWithTavily(scraperParameters, logCallback);
    }

    const allLeads = [];

    for (const query of boolean_search_strings) {
        for (const platform of target_platforms) {
            const actorId = ACTOR_IDS[platform.toLowerCase().replace(/\s+/g, '_')];

            if (!actorId) {
                await logCallback(`⚠️ Skipping unknown platform: ${platform}`);
                continue;
            }

            try {
                await logCallback(`🔍 Launching Apify scraper for ${platform}: "${query.substring(0, 60)}..."`);

                // Select input parameters based on the actor
                let runInput = {};
                switch (actorId) {
                    case ACTOR_IDS.linkedin:
                        runInput = {
                            searchTerms: [query],
                            maxResults: 25,
                        };
                        break;
                    case ACTOR_IDS.google_search:
                        runInput = {
                            queries: [query],
                            maxPagesPerQuery: 1,
                        };
                        break;
                    case ACTOR_IDS.instagram:
                        runInput = {
                            search: query,
                            resultsLimit: 25,
                        };
                        break;
                    case ACTOR_IDS.facebook_pages:
                        runInput = {
                            startUrls: [{ url: `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}` }],
                            maxPages: 1
                        };
                        break;
                    case ACTOR_IDS.twitter:
                        runInput = {
                            searchTerms: [query],
                            maxItems: 25
                        };
                        break;
                    case ACTOR_IDS.google_maps:
                    default:
                        runInput = {
                            searchStringsArray: [query],
                            maxCrawledPlaces: 25
                        };
                        break;
                }

                // Append proxy and timeout configuration
                runInput.proxyConfiguration = { useApifyProxy: true };

                const run = await apifyClient.actor(actorId).call(runInput, {
                    waitSecs: APIFY_TIMEOUT_SECS,
                });

                await logCallback(`⏳ Actor run ${run.id} completed. Fetching results...`);

                // Fetch the results from the run's default dataset
                const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

                await logCallback(`✅ Retrieved ${items.length} raw results from ${platform}.`);

                // Normalize each raw item into our Lead schema
                for (const item of items) {
                    const normalized = normalizeLeadData(item, platform);
                    if (normalized) {
                        allLeads.push(normalized);
                    }
                }
            } catch (error) {
                // Granular error: log but don't crash the whole pipeline
                const errMsg = error.message || "Unknown error";
                await logCallback(`❌ Scraper error for ${platform}: ${errMsg}`);
                console.error(`Apify scraper error for ${platform}:`, error);
                // Continue to next platform — don't abort the whole operation
            }
        }
    }

    // ── Deduplication pass ───────────────────────────────────────
    const deduplicated = deduplicateLeads(allLeads);
    const dupsRemoved = allLeads.length - deduplicated.length;

    if (dupsRemoved > 0) {
        await logCallback(`🔄 Removed ${dupsRemoved} duplicate leads.`);
    }

    await logCallback(`📊 Total leads after scraping & dedup: ${deduplicated.length}`);
    return deduplicated;
}

// ══════════════════════════════════════════════════════════════
// LEAD NORMALIZATION
// ══════════════════════════════════════════════════════════════

/**
 * Normalize raw Apify data into our standard Lead format.
 * Aggressively filters out entries without a name or valid contact info.
 */
function normalizeLeadData(raw, platform = "unknown") {
    const fullName = raw.name || raw.fullName || raw.firstName
        ? `${raw.firstName || ""} ${raw.lastName || ""}`.trim() || raw.name || raw.fullName
        : raw.title || null;

    // MUST have at least a name to be useful
    if (!fullName || fullName.length < 2) return null;

    // Extract and validate email
    const rawEmail = raw.email || raw.emailAddress || raw.mail || null;
    const email = isValidEmail(rawEmail) ? rawEmail.trim().toLowerCase() : null;

    // Extract phone
    const phone = raw.phone || raw.phoneNumber || raw.telephone || null;

    // Website / URL fallback for businesses
    const linkedinUrl = raw.url || raw.linkedinUrl || raw.profileUrl || raw.website || null;

    // MUST have at least one valid contact method or reference link
    if (!email && !phone && !linkedinUrl) return null;

    return {
        fullName,
        email,
        phone,
        jobTitle: raw.title || raw.jobTitle || raw.position || raw.headline || null,
        company: raw.company || raw.companyName || raw.organization || null,
        linkedinUrl,
        location: raw.location || raw.city || raw.region || null,
        source: platform.charAt(0).toUpperCase() + platform.slice(1),
        rawData: raw,
    };
}

// ══════════════════════════════════════════════════════════════
// MOCK LEADS (Development)
// ══════════════════════════════════════════════════════════════

function generateMockLeads(searchStrings, jobTitles) {
    const mockCompanies = [
        "Acme SaaS Inc.", "GrowthForge AI", "DataPulse Labs",
        "CloudScale Partners", "NexGen Digital", "ProLeads Corp",
        "Velocity Marketing Group", "ScalePath Technologies",
    ];

    const leads = [];
    const count = Math.min(searchStrings.length * 5, 15);

    for (let i = 0; i < count; i++) {
        const company = mockCompanies[i % mockCompanies.length];
        const title = jobTitles[i % jobTitles.length] || "Director of Marketing";
        leads.push({
            fullName: `Lead ${i + 1} — ${title}`,
            email: `lead${i + 1}@${company.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")}.com`,
            phone: `+1555010${String(i).padStart(4, "0")}`,
            jobTitle: title,
            company,
            linkedinUrl: `https://linkedin.com/in/mock-lead-${i + 1}`,
            location: "United States",
            source: "Mock (Dev)",
            matchScore: 70 + (i % 30),
            rawData: null,
        });
    }

    return leads;
}

// ══════════════════════════════════════════════════════════════
// TAVILY SCRAPER FALLBACK
// ══════════════════════════════════════════════════════════════

async function scrapeWithTavily(scraperParameters, logCallback) {
    const { boolean_search_strings = [], target_job_titles = [] } = scraperParameters;
    await logCallback("🔍 Starting Tavily scraper fallback...");

    if (!process.env.TAVILY_API_KEY) {
        await logCallback("⚠️ TAVILY_API_KEY is missing. Falling back to mock leads.");
        return generateMockLeads(boolean_search_strings, target_job_titles);
    }

    const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
    const rawLeads = [];

    for (const query of boolean_search_strings) {
        try {
            await logCallback(`🔍 Tavily Search: "${query.substring(0, 50)}..."`);
            // Add instructions to find people
            const searchQuery = `${query} contact email phone "${target_job_titles.join('" OR "')}" profile`;
            const result = await tvly.search(searchQuery, {
                searchDepth: "advanced",
                maxResults: 10
            });

            for (const item of result.results || []) {
                // very rough heuristic to parse name, title, company, email from snippet
                const emailMatch = item.content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                const email = emailMatch ? emailMatch[0].toLowerCase() : null;

                if (email) {
                    rawLeads.push({
                        fullName: item.title ? item.title.split('-')[0].trim() : "Unknown Name",
                        email,
                        jobTitle: target_job_titles[0] || "Unknown Title",
                        company: "Unknown Company",
                        url: item.url,
                        source: "Tavily Extracted"
                    });
                }
            }
        } catch (error) {
            await logCallback(`❌ Tavily search failed: ${error.message}`);
        }
    }

    const allLeads = [];
    for (const raw of rawLeads) {
        const normalized = normalizeLeadData(raw, "Tavily");
        if (normalized) allLeads.push(normalized);
    }

    const deduplicated = deduplicateLeads(allLeads);
    await logCallback(`📊 Tavily scraper found ${deduplicated.length} potential leads.`);

    if (deduplicated.length === 0) {
        await logCallback("⚠️ Tavily found 0 leads with contacts. Falling back to mock leads for pipeline testing.");
        return generateMockLeads(boolean_search_strings, target_job_titles);
    }

    return deduplicated;
}
