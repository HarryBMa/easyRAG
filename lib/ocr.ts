/**
 * OCR pipeline — uses Tesseract.js (local WASM) for image/scan inputs.
 * Architecture note: swap `performOCR` for DeepSeek-OCR-2 ONNX when the
 * model becomes publicly available via @huggingface/transformers or ONNX Runtime.
 */

import { createWorker } from 'tesseract.js'

export type OcrInput = Buffer | string // Buffer for binary data, string for file path

/**
 * Extract text from an image or scanned document.
 * Supports: PNG, JPG, TIFF, BMP, and multi-page TIFFs.
 */
export async function performOCR(input: OcrInput): Promise<string> {
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
