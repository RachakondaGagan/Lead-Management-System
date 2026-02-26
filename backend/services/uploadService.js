// ──────────────────────────────────────────────────────────────
// services/uploadService.js — File Upload & Text Extraction
// ──────────────────────────────────────────────────────────────
//
// Handles file uploads via multer (in-memory storage).
// Extracts text from PDFs using pdf-parse, and converts
// images to base64 descriptions for AI context injection.
// ──────────────────────────────────────────────────────────────

import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// ── Multer Config ────────────────────────────────────────────
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Accepted: PDF, PNG, JPG, WEBP`), false);
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
});

// ── Text Extraction ──────────────────────────────────────────

/**
 * Extract text content from an uploaded file buffer.
 *
 * @param {Buffer} buffer   – The file contents
 * @param {string} mimetype – The MIME type of the file
 * @param {string} filename – Original filename
 * @returns {{ text: string, type: 'pdf' | 'image', filename: string }}
 */
export async function extractFileContent(buffer, mimetype, filename) {
    if (mimetype === "application/pdf") {
        return extractPdfText(buffer, filename);
    }

    // For images, return base64 for potential Gemini vision use
    return extractImageInfo(buffer, mimetype, filename);
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 */
async function extractPdfText(buffer, filename) {
    try {
        const data = await pdfParse(buffer);

        const text = data.text?.trim();

        if (!text || text.length < 10) {
            return {
                text: `[PDF uploaded: "${filename}" — ${data.numpages || "?"} pages, but no extractable text was found. This may be a scanned/image-based PDF.]`,
                type: "pdf",
                filename,
                pages: data.numpages || 0,
            };
        }

        // Truncate very long PDFs to avoid context overflow
        const maxChars = 8000;
        const truncated = text.length > maxChars ? text.substring(0, maxChars) + "\n\n...[truncated]" : text;

        return {
            text: `[Content extracted from uploaded PDF "${filename}" (${data.numpages} pages)]:\n\n${truncated}`,
            type: "pdf",
            filename,
            pages: data.numpages || 0,
        };
    } catch (error) {
        console.error("PDF extraction error:", error);
        return {
            text: `[PDF uploaded: "${filename}" — failed to extract text: ${error.message}]`,
            type: "pdf",
            filename,
            pages: 0,
        };
    }
}

/**
 * Convert an image to base64 and return metadata.
 */
function extractImageInfo(buffer, mimetype, filename) {
    const base64 = buffer.toString("base64");
    const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

    return {
        text: `[Image uploaded: "${filename}" (${mimetype}, ${sizeMB}MB). The image has been received and will be used as additional context about your company.]`,
        type: "image",
        filename,
        base64: `data:${mimetype};base64,${base64}`,
        sizeMB: parseFloat(sizeMB),
    };
}
