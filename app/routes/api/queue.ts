import { createAPIFileRoute } from '@tanstack/react-start/api'
import { initDb } from '../../../lib/turso'
import { getQueueStats, ensureWorker } from '../../../lib/queue'

export const APIRoute = createAPIFileRoute('/api/queue')({
  GET: async () => {
    await initDb()
    ensureWorker()
    const stats = await getQueueStats()
    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
