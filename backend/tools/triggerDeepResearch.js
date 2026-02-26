// ──────────────────────────────────────────────────────────────
// tools/triggerDeepResearch.js — Intake → Research Pipeline
// ──────────────────────────────────────────────────────────────
//
// This is the tool the Intake Agent calls AUTONOMOUSLY once it
// has gathered enough business context. It bridges the two phases:
//
//   Intake Chatbot → trigger_deep_research → executeDeepResearch()
//
// IMPORTANT: This tool does NOT fire executeDeepResearch() itself.
// The actual execution is handled by chatService.js which has
// access to the userId for MongoDB persistence. This tool only
// validates/captures the business context and returns a success
// signal so the intake agent can inform the user.
//
// ──────────────────────────────────────────────────────────────

import { tool } from "@langchain/core/tools";
import { z } from "zod";

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

        // ── Do NOT fire executeDeepResearch here ─────────────────
        // chatService.js handles the actual execution with the userId
        // context. This tool only captures and validates the structured
        // input from the LLM. The tool's return value signals success
        // to the agent, and chatService.js reads the toolInput from
        // intermediateSteps to trigger the real pipeline.

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
