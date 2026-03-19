/**
 * Medical LLM layer — uses Ollama for local inference.
 * Default model: medgemma (pull with: ollama pull medgemma)
 * Fallback chain: llama3.2 → mistral → phi4-mini
 *
 * MedGemma is Google's medical-domain Gemma fine-tune released in 2025.
 * It produces structured clinical output with better medical entity recognition.
 */

import { Ollama } from 'ollama'
import { Agent, setGlobalDispatcher } from 'undici'

// Disable fetch timeouts for local Ollama — CPU inference can take several minutes
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }))

const FALLBACK_MODELS = ['llama3.2', 'mistral', 'phi4-mini']

let _client: Ollama | null = null

function getClient(): Ollama {
  if (!_client) {
    _client = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://localhost:11434' })
  }
  return _client
}

function primaryModel(): string {
  return process.env.OLLAMA_MODEL ?? 'medgemma'
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DrugEntry {
  name: string
  dose: string
  route: string
  timing?: string
}

export interface StructuredGuideline {
  title: string
  category:
    | 'airway_management'
    | 'cardiac'
    | 'obstetric'
    | 'pediatric'
    | 'pain_management'
    | 'emergency'
    | 'general'
  drugs: DrugEntry[]
  steps: string[]
  indications: string[]
  contraindications: string[]
  notes: string[]
  confidence_score: number
  source_quality: number
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

/**
 * Try to extract valid JSON from a model response.
 * Handles markdown fences, leading prose, and trailing garbage.
 */
function extractJson(raw: string): unknown {
  // 1. Direct parse
  try { return JSON.parse(raw) } catch { /* continue */ }

  // 2. Strip markdown fences (```json ... ```)
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
  try { return JSON.parse(stripped) } catch { /* continue */ }

  // 3. Find the first balanced { ... } block
  const start = raw.indexOf('{')
  if (start !== -1) {
    let depth = 0
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '{') depth++
      else if (raw[i] === '}') {
        depth--
        if (depth === 0) {
          try { return JSON.parse(raw.slice(start, i + 1)) } catch { break }
        }
      }
    }
  }

  throw new Error(`Model output is not valid JSON:\n${raw.slice(0, 300)}`)
}

// ── Model execution with fallback chain ──────────────────────────────────────

async function chatJson(
  messages: { role: string; content: string }[],
  opts: { num_predict?: number; num_ctx?: number; temperature?: number } = {},
): Promise<string> {
  const ollama = getClient()
  const models = [primaryModel(), ...FALLBACK_MODELS]

  for (const m of models) {
    try {
      const stream = await ollama.chat({
        model: m,
        messages: messages as Parameters<typeof ollama.chat>[0]['messages'],
        format: 'json',
        options: {
          temperature: opts.temperature ?? 0.1,
          num_predict: opts.num_predict ?? 1500,
          num_ctx: opts.num_ctx ?? 4096,
        },
        stream: true,
        think: false,
      } as Parameters<typeof ollama.chat>[0])

      let content = ''
      for await (const chunk of stream) {
        const c = chunk as { message: { thinking?: string; content: string } }
        content += c.message.content
      }
      return content
    } catch (err) {
      const msg = (err as Error).message ?? ''
      const isNotFound =
        msg.includes('model') && (msg.includes('not found') || msg.includes('pull'))
      if (isNotFound && models.indexOf(m) < models.length - 1) {
        console.warn(`[medllm] model "${m}" unavailable, trying next fallback`)
        continue
      }
      throw err
    }
  }

  throw new Error('All Ollama models unavailable')
}

// ── Guideline structuring ─────────────────────────────────────────────────────

const STRUCTURE_SCHEMA = `{
  "title": "concise guideline title",
  "category": "one of: airway_management | cardiac | obstetric | pediatric | pain_management | emergency | general",
  "drugs": [{"name":"","dose":"","route":"","timing":""}],
  "steps": ["ordered step 1", "step 2"],
  "indications": ["indication 1"],
  "contraindications": ["contraindication 1"],
  "notes": ["key note 1"],
  "confidence_score": 0.85,
  "source_quality": 0.7
}`

export async function structureGuideline(
  rawText: string,
  filename: string,
): Promise<StructuredGuideline> {
  const userPrompt = `You are a medical AI specializing in anesthesia and perioperative care.

Analyze the anesthesia guideline below and return a JSON object matching this schema exactly:
${STRUCTURE_SCHEMA}

Scoring guidance:
- confidence_score: 0.9+ = specific, evidence-based, detailed. 0.5–0.9 = reasonable. <0.5 = vague or generic.
- source_quality: 0.9+ = explicit citations. 0.5–0.9 = from reputable org (ASA, ESA, etc). <0.3 = no sources.

IMPORTANT: Return ONLY valid JSON. No prose, no markdown fences, no explanation.

Filename: ${filename}
Guideline text:
${rawText}`

  // First attempt
  const raw = await chatJson([{ role: 'user', content: userPrompt }])

  try {
    return extractJson(raw) as StructuredGuideline
  } catch {
    // Retry — show the model exactly what it returned and ask it to fix it
    console.warn('[medllm] JSON parse failed on first attempt, retrying with correction prompt')
    const correctionRaw = await chatJson([
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content:
          'Your previous response was not valid JSON. Return ONLY the JSON object, nothing else. No markdown, no explanation.',
      },
    ])
    return extractJson(correctionRaw) as StructuredGuideline
  }
}

// ── Auto-categorize a trick ───────────────────────────────────────────────────

const VALID_CATEGORIES = [
  'airway_management',
  'cardiac',
  'obstetric',
  'pediatric',
  'pain_management',
  'emergency',
  'general',
] as const

export async function categorizeTrick(content: string): Promise<string> {
  const raw = await chatJson(
    [
      {
        role: 'user',
        content: `Classify this anesthesia tip into exactly one category.
Return JSON: {"category": "<one of: ${VALID_CATEGORIES.join(' | ')}>"}

Tip: ${content}`,
      },
    ],
    { num_predict: 60, temperature: 0 },
  )

  try {
    const parsed = extractJson(raw) as { category?: string }
    const cat = parsed?.category?.toLowerCase().trim() ?? ''
    return (VALID_CATEGORIES as readonly string[]).includes(cat) ? cat : 'general'
  } catch {
    // Plain text fallback
    const lower = raw.toLowerCase().trim()
    return (VALID_CATEGORIES as readonly string[]).find((c) => lower.includes(c)) ?? 'general'
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function ollamaHealthy(): Promise<boolean> {
  try {
    const ollama = getClient()
    const list = await ollama.list()
    return list.models.length > 0
  } catch {
    return false
  }
}

/** Returns the first available model name, or null if Ollama is unreachable. */
export async function availableModel(): Promise<string | null> {
  try {
    const ollama = getClient()
    const list = await ollama.list()
    const primary = primaryModel()
    const found = list.models.find((m) => m.name.includes(primary.split(':')[0]))
    if (found) return found.name
    // Fall back to first available model
    return list.models[0]?.name ?? null
  } catch {
    return null
  }
}
