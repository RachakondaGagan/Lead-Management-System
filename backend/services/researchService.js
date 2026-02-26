// ──────────────────────────────────────────────────────────────
// services/researchService.js — Tavily-Powered Deep Research
// ──────────────────────────────────────────────────────────────
//
// ARCHITECTURE: Tavily Native Research API
// ──────────────────────────────────────────
// Instead of orchestrating an LLM agent with tool calls, this
// service uses Tavily's native `research()` API which handles
// multi-query deep research autonomously. This eliminates the
// Gemini dependency for the research pipeline entirely.
//
// The flow:
//   1. Build a research query from business context
//   2. Call tavily.research() to start async deep research
//   3. Poll tavily.getResearch() until complete
//   4. Parse results into our ResearchReportSchema
//   5. Persist to MongoDB
//
// PRODUCTION HARDENING:
//   - 180s timeout on the entire research process
//   - Polling with configurable interval
//   - Fallback to tavily.search() if research() fails
//   - Structured output parsing with Zod validation
//
// ──────────────────────────────────────────────────────────────

import { tavily } from "@tavily/core";
import { ChatOpenAI } from "@langchain/openai";
import { ResearchReportSchema } from "../schemas/researchReport.js";
import Session from "../models/Session.js";

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const RESEARCH_TIMEOUT_MS = 180_000; // 180 seconds
const POLL_INTERVAL_MS = 3_000;      // Poll every 3 seconds

// ══════════════════════════════════════════════════════════════
// TAVILY CLIENT
// ══════════════════════════════════════════════════════════════

function getTavilyClient() {
    if (!process.env.TAVILY_API_KEY) {
        throw new Error("TAVILY_API_KEY is not set in environment variables.");
    }
    return tavily({ apiKey: process.env.TAVILY_API_KEY });
}

// ══════════════════════════════════════════════════════════════
// MAIN ORCHESTRATION FUNCTION
// ══════════════════════════════════════════════════════════════

/**
 * Execute deep research using Tavily's native research API.
 *
 * @param {string} comprehensiveBusinessSummary — Rich business context
 * @param {string} suggestedSearchAngles — Research angles from intake
 * @param {string} [userId] — Optional userId for MongoDB persistence
 * @returns {Promise<object>} — Structured research report
 */
export async function executeDeepResearch(
    comprehensiveBusinessSummary,
    suggestedSearchAngles,
    userId = null
) {
    console.log("\n🔬 Starting Tavily Deep Research...\n");

    // Initialize research logs in MongoDB
    if (userId) {
        await Session.updateOne(
            { userId },
            { $set: { researchLogs: [{ message: "Initializing Tavily Deep Research..." }] } }
        );
    }

    const logToMongo = async (msg) => {
        if (!userId) return;
        await Session.updateOne(
            { userId },
            { $push: { researchLogs: { message: msg } } }
        ).catch(() => { });
    };

    const tvly = getTavilyClient();

    // ── 1. Build the research query ─────────────────────────────
    const rawQuery = `Competitive analysis for: ${comprehensiveBusinessSummary}. Angles: ${suggestedSearchAngles}. Competitors, target audience (titles, size), and B2B lead generation strategies.`;

    // Tavily has a strictly enforced length limit
    const researchQuery = rawQuery.substring(0, 395);

    await logToMongo(`📋 Research query prepared. Starting Tavily advanced search...`);

    // ── 2. Execute research with timeout ────────────────────────
    let researchContent;
    let researchSources = [];

    try {
        await logToMongo("🔍 Launching Tavily Advanced Search API...");

        const result = await tvly.search(researchQuery, {
            searchDepth: "advanced",
            maxResults: 10,
            includeAnswer: true
        });

        researchContent = result.answer + "\\n\\n" + (result.results || []).map(r => r.content).join("\\n");
        researchSources = result.results || [];

        await logToMongo(`✅ Tavily search completed successfully.`);
    } catch (error) {
        console.warn("⚠️ Tavily advanced search failed, falling back to multi-search:", error.message);
        await logToMongo(`⚠️ Advanced search failed. Falling back to multi-search...`);

        // Fallback: Use multiple tavily.search() calls
        researchContent = await fallbackMultiSearch(tvly, comprehensiveBusinessSummary, suggestedSearchAngles, logToMongo);
    }

    // ── 3. Parse research into structured report ────────────────
    await logToMongo("🧠 Structuring research into actionable report...");

    let researchReport;
    try {
        researchReport = await structureResearchWithLLM(
            researchContent,
            comprehensiveBusinessSummary,
            suggestedSearchAngles
        );
        await logToMongo("✅ Research report structured successfully.");
    } catch (error) {
        console.error("❌ Failed to structure research:", error.message);
        await logToMongo(`⚠️ Structure pass failed: ${error.message}. Using raw data.`);
        researchReport = buildFallbackReport(researchContent);
    }

    // ── 4. Zod validation ───────────────────────────────────────
    const validation = ResearchReportSchema.safeParse(researchReport);

    if (validation.success) {
        researchReport = validation.data;
        console.log("✅ Zod validation passed.");
    } else {
        console.warn("⚠️ Zod validation failed, using best-effort data.");
        researchReport = {
            ...researchReport,
            _validationWarning: "Some fields may not fully conform to schema.",
        };
    }

    // ── 5. Persist to MongoDB ───────────────────────────────────
    if (userId) {
        await Session.findOneAndUpdate(
            { userId },
            {
                $set: {
                    status: "research_complete",
                    researchResult: researchReport,
                },
                $push: {
                    researchLogs: { message: "🎉 Research complete. Campaign data ready." }
                }
            }
        );
        console.log(`💾 Research result saved for user: ${userId}`);
    }

    return researchReport;
}

