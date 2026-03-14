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

    const hits = await searchSimilar(queryEmbedding, 6, filter)

    const context = hits
      .map((h, i) => `[${i + 1}] ${h.content}`)
      .join('\n\n')

    const model = openai(process.env.LLM_MODEL ?? 'gpt-4o-mini')

    const stream = streamText({
      model,
      system: `You are a helpful assistant that answers questions based on the provided document context.
Be concise and accurate. If the answer is not in the context, say so.`,
      messages: [
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    })

    return stream.toDataStreamResponse()
  },
})
