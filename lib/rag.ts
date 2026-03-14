import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

// ── Text extraction ──────────────────────────────────────────────────────────

export async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())

  if (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  ) {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(buffer)
    return result.text
  }

  if (
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  ) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // Plain text / markdown
  return buffer.toString('utf-8')
}

// ── Chunking ─────────────────────────────────────────────────────────────────

export function chunkText(
  text: string,
  chunkSize = 400,
  overlap = 50,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []

  let i = 0
  while (i < words.length) {
    const end = Math.min(i + chunkSize, words.length)
    const chunk = words.slice(i, end).join(' ').trim()
    if (chunk) chunks.push(chunk)
    if (end === words.length) break
    i += chunkSize - overlap
  }

  return chunks
}

// ── Auto-categorization ──────────────────────────────────────────────────────

const CATEGORIES = [
  'finance',
  'legal',
  'technical',
  'research',
  'hr',
  'marketing',
  'general',
]

export async function categorize(
  filename: string,
  excerpt: string,
): Promise<string> {
  try {
    const { text } = await generateText({
      model: openai(process.env.LLM_MODEL ?? 'gpt-4o-mini'),
      prompt: `Classify the following document into exactly one category.
Categories: ${CATEGORIES.join(', ')}
Filename: ${filename}
Excerpt: ${excerpt.slice(0, 500)}
Reply with just the category name, nothing else.`,
      maxTokens: 10,
    })
    const category = text.trim().toLowerCase()
    return CATEGORIES.includes(category) ? category : 'general'
  } catch {
    return 'general'
  }
}
