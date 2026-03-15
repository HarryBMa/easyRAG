import { getBrowserClient } from '../../lib/auth'

/**
 * Returns a vote() function that attaches the Supabase JWT as the
 * Authorization header. Returns false if the user is not logged in.
 */
export function useVote() {
  const vote = async (
    entityType: 'guideline' | 'trick',
    entityId: string,
    voteType: 'up' | 'down',
  ): Promise<{ ok: boolean; unauthenticated?: boolean }> => {
    const supabase = getBrowserClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return { ok: false, unauthenticated: true }

    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        entity_type: entityType,
        entity_id: entityId,
        vote_type: voteType,
      }),
    })

    return { ok: res.ok }
  }

  return { vote }
}
