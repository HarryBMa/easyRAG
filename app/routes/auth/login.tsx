import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
})

function LoginPage() {
  const { signInWithEmail, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Already logged in — send to dashboard
  if (user) {
    navigate({ to: '/' })
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await signInWithEmail(email)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      setSent(true)
    }
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: '#080f1e' }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-2xl"
        style={{ background: '#0d1424', border: '1px solid #1e2d4a' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
            style={{ background: 'linear-gradient(135deg, #0284c7, #0d9488)' }}
          >
            Ps
          </div>
          <div>
            <p className="text-base font-bold text-slate-100">ProtocolSync AI</p>
            <p className="text-xs text-slate-500">Anesthesia Guideline Harmonizer</p>
          </div>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-3xl mb-3">✉️</div>
            <h2 className="text-lg font-semibold text-slate-100 mb-2">
              Check your email
            </h2>
            <p className="text-sm text-slate-400">
              We sent a magic link to <span className="text-sky-400">{email}</span>.
              Click it to sign in — no password needed.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Sign in</h2>
            <p className="text-sm text-slate-500 mb-6">
              Enter your institutional email to receive a magic link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="you@hospital.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none focus:ring-2 focus:ring-sky-500"
                style={{ background: '#0a1628', border: '1px solid #1e2d4a' }}
              />

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0284c7, #0d9488)' }}
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
