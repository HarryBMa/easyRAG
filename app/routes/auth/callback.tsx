import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getBrowserClient } from '../../../lib/auth'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

/**
 * Supabase redirects here after magic link / OAuth.
 * The URL contains a `code` param which we exchange for a session.
 */
function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const supabase = getBrowserClient()

    supabase.auth.exchangeCodeForSession(window.location.search).then(() => {
      navigate({ to: '/' })
    })
  }, [navigate])

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: '#080f1e' }}
    >
      <p className="text-sm text-slate-400">Signing you in…</p>
    </div>
  )
}
