// ──────────────────────────────────────────────────────────────
// services/chatService.js — Agentic Intake Service (Rewrite)
// ──────────────────────────────────────────────────────────────
//
// ARCHITECTURE: True Tool-Calling Agent
// ──────────────────────────────────────
// Instead of rigid JSON parsing, this service uses LangChain's
// `createToolCallingAgent` + `AgentExecutor`. The Gemini model
// has a fluid, intelligent conversation AND can autonomously
// decide when to call the `trigger_deep_research` tool.
//
// Memory: Per-user `ChatMessageHistory` stored in an in-memory
// Map (keyed by userId). Each user gets an independent agent
// loop with its own conversation history.
//
// NOTE: Agent + Executor are lazy-initialized on first request
// to avoid top-level await that could silently hang at import.
// ──────────────────────────────────────────────────────────────

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";
import Session from "../models/Session.js";
import triggerDeepResearch from "../tools/triggerDeepResearch.js";
import { executeDeepResearch } from "./researchService.js";

// ══════════════════════════════════════════════════════════════
// 1. IN-MEMORY STORE — userId → ChatMessageHistory
// ══════════════════════════════════════════════════════════════

const memoryStore = new Map();

function getOrCreateHistory(userId) {
    if (!memoryStore.has(userId)) {
        const history = new ChatMessageHistory();
        history.addAIMessage("I'm your Elite AI Growth Consultant. Tell me about your business (Niche, Audience, and Value Proposition), and I will actively orchestrate a deep research pipeline for explosive lead generation.");
        memoryStore.set(userId, history);
    }
    return memoryStore.get(userId);
}

// ══════════════════════════════════════════════════════════════
// 2. SYSTEM PROMPT — Elite B2B Growth Consultant
// ══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are an elite, aggressive B2B Growth Consultant and Data Scientist working for a premier AI-powered lead-generation platform.

## YOUR MISSION
Extract the absolute core of the user's business model (Niche, Audience, Value Prop) as fast as humanly possible, ideally in a single turn, so you can unleash the Deep Research swarm. 

## YOUR PERSONALITY
- You are sharp, highly strategic, and demanding but polite.
- You do NOT make small talk. Every word serves to extract business intelligence.
- Ask penetrating, highly-focused questions.

## WHAT YOU MUST EXTRACT
1. **Business Niche / Product** — What do they actually sell?
2. **Target Audience** — Who are their ideal buyers? (job titles, company size, vertical)
3. **Core Value Proposition** — What specific pain point do they solve?

## RULES
- If the user provides a comprehensive overarching answer, IMMEDIATELY call the \`trigger_deep_research\` tool. Do not ask follow ups if you have enough to search.
- If you lack clarity, ask ONE extremely pointed question. Never ask a list of questions.
- NEVER break character.
- The user is busy. Save their time.

## WHEN TO DEPLOY RESEARCH
The millisecond you have sufficient data for Niche, Audience, and Value Prop — call the \`trigger_deep_research\` tool. 
Do not warn the user in a separate message. Call the tool and summarize what you are doing.`;

// ══════════════════════════════════════════════════════════════
// 3. TOOLS & PROMPT (static config — no async needed)
// ══════════════════════════════════════════════════════════════

const tools = [triggerDeepResearch];

const agentPrompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
]);

const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: 0.6,
    maxOutputTokens: 2048,
});

// ══════════════════════════════════════════════════════════════
// 4. LAZY SINGLETON — Agent + Executor
// ══════════════════════════════════════════════════════════════
// We avoid top-level `await` which can silently hang the module.
// Instead, we initialise on the first request and cache.
// ══════════════════════════════════════════════════════════════

let _agentExecutor = null;

async function getAgentExecutor() {
    if (_agentExecutor) return _agentExecutor;

    console.log("🤖 Lazy-initializing intake agent + executor...");
    const agent = await createToolCallingAgent({
        llm: model,
        tools,
        prompt: agentPrompt,
    });

    _agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: process.env.NODE_ENV === "development",
        maxIterations: 5,
        returnIntermediateSteps: true,
    });

    console.log("✅ Intake agent ready.");
    return _agentExecutor;
}

// ══════════════════════════════════════════════════════════════
// 5. PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Process a user message through the intake agent.
 *
 * @param {string} userId     – Unique identifier for the user
 * @param {string} userMessage – The user's latest message
 * @returns {{
 *   reply: string,
 *   toolTriggered: boolean,
 *   toolData: object | null
 * }}
 */
