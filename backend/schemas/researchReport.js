// ──────────────────────────────────────────────────────────────
// schemas/researchReport.js — Zod Schema for Research Output
// ──────────────────────────────────────────────────────────────
//
// Defines the strict contract that the Deep Research Agent's
// final output MUST conform to. This schema is used in two ways:
//
//   1. As the input schema for the `submit_report` tool — so the
//      LLM knows exactly what structure to produce.
//   2. For runtime validation of the agent's output — catching
//      hallucinated or malformed data before it reaches downstream
//      systems (scrapers, ad generators).
//
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Individual competitor entry ──────────────────────────────
const CompetitorSchema = z.object({
    name: z
        .string()
        .describe("The full company/product name of the competitor."),
    core_offer: z
        .string()
        .describe(
            "A 1-2 sentence description of the competitor's primary product or service offering."
        ),
    weakness_or_gap: z
        .string()
        .describe(
            "A specific weakness, market gap, or area where our client could outperform this competitor."
        ),
});

// ── Scraper parameters for lead generation ───────────────────
const ScraperParametersSchema = z.object({
    target_platforms: z
        .array(z.string())
        .describe(
            "Platforms to scrape for leads, e.g. 'LinkedIn', 'Google Maps', 'Crunchbase', 'Apollo.io'."
        ),
    boolean_search_strings: z
        .array(z.string())
        .describe(
            "Exact Boolean search queries to find the target leads, " +
            "e.g. '\"VP of Marketing\" AND \"SaaS\" AND \"50-200 employees\"'."
        ),
    target_job_titles: z
        .array(z.string())
        .describe(
            "Specific job titles of the decision-makers to target, " +
            "e.g. 'Head of Growth', 'Director of Marketing', 'CTO'."
        ),
});

// ── Ad creative concept for Instagram ────────────────────────
const AdCreativeConceptSchema = z.object({
    visual_prompt: z
        .string()
        .describe(
            "A highly detailed image-generation prompt (for Stable Diffusion / DALL-E) " +
            "describing the exact visual for the ad — style, colours, composition, text overlays."
        ),
    ad_copy: z
        .string()
        .describe(
            "Short, punchy ad copy (2-3 sentences max) designed to grab attention " +
            "and drive clicks from the target audience."
        ),
});

// ══════════════════════════════════════════════════════════════
// MASTER SCHEMA — The full research report
// ══════════════════════════════════════════════════════════════

export const ResearchReportSchema = z.object({
    competitors_analyzed: z
        .array(CompetitorSchema)
        .describe("Array of 3-5 real competitors found through research."),
    scraper_parameters: ScraperParametersSchema.describe(
        "Exact parameters for the downstream lead-scraping system."
    ),
    ad_creative_concept: AdCreativeConceptSchema.describe(
        "A single Instagram ad concept based on the competitive analysis."
    ),
});
