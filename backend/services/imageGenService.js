// ──────────────────────────────────────────────────────────────
// services/imageGenService.js — DALL-E 3 Ad Image Generator
// ──────────────────────────────────────────────────────────────
//
// Generates Instagram ad creatives using OpenAI's DALL-E 3 API.
// Falls back to a placeholder image when no API key is set.
// ──────────────────────────────────────────────────────────────

import OpenAI from "openai";

/**
 * Generate an ad image using DALL-E 3.
 *
 * @param {string} visualPrompt — Detailed visual description from research report
 * @param {string} adCopy       — The ad headline/copy (for context, not overlaid)
 * @returns {{ imageUrl: string, revised_prompt: string }}
 */
export async function generateAdImage(visualPrompt, adCopy = "") {
    // ── Guard: No API key → return placeholder ──────────────────
    if (!process.env.OPENAI_API_KEY) {
        console.log("⚠️ OPENAI_API_KEY not set — returning placeholder image.");
        return {
            imageUrl: "https://placehold.co/1080x1080/1e293b/818cf8?text=AI+Generated+Ad&font=inter",
            revised_prompt: "Placeholder — set OPENAI_API_KEY to generate real images.",
        };
    }

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    try {
        // Enhance the prompt for Instagram ad format
        const enhancedPrompt = [
            "Create a premium, professional Instagram advertisement image.",
            `Visual concept: ${visualPrompt}`,
            adCopy ? `The ad is promoting: "${adCopy}"` : "",
            "Style: Modern, clean, high-contrast, professional B2B aesthetic.",
            "Aspect ratio: Square (1:1). No text overlays on the image itself.",
            "Lighting: Cinematic, dramatic. Colors: Rich, saturated, brand-appropriate.",
        ]
            .filter(Boolean)
            .join(" ");

        console.log("🎨 Generating ad image with DALL-E 3...");

        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: enhancedPrompt,
            n: 1,
            size: "1024x1024",
            quality: "hd",
            style: "vivid",
        });

        const imageUrl = response.data[0]?.url;
        const revisedPrompt = response.data[0]?.revised_prompt || "";

        console.log("✅ Ad image generated successfully.");

        return {
            imageUrl: imageUrl || null,
            revised_prompt: revisedPrompt,
        };
    } catch (error) {
        console.error("❌ DALL-E 3 image generation error:", error.message);

        // Handle specific OpenAI errors
        if (error.status === 429) {
            throw new Error("OpenAI rate limit exceeded. Please wait and try again.");
        }
        if (error.status === 400) {
            throw new Error(`Image generation rejected: ${error.message}`);
        }

        throw new Error(`Image generation failed: ${error.message}`);
    }
}
