// ──────────────────────────────────────────────────────────────
// services/scraperService.js — Apify Lead Scraper
// ──────────────────────────────────────────────────────────────
//
// Calls Apify actors to scrape leads based on boolean search
// strings from the Phase 1 research report. Supports multiple
// actor types (LinkedIn, Google Maps, etc.).
//
// The function polls for actor run completion, then extracts
// and normalizes the lead data into our Lead schema format.
// ──────────────────────────────────────────────────────────────

import { ApifyClient } from "apify-client";

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// ── Apify Actor IDs for different platforms ──────────────────
const ACTOR_IDS = {
    linkedin: "anchor/linkedin-search-scraper",      // LinkedIn people search
    google_maps: "compass/crawler-google-places",       // Google Maps/Places
    website: "apify/website-content-crawler",       // General website scraper
    google_search: "apify/google-search-scraper", // Google Search
    instagram: "apify/instagram-scraper",         // Instagram
    facebook_pages: "apify/facebook-pages-scraper", // Facebook Pages
    twitter: "apify/twitter-scraper",             // Twitter/X 
};

/**
 * Scrape leads using Apify based on the research report's scraper parameters.
 *
 * @param {Object} scraperParameters — { target_platforms, boolean_search_strings, target_job_titles }
 * @param {Function} logCallback     — async (msg) => void, for real-time logging
 * @returns {Array<Object>}          — Normalized lead objects ready for MongoDB
 */
export async function scrapeLeads(scraperParameters, logCallback = async () => { }) {
    const { target_platforms = ["linkedin"], boolean_search_strings = [], target_job_titles = [] } = scraperParameters;

    // ── Guard: Check API token ──────────────────────────────────
    if (!process.env.APIFY_API_TOKEN) {
        await logCallback("⚠️ APIFY_API_TOKEN not set — generating mock leads for development.");
        return generateMockLeads(boolean_search_strings, target_job_titles);
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

                // Append proxy configuration
                runInput.proxyConfiguration = { useApifyProxy: true };

                const run = await apifyClient.actor(actorId).call(runInput);

                await logCallback(`⏳ Waiting for actor run ${run.id} to complete...`);

                // Fetch the results from the run's default dataset
                const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

                await logCallback(`✅ Retrieved ${items.length} raw results from scraper.`);

                // Normalize each raw item into our Lead schema
                for (const item of items) {
                    const normalized = normalizeLeadData(item);
                    if (normalized) {
                        allLeads.push(normalized);
                    }
                }
            } catch (error) {
                await logCallback(`❌ Scraper error for ${platform}: ${error.message}`);
                console.error(`Apify scraper error for ${platform}:`, error);
            }
        }
    }

    await logCallback(`📊 Total leads after scraping & cleaning: ${allLeads.length}`);
    return allLeads;
}

/**
 * Normalize raw Apify data into our standard Lead format.
 * Filters out entries without a name or any contact info.
 */
function normalizeLeadData(raw) {
    const fullName = raw.name || raw.fullName || raw.firstName
        ? `${raw.firstName || ""} ${raw.lastName || ""}`.trim() || raw.name || raw.fullName
        : null;

    // Must have at least a name to be useful
    if (!fullName) return null;

    return {
        fullName,
        email: raw.email || raw.emailAddress || raw.mail || null,
        phone: raw.phone || raw.phoneNumber || raw.telephone || null,
        jobTitle: raw.title || raw.jobTitle || raw.position || raw.headline || null,
        company: raw.company || raw.companyName || raw.organization || null,
        linkedinUrl: raw.url || raw.linkedinUrl || raw.profileUrl || null,
        location: raw.location || raw.city || raw.region || null,
        source: "Apify",
        rawData: raw,
    };
}

/**
 * Generate mock leads for development when no Apify API token is available.
 */
function generateMockLeads(searchStrings, jobTitles) {
    const mockCompanies = [
        "Acme SaaS Inc.", "GrowthForge AI", "DataPulse Labs",
        "CloudScale Partners", "NexGen Digital", "ProLeads Corp",
        "Velocity Marketing Group", "ScalePath Technologies",
    ];

    const leads = [];
    const count = Math.min(searchStrings.length * 5, 15); // 5 leads per query, max 15

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
            rawData: null,
        });
    }

    return leads;
}
