/**
 * OCR & document extraction pipeline.
 *
 * Priority order:
 *   1. Docling Serve       — best-in-class for PDFs, DOCX, tables, figures
 *   2. OpenDataLoader PDF  — #1 open-source PDF benchmark; table/formula extraction
 *   3. DeepSeek VL2        — LLM-based OCR for images/graphs (via Ollama)
 *   4. pdf-parse           — fast text-layer extraction for digital PDFs
 *   5. mammoth             — DOCX text extraction
 *   6. Tesseract.js        — WASM OCR as final fallback
 */

import { createWorker } from 'tesseract.js'
import Ollama from 'ollama'
import { writeFile, readdir, readFile, rm, mkdtemp } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'

export type OcrInput = Buffer | string // Buffer for binary data, string for file path

const DOCLING_URL = process.env.DOCLING_URL ?? 'http://localhost:5001'
const DEEPSEEK_OCR_MODEL = process.env.DEEPSEEK_OCR_MODEL ?? 'deepseek-vl2'
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

/**
 * Send a document to Docling Serve for conversion.
 * Returns markdown (preserves tables/headings) or plain text, or null if unavailable.
 */
async function callDocling(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const form = new FormData()
    form.append('files', new Blob([buffer], { type: mimeType }), filename)
    form.append('to_formats', 'md')

    const res = await fetch(`${DOCLING_URL}/v1/convert/file`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) return null

    const data = (await res.json()) as {
      document?: { md_content?: string; text_content?: string }
      status?: string
    }

    if (data.status === 'failure' || !data.document) return null

    const text = data.document.md_content || data.document.text_content || ''
    return text.trim().length > 20 ? text.trim() : null
  } catch {
    return null
  }
}

/**
 * Extract text from a PDF using OpenDataLoader PDF.
 * Ranks #1 on open-source PDF benchmarks; supports tables, formulas, and
 * multi-column layouts without requiring a running server.
 * Requires Java 11+ on PATH. Returns null if unavailable or conversion fails.
 */
async function callOpenDataLoader(
  buffer: Buffer,
  filename: string,
): Promise<string | null> {
  if (process.env.OPENDATALOADER_ENABLED === 'false') return null

  let tmpDir: string | null = null
  try {
    const { convert } = await import('@opendataloader/pdf')

    tmpDir = await mkdtemp(join(tmpdir(), 'odl-'))

    // Sanitize: strip any directory components to prevent path traversal
    const safeName = basename(filename)
    const inputPath = join(tmpDir, safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`)
    const outputDir = join(tmpDir, 'out')

    await writeFile(inputPath, buffer)

    // convert() produces one .md file per input PDF in outputDir
    await convert([inputPath], { outputDir, format: 'markdown' })

    const files = await readdir(outputDir)
    const mdFile = files.find((f) => f.endsWith('.md'))
    if (!mdFile) return null

    const text = await readFile(join(outputDir, mdFile), 'utf-8')
    return text.trim().length > 20 ? text.trim() : null
  } catch {
    return null
  } finally {
    if (tmpDir) {
      rm(tmpDir, { recursive: true, force: true }).catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[ocr] OpenDataLoader temp dir cleanup failed:', err)
        }
      })
    }
  }
}

/**
 * Extract text from an image using DeepSeek VL2 via Ollama.
 * Handles graphs, charts, tables, and handwritten text better than Tesseract.
 * Returns null if Ollama is unavailable so caller can fall back.
 */
async function performDeepSeekOCR(buffer: Buffer): Promise<string | null> {
  try {
    const ollama = new Ollama({ host: OLLAMA_HOST })
    const response = await ollama.generate({
      model: DEEPSEEK_OCR_MODEL,
      prompt:
        'Extract all text from this image exactly as it appears, including text inside charts, graphs, tables, and diagrams. Return only the extracted text, preserving structure.',
      images: [buffer.toString('base64')],
      stream: false,
    })
    const text = response.response?.trim() ?? ''
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

/**
 * Extract text from an image or scanned document.
 * Tries DeepSeek VL2 first (better for graphs/complex layouts), falls back to Tesseract.
 */
export async function performOCR(input: OcrInput): Promise<string> {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input

  const deepSeekResult = await performDeepSeekOCR(buffer)
  if (deepSeekResult) return deepSeekResult

  const worker = await createWorker('eng', 1)
  try {
    const { data } = await worker.recognize(input)
    return data.text.trim()
  } finally {
    await worker.terminate()
  }
}

/**
 * Extract text from a file based on MIME type.
 * Routes through Docling Serve first for best table/figure/layout handling.
 * Falls back to purpose-specific libraries if Docling is unavailable.
 */
export async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const name = file.name.toLowerCase()
  const mime = file.type

  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')
  const isDocx =
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  const isImage =
    mime.startsWith('image/') || /\.(png|jpg|jpeg|tiff?|bmp)$/.test(name)

  // --- Docling Serve (primary for PDF, DOCX, images) ---
  if (isPdf || isDocx || isImage) {
    const doclingResult = await callDocling(buffer, file.name, mime)
    if (doclingResult) return doclingResult
  }

  // --- Fallbacks ---

  if (isPdf) {
    const openDlResult = await callOpenDataLoader(buffer, file.name)
    if (openDlResult) return openDlResult

    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(buffer)
    if (result.text.trim().length > 50) return result.text
    return performOCR(buffer)
  }

  if (isDocx) {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }

  if (isImage) {
    return performOCR(buffer)
  }

  // Plain text / markdown
  return buffer.toString('utf-8')
}
