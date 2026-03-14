/**
 * OCR pipeline — uses DeepSeek VL2 (via Ollama) as primary for images/graphs,
 * with Tesseract.js as fallback for when Ollama is unavailable.
 */

import { createWorker } from 'tesseract.js'
import Ollama from 'ollama'

export type OcrInput = Buffer | string // Buffer for binary data, string for file path

const DEEPSEEK_OCR_MODEL = process.env.DEEPSEEK_OCR_MODEL ?? 'deepseek-vl2'
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

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

  // Try DeepSeek VL2 first — better at graphs, charts, handwriting
  const deepSeekResult = await performDeepSeekOCR(buffer)
  if (deepSeekResult) return deepSeekResult

  // Fallback: Tesseract.js
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
 * Dispatches to OCR for images, pdf-parse for PDFs, mammoth for DOCX.
 */
export async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const name = file.name.toLowerCase()
  const mime = file.type

  // PDF
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(buffer)
    // If PDF has no extractable text (scanned), fall back to OCR
    if (result.text.trim().length > 50) return result.text
    return performOCR(buffer)
  }

  // DOCX
  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }

  // Images → OCR
  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|tiff?|bmp)$/.test(name)) {
    return performOCR(buffer)
  }

  // Plain text / markdown
  return buffer.toString('utf-8')
}