export async function processIntakeMessage(userId, userMessage) {
    // ── Lazy-init the agent executor ──────────────────────────
    const agentExecutor = await getAgentExecutor();

    // ── Retrieve (or create) this user's conversation history ──
    const chatHistory = getOrCreateHistory(userId);

    // ── Get all past messages as an array for the agent ────────
    const previousMessages = await chatHistory.getMessages();

    // ── Invoke the agent executor ──────────────────────────────
    const result = await agentExecutor.invoke({
        input: userMessage,
        chat_history: previousMessages,
    });

    // ── Extract the final text reply ───────────────────────────
    let reply = result.output;
    let toolTriggered = false;
    let toolData = null;

    // ── 1. Check intermediateSteps first (ideal path) ────────
    const intermediateSteps = result.intermediateSteps || [];
    const researchStep = intermediateSteps.find(
        (step) => step.action.tool === "trigger_deep_research"
    );

    if (researchStep) {
        toolTriggered = true;
        toolData = researchStep.action.toolInput;
    }

    // ── 2. Fallback: Check if output itself contains a functionCall ──
    // Gemini 2.5 sometimes returns the tool call in the raw output
    // instead of intermediateSteps (especially with thinking mode).
    if (!toolTriggered && typeof reply !== "string") {
        if (Array.isArray(reply)) {
            const funcCallEntry = reply.find(
                (entry) => entry?.functionCall?.name === "trigger_deep_research"
            );
            if (funcCallEntry) {
                toolTriggered = true;
                toolData = funcCallEntry.functionCall.args || {};
                console.log("🔍 Detected trigger_deep_research in raw output (fallback path).");
            }
        }
    }

    // ── 3. Sanitize reply to a string ─────────────────────────
    if (typeof reply !== "string") {
        if (Array.isArray(reply) && reply[0]?.text) {
            reply = reply[0].text;
        } else if (toolTriggered) {
            reply = "I have enough information to proceed. Deploying research agents now...";
        } else {
            reply = "I'm processing your request. One moment please...";
        }
    }

    // ── 4. If tool triggered but toolData is empty, reconstruct ──
    // Gemini sometimes calls the tool with empty args. We reconstruct
    // the business summary from the full conversation history.
    if (toolTriggered && (!toolData?.comprehensive_business_summary)) {
        console.log("⚠️ Tool args were empty. Reconstructing from conversation history.");

        // Build a transcript of all human messages as the summary
        const allMessages = await chatHistory.getMessages();
        const humanMessages = [];
        for (const msg of allMessages) {
            // LangChain message objects have a `content` property and `_getType()` method
            const msgType = msg._getType?.() || msg.constructor?.name || "";
            if (msgType === "human" || msg.role === "human") {
                humanMessages.push(msg.content);
            }
        }
        // Include the current message too
        humanMessages.push(userMessage);

        toolData = {
            comprehensive_business_summary: humanMessages.join("\n\n"),
            suggested_search_angles: "Analyze competitors, identify market gaps, generate scraper parameters for LinkedIn/Apollo.io, and craft targeted ad creative concepts."
        };
    }

    // ── Update the in-memory history ───────────────────────────
    await chatHistory.addUserMessage(userMessage);
    await chatHistory.addAIMessage(reply);

    // ── Persist to MongoDB ─────────────────────────────────────
    const updatePayload = {
        $push: {
            conversationHistory: {
                $each: [
                    { role: "human", content: userMessage },
                    { role: "ai", content: reply },
                ],
            },
        },
    };

    if (toolTriggered) {
        updatePayload.$set = {
            status: "intake_complete",
            toolCallData: toolData,
        };

        console.log(`\n🚀 Tool triggered! Firing background executeDeepResearch for user: ${userId}`);
        executeDeepResearch(
            toolData.comprehensive_business_summary,
            toolData.suggested_search_angles,
            userId
        ).catch(error => {
            console.error(`❌ Background deep research failed for user ${userId}:`, error);
        });
    }

    await Session.findOneAndUpdate({ userId }, updatePayload, {
        upsert: true,
        new: true,
    });

    return { reply, toolTriggered, toolData };
}

/**
 * Retrieve conversation history for a user from MongoDB.
 */
export async function getUserHistory(userId) {
    const session = await Session.findOne({ userId });
    return session ? session.conversationHistory : [];
}
