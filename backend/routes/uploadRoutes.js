// ──────────────────────────────────────────────────────────────
// routes/uploadRoutes.js — File Upload Endpoint
// ──────────────────────────────────────────────────────────────

import { Router } from "express";
import { upload, extractFileContent } from "../services/uploadService.js";

const router = Router();

/**
 * POST /api/upload/file
 *
 * Accepts a single file upload (field name: "file").
 * Returns extracted text for PDFs or base64 for images.
 */
router.post("/file", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded. Use field name 'file'.",
            });
        }

        const { buffer, mimetype, originalname } = req.file;

        console.log(`📎 File uploaded: ${originalname} (${mimetype}, ${(buffer.length / 1024).toFixed(1)}KB)`);

        const result = await extractFileContent(buffer, mimetype, originalname);

        res.json({
            success: true,
            data: {
                filename: result.filename,
                type: result.type,
                text: result.text,
                pages: result.pages || null,
            },
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "File upload failed.",
        });
    }
});

export default router;
