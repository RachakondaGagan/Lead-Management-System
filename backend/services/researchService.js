// ──────────────────────────────────────────────────────────────
// services/researchService.js — Autonomous Deep Research Agent
// ──────────────────────────────────────────────────────────────
//
// ARCHITECTURE: Tool-Calling Agent with TWO tools
// ──────────────────────────────────────────────────────────────
//
// The agent has access to:
//   1. TavilySearchResults — for live internet research
//   2. submit_report       — to produce Zod-validated output
//
// The AgentExecutor runs a loop:
//   think → search (Tavily) → think → search again → … → submit_report
//
// The agent decides autonomously how many searches it needs.
// When it's satisfied, it calls `submit_report` with structured
// data that MUST conform to ResearchReportSchema.
//
// We extract the tool input from intermediateSteps to get the
// validated JSON report — no fragile regex parsing needed.
//
// ──────────────────────────────────────────────────────────────

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import submitReport from "../tools/submitReport.js";
import { ResearchReportSchema } from "../schemas/researchReport.js";
import Session from "../models/Session.js";

// ══════════════════════════════════════════════════════════════
// 1. SYSTEM PROMPT — Senior Market Intelligence Analyst
// ══════════════════════════════════════════════════════════════

const RESEARCH_SYSTEM_PROMPT = `You are an elite, predatory Market Intelligence Analyst and Data Scientist at a multi-billion dollar B2B growth tech firm. You do not just find data; you find vulnerabilities.

## YOUR MISSION
You will receive a comprehensive summary of a client's business and their suggested research angles. You will deploy the Tavily Search tool sequentially to execute a ruthless, deep market analysis and output a hyper-actionable payload.

## RESEARCH PROCESS & EXPECTATIONS
1. **Competitor Discovery (The Hunt)**: 
   - Search for 3-5 REAL, hyper-relevant companies that directly compete with the client.
   - For each competitor, identify their exact company name and their core offering.
   - MOST IMPORTANTLY: Identify a specific, exploitable weakness or market gap. (e.g., "Great tech but horrible enterprise onboarding", "Ignored the mid-market SaaS segment").

2. **Lead Scraper Parameters (The Extraction Strategy)**:
   - Identify which platforms are optimal for scraping this niche (LinkedIn Sales Navigator, Crunchbase, Apollo.io, Github, etc.).
   - Craft ADVANCED, highly specific Boolean search strings designed to bypass irrelevant leads. Examples of complexity expected:
     - \`(Director OR "VP" OR "Vice President" OR "Head of") AND ("Growth" OR "Marketing" OR "Demand Gen") AND "SaaS" NOT "Consultant"\`
   - Specify the exact job titles of the economic buyers.

3. **Ad Creative Concept (The Strike)**:
   - Based on the competitive gaps, construct an Ad Concept designed to steal market share.
   - Produce a highly detailed visual prompt for Midjourney (describe style, cinematic lighting, colors, compelling composition).
   - Write punchy, psychological, attention-grabbing ad copy (2-3 sentences max) that twists the knife on the competitors' weaknesses.

## RULES OF ENGAGEMENT
- You are a Tool-Calling Agent. You MUST use the \`tavily_search\` tool MULTIPLE TIMES (at minimum 3 deep searches). Do not guess or hallucinate.
- Your output must be flawless. Once you have enough raw intelligence, call the \`submit_report\` tool with your complete structured findings.
- Do NOT output your report as flat text. You MUST use the \`submit_report\` tool.
- If a search query yields garbage, pivot your Boolean logic and search again.`;

// ══════════════════════════════════════════════════════════════
// 2. TOOLS ARRAY
// ══════════════════════════════════════════════════════════════

function createTools() {
    // Tavily search tool — reads TAVILY_API_KEY from env automatically
    const tavilySearch = new TavilySearchResults({
        maxResults: 5,
    });

    // Return both tools: search for research, submit_report for output
    return [tavilySearch, submitReport];
}

// ══════════════════════════════════════════════════════════════
// 3. AGENT PROMPT TEMPLATE
// ══════════════════════════════════════════════════════════════

const agentPrompt = ChatPromptTemplate.fromMessages([
    ["system", RESEARCH_SYSTEM_PROMPT],
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
]);

// ══════════════════════════════════════════════════════════════
// 4. MAIN ORCHESTRATION FUNCTION
// ══════════════════════════════════════════════════════════════

/**
 * Execute the Deep Research Agent.
 *
 * @param {string} comprehensiveBusinessSummary — Rich business context from intake
 * @param {string} suggestedSearchAngles — Research angles from intake agent
 * @param {string} [userId] — Optional userId for MongoDB persistence
 * @returns {Promise<object>} — Zod-validated ResearchReportSchema object
 */
