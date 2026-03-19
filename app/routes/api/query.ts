import { createAPIFileRoute } from '@tanstack/react-start/api'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { embed } from '../../../lib/embed'
import { ensureCollection, searchSimilar } from '../../../lib/milvus'

export const APIRoute = createAPIFileRoute('/api/query')({
  POST: async ({ request }) => {
    const { question, docIds } = (await request.json()) as {
      question: string
      docIds?: string[]
    }

    if (!question?.trim()) {
      return new Response(JSON.stringify({ error: 'No question provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await ensureCollection()

    const queryEmbedding = await embed(question)

    let filter: string | undefined
    if (docIds?.length) {
      filter = `guideline_id in [${docIds.map((id) => `"${id}"`).join(', ')}]`
    }

    const hits = await searchSimilar(queryEmbedding, 8, filter)

    if (!hits.length) {
      const empty = streamText({
        model: openai(process.env.LLM_MODEL ?? 'gpt-4o-mini'),
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `No protocol context found for: "${question}"\n\nIndicate that no relevant protocols are indexed yet and suggest uploading relevant documents.`,
          },
        ],
      })
      return empty.toDataStreamResponse()
    }

    // Build numbered context with guideline IDs for source attribution
    const context = hits
      .map((h, i) => `[${i + 1}] (guideline: ${h.guideline_id})\n${h.content}`)
      .join('\n\n---\n\n')

    const stream = streamText({
      model: openai(process.env.LLM_MODEL ?? 'gpt-4o-mini'),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Protocol context:\n\n${context}\n\n---\n\nClinical question: ${question}`,
        },
      ],
    })

    return stream.toDataStreamResponse()
  },
})

const SYSTEM_PROMPT = `You are Project Aether, a clinical decision support AI for anesthesia and perioperative care.

You answer questions strictly based on the indexed protocol context provided. Follow these rules:

1. CITE SOURCES — reference which context section supports each claim using [1], [2], etc.
2. DRUG SAFETY — always flag doses and drug names for verification against current institutional formulary.
3. STAY IN SCOPE — if the answer is not in the context, say explicitly: "This is not covered by the indexed protocols." Do not speculate.
4. CLINICAL FORMAT — structure answers clearly: indication → procedure → drugs/doses → monitoring → contraindications.
5. UNCERTAINTY — if protocols conflict or confidence seems low, say so. A wrong answer in anesthesia is dangerous.

Never invent drug doses, procedures, or citations. Patient safety is the only priority.`
