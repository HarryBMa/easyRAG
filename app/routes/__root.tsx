import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from '../context/AuthContext'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'ProtocolSync AI' },
    ],
  }),
  component: RootComponent,
})

const NAV = [
  { to: '/', label: 'Dashboard', icon: '⬡' },
  { to: '/guidelines', label: 'Guidelines', icon: '📋' },
  { to: '/tricks', label: 'Tricks', icon: '💡' },
  { to: '/trends', label: 'Trends', icon: '📈' },
] as const

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <Outlet />
            </div>
          </div>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}

function Sidebar() {
  const state = useRouterState()
  const path = state.location.pathname
  const { user, signOut, loading } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/auth/login' })
  }

  return (
    <aside
      style={{ background: '#0d1424', borderRight: '1px solid #1e2d4a' }}
      className="w-56 flex flex-col shrink-0"
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #0284c7, #0d9488)' }}
          >
            Ps
          </div>
          <div>
            <p className="text-sm font-bold text-slate-100 leading-tight">
              ProtocolSync
            </p>
            <p className="text-[10px] text-slate-500 leading-tight">AI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV.map(({ to, label, icon }) => {
          const active = to === '/' ? path === '/' : path.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-sky-600/20 text-sky-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User / Auth Footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: '#1e2d4a' }}>
        {!loading && (
          <>
            {user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Avatar initials */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #0284c7, #0d9488)' }}
                  >
                    {(user.email?.[0] ?? '?').toUpperCase()}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/auth/login"
                className="text-[11px] text-sky-500 hover:text-sky-400 transition-colors"
              >
                Sign in
              </Link>
            )}
          </>
        )}
        <p className="text-[10px] text-slate-700 mt-2">
          PowerSync Hackathon 2026
        </p>
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
      <header
        className="px-8 py-5 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid #1e2d4a' }}
      >
        <div>
          <h1 className="text-xl font-bold text-slate-100">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
