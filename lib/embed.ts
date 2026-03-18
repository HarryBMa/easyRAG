import { openai } from '@ai-sdk/openai'
import { embed as aiEmbed, embedMany } from 'ai'

function getModel() {
  return openai.embedding(process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small')
}

export async function embed(text: string): Promise<number[]> {
  const { embedding } = await aiEmbed({ model: getModel(), value: text })
  return embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return []
  const { embeddings } = await embedMany({ model: getModel(), values: texts })
  return embeddings
}

/** Split text into overlapping word-count chunks for indexing */
export function chunkText(text: string, size = 350, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let i = 0
  while (i < words.length) {
    const end = Math.min(i + size, words.length)
    chunks.push(words.slice(i, end).join(' '))
    if (end === words.length) break
    i += size - overlap
  }
  return chunks
}