export async function executeDeepResearch(
    comprehensiveBusinessSummary,
    suggestedSearchAngles,
    userId = null
) {
    console.log("\n🔬 Starting Deep Research Agent...\n");

    // Clear previous logs if any
    if (userId) {
        await Session.updateOne({ userId }, { $set: { researchLogs: [{ message: "Initializing Deep Research Agent..." }] } });
    }

    // Helper to log to mongo
    const logToMongo = async (msg) => {
        if (!userId) return;
        await Session.updateOne(
            { userId },
            { $push: { researchLogs: { message: msg } } }
        ).catch(() => { }); // fire and forget
    };

    // ── 1. Instantiate the LLM ──────────────────────────────────
    const model = new ChatGoogleGenerativeAI({
        model: "gemini-1.5-flash",
        temperature: 0.3,         // Low temp for factual research
        maxOutputTokens: 4096,    // Generous limit for structured output
    });

    // ── 2. Create tools ─────────────────────────────────────────
    const tools = createTools();

    // ── 3. Create the tool-calling agent ────────────────────────
    // `createToolCallingAgent` builds an agent that can:
    //   • Call Tavily to search the web
    //   • Call submit_report to deliver structured output
    //   • Decide autonomously which tool to use and when
    const agent = await createToolCallingAgent({
        llm: model,
        tools,
        prompt: agentPrompt,
    });

    // ── 4. Wrap in an AgentExecutor ─────────────────────────────
    // The executor manages the agent's think-act-observe loop.
    // `returnIntermediateSteps: true` lets us extract the tool
    // call data from the submit_report invocation.
    const executor = new AgentExecutor({
        agent,
        tools,
        verbose: process.env.NODE_ENV === "development",
        maxIterations: 12,            // Allow up to 12 iterations (multiple searches + report)
        returnIntermediateSteps: true, // CRITICAL: we need this to extract the report
        callbacks: [
            {
                handleAgentAction: async (action) => {
                    if (action.tool === "tavily_search_results_json") {
                        const query = action.toolInput?.query || action.toolInput;
                        await logToMongo(`Executing web search: "${query}"`);
                    } else if (action.tool === "submit_report") {
                        await logToMongo(`Synthesizing final research report...`);
                    } else {
                        await logToMongo(`Invoking tool: ${action.tool}`);
                    }
                },
                handleToolEnd: async (output, runId, parentRunId, tags) => {
                    // We don't want to dump the huge JSON into logs, just a success indicator
                    if (tags && tags.includes("tavily_search_results_json")) {
                        await logToMongo(`Analyzed search results.`);
                    }
                }
            }
        ]
    });

    // ── 5. Build the input prompt ───────────────────────────────
    const inputPrompt = `## Client Business Summary
${comprehensiveBusinessSummary}

## Suggested Research Angles
${suggestedSearchAngles}

Begin your research now. Use the Tavily Search tool multiple times to gather comprehensive data, then submit your final report using the submit_report tool.`;

    // ── 6. Execute the agent ────────────────────────────────────
    const result = await executor.invoke({ input: inputPrompt });

    // ── 7. Extract the structured report from intermediate steps ─
    // The submit_report tool call's input IS our validated report.
    // We find it in the intermediateSteps array.
    const intermediateSteps = result.intermediateSteps || [];
    const reportStep = intermediateSteps.find(
        (step) => step.action.tool === "submit_report"
    );

    let researchReport;

    if (reportStep) {
        // The toolInput has already been validated by Zod (LangChain
        // validates against the schema before calling the tool function).
        researchReport = reportStep.action.toolInput;
        console.log("✅ Research report extracted from submit_report tool call.");
        await logToMongo("Report extraction successful.");
    } else {
        // Fallback: The agent didn't call submit_report (shouldn't happen,
        // but we handle it gracefully). Try to parse the raw output.
        console.warn("⚠️  Agent did not call submit_report. Attempting fallback parse...");
        await logToMongo("Warning: Attempting fallback data extraction.");
        researchReport = attemptFallbackParse(result.output);
    }

    // ── 8. Runtime validation with Zod (belt and suspenders) ────
    // Even though LangChain validates tool inputs, we do a final
    // safeParse to catch any edge cases.
    const validation = ResearchReportSchema.safeParse(researchReport);

    if (!validation.success) {
        console.error("❌ Zod validation failed:", validation.error.format());
        await logToMongo("Validation warning: Report structure imperfect.");
        // Return what we have with a validation warning
        researchReport = {
            ...researchReport,
            _validationErrors: validation.error.format(),
            _warning: "Report did not fully conform to schema. Some fields may be missing.",
        };
    } else {
        researchReport = validation.data;
        console.log("✅ Zod validation passed. Report is schema-compliant.");
        await logToMongo("Final report validated.");
    }

    // ── 9. Persist to MongoDB (if userId provided) ──────────────
    if (userId) {
        await Session.findOneAndUpdate(
            { userId },
            {
                $set: {
                    status: "research_complete",
                    researchResult: researchReport,
                },
                $push: {
                    researchLogs: { message: "Campaign data ready for deployment." }
                }
            }
        );
        console.log(`💾 Research result saved to MongoDB for user: ${userId}`);
    }

    return researchReport;
}

// ══════════════════════════════════════════════════════════════
// FALLBACK PARSER
// ══════════════════════════════════════════════════════════════
// If the agent somehow produces raw text instead of calling the
// submit_report tool, we attempt to salvage what we can.

function attemptFallbackParse(rawOutput) {
    // Try parsing as JSON directly
    try {
        return JSON.parse(rawOutput);
    } catch {
        // Ignore
    }

    // Try extracting from code fences
    const jsonMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[1].trim());
        } catch {
            // Ignore
        }
    }

    // Last resort: return raw output wrapped
    return {
        _raw_output: rawOutput,
        _error: "Could not parse agent output. The agent did not use submit_report tool.",
        competitors_analyzed: [],
        scraper_parameters: {
            target_platforms: [],
            boolean_search_strings: [],
            target_job_titles: [],
        },
        ad_creative_concept: {
            visual_prompt: "",
            ad_copy: "",
        },
    };
}
