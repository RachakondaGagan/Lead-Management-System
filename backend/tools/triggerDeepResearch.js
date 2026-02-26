// ──────────────────────────────────────────────────────────────
// tools/triggerDeepResearch.js — Intake → Research Pipeline
// ──────────────────────────────────────────────────────────────
//
// This is the tool the Intake Agent calls AUTONOMOUSLY once it
// has gathered enough business context. It bridges the two phases:
//
//   Intake Chatbot → trigger_deep_research → executeDeepResearch()
//
// The tool:
//   1. Receives the business summary + search angles from the LLM
//   2. Kicks off the Deep Research Agent asynchronously
//   3. Returns a confirmation so the Intake Agent can inform the user
//
// ──────────────────────────────────────────────────────────────

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { executeDeepResearch } from "../services/researchService.js";

// ── Zod schema for the tool's input ──────────────────────────
const triggerDeepResearchSchema = z.object({
    comprehensive_business_summary: z
        .string()
        .describe(
            "A detailed summary of the user's business including their niche, " +
            "target audience, budget, unique selling proposition, pain points, " +
            "and any other relevant context gathered during the conversation."
        ),
    suggested_search_angles: z
        .string()
        .describe(
            "Specific search queries, competitor names, industry keywords, and " +
            "research angles that the deep research agent should investigate " +
            "to find competitors and lead-generation opportunities."
        ),
});

// ── The tool ─────────────────────────────────────────────────
const triggerDeepResearch = tool(
    async ({ comprehensive_business_summary, suggested_search_angles }) => {
        console.log("\n" + "═".repeat(60));
        console.log("🚀 TOOL CALLED: trigger_deep_research");
        console.log("═".repeat(60));
        console.log("\n📋 Business Summary (excerpt):");
        console.log(comprehensive_business_summary.substring(0, 200) + "...");
        console.log("\n🔍 Search Angles (excerpt):");
        console.log(suggested_search_angles.substring(0, 200) + "...");
        console.log("\n" + "═".repeat(60));

        // ── Fire the research agent asynchronously ────────────────
        // We use a fire-and-forget pattern so the intake agent can
        // respond to the user immediately. The research runs in the
        // background and persists results to MongoDB when done.
        //
        // NOTE: We don't await here intentionally — the research
        // takes 30-90s and we want the user to get an immediate response.
        // Errors are caught and logged rather than crashing the intake flow.

        executeDeepResearch(comprehensive_business_summary, suggested_search_angles)
            .then((report) => {
                console.log("\n✅ Background research completed successfully.");
                console.log(`📊 Found ${report.competitors_analyzed?.length || 0} competitors.`);
            })
            .catch((error) => {
                console.error("\n❌ Background research failed:", error.message);
            });

        return (
            "SUCCESS: The deep research pipeline has been triggered and is running " +
            "in the background. The research agent will analyze competitors, " +
            "identify market gaps, generate scraper parameters, and create an " +
            "ad concept. Results will be available shortly via the research endpoint. " +
            "Let the user know their research is underway and they'll receive " +
            "a comprehensive report soon."
        );
    },
    {
        name: "trigger_deep_research",
        description:
            "Call this tool ONLY when you have fully understood the user's " +
            "business niche, target audience, budget, and unique selling " +
            "proposition, and are ready to hand off to the research team. " +
            "Do NOT call this tool until you are confident you have gathered " +
            "enough context through a thorough, multi-turn conversation.",
        schema: triggerDeepResearchSchema,
    }
);

export default triggerDeepResearch;
