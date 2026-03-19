/**
 * Medical LLM layer — uses Ollama for local inference.
 * Default model: medgemma (pull with: ollama pull medgemma)
 * Fallback:      llama3.2, mistral, phi4-mini
 *
 * MedGemma is Google's medical-domain Gemma fine-tune released in 2025.
 * It produces structured clinical output with better medical entity recognition.
 */

import { Ollama } from 'ollama'
import { Agent, setGlobalDispatcher } from 'undici'

// Disable fetch timeouts for local Ollama — CPU inference can take several minutes
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }))

let _client: Ollama | null = null

function getClient(): Ollama {
  if (!_client) {
    _client = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://localhost:11434' })
  }
  return _client
}

function model(): string {
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

// ── Guideline structuring ─────────────────────────────────────────────────────

export async function structureGuideline(
  rawText: string,
  filename: string,
): Promise<StructuredGuideline> {
  const prompt = `You are MedGemma, a medical AI assistant specializing in anesthesia and perioperative care.

Analyze the anesthesia guideline below and return a JSON object with these exact fields:
{
  "title": "concise guideline title",
  "category": "one of: airway_management | cardiac | obstetric | pediatric | pain_management | emergency | general",
  "drugs": [{"name":"","dose":"","route":"","timing":""}],
  "steps": ["ordered step 1", "step 2", ...],
  "indications": ["indication 1", ...],
  "contraindications": ["contraindication 1", ...],
  "notes": ["key note 1", ...],
  "confidence_score": <float 0-1>,
  "source_quality": <float 0-1>
}

Scoring guidance:
- confidence_score: 0.9+ = specific, evidence-based, detailed. 0.5-0.9 = reasonable. <0.5 = vague, conflicting, or generic.
- source_quality: 0.9+ = explicit citations. 0.5-0.9 = from reputable org (ASA, ESA, etc). <0.3 = no sources.

IMPORTANT: Return ONLY valid JSON. No prose, no markdown fences.

Filename: ${filename}
Guideline text:
${rawText}`

  const ollama = getClient()

  const stream = await ollama.chat({
    model: model(),
    messages: [{ role: 'user', content: prompt }],
    format: 'json',
    options: {
      temperature: 0.1,
      num_predict: 800,  // cap output — thinking models can run forever otherwise
      num_ctx: 4096,
    },
    stream: true,
    think: false,        // disable chain-of-thought tokens if model supports it
  } as Parameters<typeof ollama.chat>[0])

  let content = ''
  for await (const chunk of stream) {
    const c = chunk as { message: { thinking?: string; content: string } }
    content += c.message.content  // skip thinking tokens, only keep content
  }

  return JSON.parse(content) as StructuredGuideline
}

// ── Auto-categorize a trick ───────────────────────────────────────────────────

export async function categorizeTrick(content: string): Promise<string> {
  const categories = [
    'airway_management',
    'cardiac',
    'obstetric',
    'pediatric',
    'pain_management',
    'emergency',
    'general',
  ]

  const ollama = getClient()
  const stream = await ollama.chat({
    model: model(),
    messages: [
      {
        role: 'user',
        content: `Classify this anesthesia tip into one category.
Categories: ${categories.join(', ')}
Tip: ${content}
Reply with ONLY the category name.`,
      },
    ],
    options: { temperature: 0 },
    stream: true,
  })

  let result = ''
  for await (const chunk of stream) result += chunk.message.content
  const cat = result.trim().toLowerCase()
  return categories.includes(cat) ? cat : 'general'
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function ollamaHealthy(): Promise<boolean> {
  try {
    const ollama = getClient()
    const list = await ollama.list()
    return list.models.some((m) => m.name.includes(model().split(':')[0]))
  } catch {
    return false
  }
}