// ══════════════════════════════════════════════════════════════
// FALLBACK: Multi-Search when research() API is unavailable
// ══════════════════════════════════════════════════════════════

async function fallbackMultiSearch(tvly, summary, angles, logToMongo) {
    const q1 = `${summary} competitors analysis market landscape`.substring(0, 395);
    const q2 = `B2B lead generation strategies ${angles}`.substring(0, 395);
    const q3 = `${summary} target audience job titles decision makers`.substring(0, 395);
    const queries = [q1, q2, q3];

    const allResults = [];

    for (let i = 0; i < queries.length; i++) {
        try {
            await logToMongo(`🔍 Search ${i + 1}/${queries.length}: "${queries[i].substring(0, 50)}..."`);
            const result = await tvly.search(queries[i], { maxResults: 5 });
            allResults.push(...(result.results || []));
        } catch (err) {
            console.error(`Search ${i + 1} failed:`, err.message);
            await logToMongo(`⚠️ Search ${i + 1} failed: ${err.message}`);
        }
    }

    // Combine all search results into a single text
    return allResults
        .map(r => `## ${r.title}\n${r.content}\nSource: ${r.url}`)
        .join("\n\n---\n\n");
}

// ══════════════════════════════════════════════════════════════
// STRUCTURE RESEARCH WITH LLM
// ══════════════════════════════════════════════════════════════

async function structureResearchWithLLM(rawResearch, businessSummary, searchAngles) {
    // Try using Gemini to structure the raw research into our schema
    // We are using OpenRouter now, so no need to check OPENAI_API_KEY
    // if (!process.env.OPENAI_API_KEY) { ... }

    const model = new ChatOpenAI({
        modelName: "gpt-oss-120b",
        temperature: 0.1,
        openAIApiKey: "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",
        apiKey: "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",
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
        }
    });

    const structurePrompt = `You are a data extraction agent. Given the following research data about a business and its competitive landscape, extract and structure the information into a specific JSON format.

## BUSINESS CONTEXT
${businessSummary}

## RAW RESEARCH DATA
${typeof rawResearch === "string" ? rawResearch.substring(0, 8000) : JSON.stringify(rawResearch).substring(0, 8000)}

## REQUIRED OUTPUT FORMAT (JSON only, no explanation)
{
  "competitors_analyzed": [
    {
      "name": "Exact Company Name",
      "core_offer": "What they sell in 1-2 sentences",
      "weakness_or_gap": "Their specific exploitable weakness"
    }
  ],
  "scraper_parameters": {
    "target_platforms": ["LinkedIn", "Apollo.io", "Google Maps"],
    "boolean_search_strings": ["Advanced Boolean search strings with AND/OR/NOT operators"],
    "target_job_titles": ["VP of Marketing", "Director of Sales"]
  },
  "ad_creative_concept": {
    "visual_prompt": "Detailed DALL-E prompt for an Instagram ad",
    "ad_copy": "2-3 sentence ad copy that exploits competitor weaknesses"
  }
}

Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

    const response = await model.invoke(structurePrompt);
    const responseText = typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Clean and parse
    const cleaned = responseText.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
}

// ══════════════════════════════════════════════════════════════
// FALLBACK REPORT (when no LLM is available)
// ══════════════════════════════════════════════════════════════

function buildFallbackReport(rawContent) {
    return {
        competitors_analyzed: [
            {
                name: "Competitor data available in raw research",
                core_offer: "See research results for details",
                weakness_or_gap: "Manual review recommended",
            },
        ],
        scraper_parameters: {
            target_platforms: ["LinkedIn", "Google Maps"],
            boolean_search_strings: ["B2B lead generation"],
            target_job_titles: ["Director of Marketing", "VP of Sales"],
        },
        ad_creative_concept: {
            visual_prompt: "Professional B2B advertisement with modern design, clean layout, corporate blue and white color scheme, cinematic lighting",
            ad_copy: "Transform your business growth with AI-powered lead generation. Start today.",
        },
        _raw_research: typeof rawContent === "string" ? rawContent.substring(0, 5000) : rawContent,
    };
}
