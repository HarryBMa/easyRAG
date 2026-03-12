import { Link, Outlet, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

export const Route = createRootRoute({
  component: RootComponent,
});

export default function RootComponent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '0 1.5rem',
            height: 60,
            display: 'flex',
            alignItems: 'center',
            gap: '2rem',
          }}
        >
          <Link
            to='/'
            style={{
              fontWeight: 700,
              fontSize: '1.25rem',
              color: 'var(--color-primary)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>🏥</span>
            <span>easyRAG</span>
          </Link>

          <nav style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
            <NavLink to='/'>Chat</NavLink>
            <NavLink to='/documents'>Documents</NavLink>
            <NavLink to='/upload'>Upload</NavLink>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '1.5rem' }}>
        <Outlet />
      </main>

      <TanStackRouterDevtools />
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none' }}
      activeProps={{ style: { padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: 500, color: 'var(--color-primary)', background: 'var(--color-primary-light)', textDecoration: 'none' } }}
    >
      {children}
    </Link>
  );
}
