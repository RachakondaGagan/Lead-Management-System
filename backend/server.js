// ──────────────────────────────────────────────────────────────
// server.js — Express application entry point
// ──────────────────────────────────────────────────────────────
//
// Loads environment variables, connects to MongoDB Atlas,
// mounts API routes, and starts the HTTP server.
//
// Note: Due to ES Module top-level hoisting, we must load routes 
// dynamically after dotenv.config() to ensure API Keys exist.
// ──────────────────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config(); // Ensure this is definitely evaluated first

import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

// ── Global Middleware ────────────────────────────────────────
app.use(cors());                           // Allow cross-origin (React frontend)
app.use(express.json());                   // Parse JSON request bodies

// ── Request Timeout (30s for standard routes) ───────────────
// Prevents stuck connections when external APIs (Tavily, Apify, OpenAI) hang.
// Long-running endpoints (research, chat) are excluded since they involve
// multi-step LLM calls that can take 30-90s.
app.use((req, res, next) => {
    // Skip timeout for known long-running endpoints
    const longRunningPaths = ["/api/research", "/api/chat"];
    const isLongRunning = longRunningPaths.some(p => req.path.startsWith(p));

    if (!isLongRunning) {
        const timeout = 30_000; // 30 seconds
        req.setTimeout(timeout, () => {
            if (!res.headersSent) {
                res.status(408).json({
                    success: false,
                    message: `Request timeout — operation exceeded ${timeout / 1000}s limit.`,
                });
            }
        });
    }
    next();
});

// ── Health Check ─────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
    res.json({
        success: true,
        status: "ok",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
    });
});

// ── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5001;

const startServer = async () => {
    try {
        await connectDB();                       // Connect to MongoDB first

        // Dynamically import routes *after* dotenv and DB success to avoid ESM hoisting issues
        const chatRoutes = (await import("./routes/chatRoutes.js")).default;
        const researchRoutes = (await import("./routes/researchRoutes.js")).default;
        const campaignRoutes = (await import("./routes/campaignRoutes.js")).default;
        const outreachRoutes = (await import("./routes/outreachRoutes.js")).default;
        const uploadRoutes = (await import("./routes/uploadRoutes.js")).default;
        const authRoutes = (await import("./routes/authRoutes.js")).default;
        const templateRoutes = (await import("./routes/templateRoutes.js")).default;
        const { protect } = await import("./middleware/authMiddleware.js");

        // ── API Routes ───────────────────────────────────────────────
        app.use("/api/auth", authRoutes);              // Authentication endpoints
        app.use("/api/chat", chatRoutes);              // Phase 1: Intake chatbot (Public — scoped by userId)
        app.use("/api/research", researchRoutes);      // Phase 1: Deep research agent (Public — scoped by userId)
        app.use("/api/campaign", campaignRoutes);      // Phase 2: Scraping + leads (Public — scoped by userId)
        app.use("/api/outreach", protect, outreachRoutes); // Phase 3: Email + WhatsApp (Protected)
        app.use("/api/upload", protect, uploadRoutes);     // File uploads (Protected)
        app.use("/api/template", templateRoutes);          // Email template editor (Protected via router)

        // ── Error Handler (must be last) ─────────────────────────────
        app.use(errorHandler);

        app.listen(PORT, () => {
            console.log(`\n🚀 Server running on http://localhost:${PORT}`);
            console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
            console.log(`💬 Chat endpoint: POST http://localhost:${PORT}/api/chat/intake`);
            console.log(`🔬 Research endpoint: POST http://localhost:${PORT}/api/research/analyze`);
            console.log(`⚡ Campaign endpoint: POST http://localhost:${PORT}/api/campaign/execute`);
            console.log(`📧 Outreach email: POST http://localhost:${PORT}/api/outreach/email`);
            console.log(`📱 Outreach WhatsApp: POST http://localhost:${PORT}/api/outreach/whatsapp`);
            console.log(`📝 Template editor: GET/PUT http://localhost:${PORT}/api/template\n`);
        });
    } catch (error) {
        console.error("❌ Critical server start failure:", error);
        process.exit(1);
    }
};

startServer();
