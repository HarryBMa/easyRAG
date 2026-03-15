import { createClient } from '@supabase/supabase-js'

/**
 * Browser-side Supabase client.
 * Uses VITE_* env vars so they are included in the client bundle.
 */
export function getBrowserClient() {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  )
}

/**
 * Server-side: verify a Bearer JWT from an Authorization header.
 * Returns the Supabase user ID, or null if invalid / missing.
 *
 * Uses the service-role key so it can validate any user's token
 * without a user session on the server.
 */
export async function verifyAuthHeader(
  authHeader: string | null | undefined,
): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)

  const server = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const {
    data: { user },
    error,
  } = await server.auth.getUser(token)

  if (error || !user) return null
  return user.id
}
