// ──────────────────────────────────────────────────────────────
// middleware/errorHandler.js — Global async error handler
// ──────────────────────────────────────────────────────────────

/**
 * Catches any error thrown inside route handlers or services
 * and returns a consistent JSON error response.
 */
const errorHandler = (err, _req, res, _next) => {
    console.error("🔴 Error:", err.stack || err.message);

    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal Server Error",
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
};

export default errorHandler;
