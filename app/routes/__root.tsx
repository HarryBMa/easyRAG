import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { AuthProvider, useAuth } from '../context/AuthContext'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Project Aether' },
    ],
    links: [
      // Preconnect reduces Google Fonts latency from ~200ms to ~50ms
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
    ],
  }),
  component: RootComponent,
})

const NAV = [
  { to: '/',           label: 'Dashboard', icon: <IconDash /> },
  { to: '/guidelines', label: 'Protocols', icon: <IconProtocol /> },
  { to: '/tricks',     label: 'Tricks',    icon: <IconTrick /> },
  { to: '/trends',     label: 'Trends',    icon: <IconTrend /> },
] as const

function RootComponent() {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        <AuthProvider>
          <AuthGuard>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-grid" style={{ background: '#020912' }}>
                <Outlet />
              </div>
            </div>
          </AuthGuard>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const state = useRouterState()
  const path = state.location.pathname

  useEffect(() => {
    if (!loading && !user && !path.startsWith('/auth')) {
      navigate({ to: '/auth/login' })
    }
  }, [loading, user, path, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#020912' }}>
        <svg width="56" height="18" viewBox="0 0 56 18">
          <polyline
            className="ecg-line"
            points="0,9 10,9 13,2 16,16 19,9 23,9 30,9 33,3 36,15 39,9 43,9 56,9"
            fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }

  if (path.startsWith('/auth')) return <>{children}</>
  if (!user) return null
  return <>{children}</>
}

function Sidebar() {
  const state = useRouterState()
  const path = state.location.pathname
  const { user, signOut, loading } = useAuth()
  const navigate = useNavigate()

  return (
    <aside className="w-[196px] flex flex-col shrink-0" style={{
      background: '#040c1a',
      borderRight: '1px solid rgba(0,212,255,0.07)',
    }}>
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="relative w-8 h-8 flex items-center justify-center shrink-0 rounded-lg" style={{
            background: 'linear-gradient(135deg, rgba(0,212,255,0.10), rgba(0,255,136,0.04))',
            border: '1px solid rgba(0,212,255,0.20)',
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <ellipse cx="10" cy="10" rx="8" ry="3.2" stroke="#00d4ff" strokeWidth="1" opacity="0.65"/>
              <ellipse cx="10" cy="10" rx="8" ry="3.2" stroke="#00d4ff" strokeWidth="1" opacity="0.65" transform="rotate(60 10 10)"/>
              <ellipse cx="10" cy="10" rx="8" ry="3.2" stroke="#00d4ff" strokeWidth="1" opacity="0.65" transform="rotate(120 10 10)"/>
              <circle cx="10" cy="10" r="1.8" fill="#00d4ff"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold leading-none mb-0.5" style={{ fontFamily: "'Syne', sans-serif", color: '#e2eaf5' }}>
              Project Aether
            </p>
            <p className="text-[9px] leading-none tracking-widest" style={{
              fontFamily: "'IBM Plex Mono', monospace",
              color: '#00d4ff',
              opacity: 0.7,
            }}>
              BETA
            </p>
          </div>
        </div>
        {/* ECG decoration */}
        <svg width="100%" height="12" viewBox="0 0 155 12" preserveAspectRatio="none">
          <polyline
            className="ecg-line"
            points="0,6 22,6 25,1 28,11 31,6 35,6 50,6 53,2 56,10 59,6 63,6 155,6"
            fill="none" stroke="#00d4ff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </div>

      <p className="px-5 mb-1.5 text-[9px] font-semibold tracking-[0.14em] uppercase" style={{
        fontFamily: "'IBM Plex Mono', monospace",
        color: '#1e3650',
      }}>Menu</p>

      {/* Nav */}
      <nav className="flex-1 px-2.5 space-y-px">
        {NAV.map(({ to, label, icon }) => {
          const active = to === '/' ? path === '/' : path.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className="relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-150"
              aria-current={active ? 'page' : undefined}
              style={{
                fontSize: 'var(--text-body)',
                letterSpacing: 'var(--tracking-body)',
                background: active ? 'rgba(0,212,255,0.07)' : 'transparent',
                color: active ? '#00d4ff' : '#3d5a76',
                fontFamily: "'Syne', sans-serif",
                fontWeight: active ? 600 : 400,
              }}
            >
              {active && <span className="nav-pip" />}
              <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Queue indicator */}
      <QueueIndicator />

      {/* Footer */}
      <div className="px-4 py-3.5" style={{ borderTop: '1px solid rgba(0,212,255,0.06)' }}>
        {!loading && user ? (
          <div>
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0" style={{
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.18)',
                color: '#00d4ff',
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
                {(user.email?.[0] ?? '?').toUpperCase()}
              </div>
              <p className="truncate" style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 'var(--text-label)',
                color: '#2d4a68',
              }}>
                {user.email}
              </p>
            </div>
            <button
              onClick={async () => { await signOut(); navigate({ to: '/auth/login' }) }}
              className="transition-colors"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 'var(--text-label)',
                letterSpacing: '0.1em',
                color: '#1e3650',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#3d5a76'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#1e3650'}
            >
              SIGN OUT
            </button>
          </div>
        ) : (
          <Link
            to="/auth/login"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 'var(--text-label)',
              letterSpacing: '0.1em',
              color: '#00d4ff',
            }}
          >
            SIGN IN →
          </Link>
        )}
      </div>
    </aside>
  )
}

