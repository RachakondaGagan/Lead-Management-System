// ──────────────────────────────────────────────────────────────
// tools/submitReport.js — Structured Output Tool for Research
// ──────────────────────────────────────────────────────────────
//
// This is a LangChain tool that the Deep Research Agent calls
// ONCE it has gathered enough data from Tavily searches. By
// defining the tool's input schema as `ResearchReportSchema`,
// we force the LLM to produce Zod-validated structured output
// when it decides to "submit" its report.
//
// Unlike `.withStructuredOutput()`, this approach lets the agent
// continue using Tavily search freely while having a clear
// "exit ramp" to produce the final structured report on its own
// terms.
// ──────────────────────────────────────────────────────────────

import { tool } from "@langchain/core/tools";
import { ResearchReportSchema } from "../schemas/researchReport.js";

/**
 * The submit_report tool.
 *
 * The agent calls this when it's done researching. LangChain
 * validates the input against `ResearchReportSchema` before
 * the function body ever runs — so we're guaranteed a valid
 * object by the time we see it.
 */
const submitReport = tool(
    async (validatedReport) => {
        // ── Log the validated report ──────────────────────────────
        console.log("\n" + "═".repeat(60));
        console.log("📊 TOOL CALLED: submit_report");
        console.log("═".repeat(60));
        console.log("\n🏢 Competitors Analyzed:");
        validatedReport.competitors_analyzed.forEach((c, i) => {
            console.log(`  ${i + 1}. ${c.name} — ${c.core_offer}`);
        });
        console.log("\n🎯 Scraper Parameters:");
        console.log(`  Platforms: ${validatedReport.scraper_parameters.target_platforms.join(", ")}`);
        console.log(`  Job Titles: ${validatedReport.scraper_parameters.target_job_titles.join(", ")}`);
        console.log("\n🎨 Ad Concept:");
        console.log(`  Copy: ${validatedReport.ad_creative_concept.ad_copy}`);
        console.log("\n" + "═".repeat(60) + "\n");

        // Return a confirmation string — the agent sees this and
        // can relay a friendly summary to the user.
        return "REPORT_SUBMITTED_SUCCESSFULLY";
    },
    {
        name: "submit_report",
        description:
            "Call this tool ONLY after you have completed your research and are " +
            "ready to submit your final structured report. You MUST provide ALL " +
            "required fields: competitors_analyzed (array of 3-5 competitors), " +
            "scraper_parameters (platforms, boolean search strings, job titles), " +
            "and ad_creative_concept (visual prompt + ad copy). Do NOT call this " +
            "until you have enough data from your searches.",
        schema: ResearchReportSchema,
    }
);

export default submitReport;
