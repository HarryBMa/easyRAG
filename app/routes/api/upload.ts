import { createAPIFileRoute } from '@tanstack/react-start/api'
import { initDb } from '../../../lib/turso'
import { enqueue } from '../../../lib/queue'

export const APIRoute = createAPIFileRoute('/api/upload')({
  POST: async ({ request }) => {
    const formData = await request.formData()
    const file = formData.get('file')
    const hospital = (formData.get('hospital') as string) || undefined

    if (!(file instanceof File)) {
      return json({ error: 'No file provided' }, 400)
    }

    await initDb()
    const jobId = await enqueue(file, hospital)

    return json({ id: jobId, name: file.name, status: 'queued' }, 202)
  },
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