export function PageShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="px-8 py-4 flex items-center justify-between shrink-0" style={{
        borderBottom: '1px solid rgba(0,212,255,0.07)',
        background: 'rgba(4,12,26,0.85)',
        backdropFilter: 'blur(12px)',
      }}>
        <div>
          <h1 className="type-heading font-bold leading-none" style={{
            fontSize: 'var(--text-heading)',
            color: '#e2eaf5',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p className="type-label mt-1" style={{
              color: '#1e3650',
              letterSpacing: '0.08em',
            }}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </header>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

/* ── Queue indicator ── */
function QueueIndicator() {
  const [active, setActive] = useState(0)
  const [failed, setFailed] = useState(0)

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/queue')
        if (!res.ok) return
        const data = await res.json() as { pending: number; processing: number; failed: number }
        setActive(data.pending + data.processing)
        setFailed(data.failed)
      } catch { /* server not ready yet */ }
    }
    poll()
    const id = setInterval(poll, 5_000)
    return () => clearInterval(id)
  }, [])

  if (active === 0 && failed === 0) return null

  return (
    <div className="mx-3 mb-2 px-3 py-2 rounded-lg" style={{
      background: failed > 0 ? 'rgba(255,51,85,0.05)' : 'rgba(0,212,255,0.04)',
      border: `1px solid ${failed > 0 ? 'rgba(255,51,85,0.15)' : 'rgba(0,212,255,0.1)'}`,
    }}>
      <div className="flex items-center gap-2">
        {active > 0 && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{
            background: '#00d4ff',
            boxShadow: '0 0 4px #00d4ff',
          }} />
        )}
        {failed > 0 && active === 0 && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#ff3355' }} />
        )}
        <p className="type-label leading-none" style={{
          color: failed > 0 && active === 0 ? '#ff335580' : '#00d4ff80',
          letterSpacing: '0.1em',
        }}>
          {active > 0 ? `${active} QUEUED` : `${failed} FAILED`}
        </p>
      </div>
    </div>
  )
}

/* ── Icons ── */
function IconDash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="4.5" height="4.5" rx="1"/>
      <rect x="8.5" y="1" width="4.5" height="4.5" rx="1"/>
      <rect x="1" y="8.5" width="4.5" height="4.5" rx="1"/>
      <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="1"/>
    </svg>
  )
}
function IconProtocol() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="12" height="12" rx="1.5"/>
      <line x1="3.5" y1="5" x2="10.5" y2="5"/>
      <line x1="3.5" y1="7.5" x2="8" y2="7.5"/>
      <line x1="3.5" y1="10" x2="6.5" y2="10"/>
    </svg>
  )
}
function IconTrick() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M7 1l1.5 3 3.5.5-2.5 2.4.6 3.6L7 9l-3.1 1.5.6-3.6L2 4.5l3.5-.5z"/>
    </svg>
  )
}
function IconTrend() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <polyline points="1,11 4.5,6.5 8,8.5 13,2.5"/>
      <polyline points="10,2.5 13,2.5 13,5.5"/>
    </svg>
  )
}
