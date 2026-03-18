import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import { setDefaultResultOrder } from 'dns'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'

// Force IPv4 DNS resolution — WSL2 cannot route IPv6 to external hosts
setDefaultResultOrder('ipv4first')

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ─── API Routes Middleware Plugin ───────────────────────────────────────────
//
// TanStack Start v1.163+ removed createAPIFileRoute.
// This plugin re-implements file-based API routing as a Vite dev middleware.
// Route files in app/routes/api/ export an `APIRoute` object with HTTP handlers.

interface RouteEntry {
  pattern: RegExp
  paramNames: string[]
  filePath: string
}

function buildRouteMap(appDir: string): RouteEntry[] {
  const apiDir = join(appDir, 'routes', 'api')
  const files = readdirSync(apiDir).filter((f) => f.endsWith('.ts'))

  return files.map((file) => {
    const withoutExt = file.replace(/\.ts$/, '')
    const segments = withoutExt.split('.')
    const patternParts: string[] = []
    const paramNames: string[] = []

    for (const seg of segments) {
      if (seg.startsWith('$')) {
        paramNames.push(seg.slice(1))
        patternParts.push('([^/]+)')
      } else {
        patternParts.push(seg)
      }
    }

    return {
      pattern: new RegExp(`^/api/${patternParts.join('/')}(?:\\?.*)?$`),
      paramNames,
      filePath: join(apiDir, file),
    }
  })
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function apiRoutesPlugin(appDir: string): Plugin {
  let routeMap: RouteEntry[]

  return {
    name: 'api-routes',
    configureServer(server: ViteDevServer) {
      routeMap = buildRouteMap(appDir)

      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const rawUrl = req.url ?? ''
          const pathname = rawUrl.split('?')[0]

          if (!pathname.startsWith('/api/')) return next()

          // Match route
          let matchedEntry: RouteEntry | null = null
          const params: Record<string, string> = {}

          for (const entry of routeMap) {
            const m = rawUrl.match(entry.pattern)
            if (m) {
              matchedEntry = entry
              entry.paramNames.forEach((name, i) => {
                params[name] = m[i + 1]
              })
              break
            }
          }

          if (!matchedEntry) return next()

          try {
            // Use Vite's SSR module runner to load the route file
            const mod = await server.ssrLoadModule(matchedEntry.filePath)
            const apiRoute = mod.APIRoute as Record<string, unknown> | undefined
            if (!apiRoute) return next()

            const method = (req.method ?? 'GET').toUpperCase()
            const handler = apiRoute[method] as
              | ((ctx: { request: Request; params: Record<string, string> }) => Promise<Response>)
              | undefined

            if (!handler) {
              res.statusCode = 405
              res.end('Method Not Allowed')
              return
            }

            const body = await readBody(req)
            const request = new Request(`http://localhost${rawUrl}`, {
              method,
              headers: req.headers as Record<string, string>,
              body:
                method !== 'GET' && method !== 'HEAD' && body.length > 0
                  ? body
                  : undefined,
            })

            const response = await handler({ request, params })

            res.statusCode = response.status
            response.headers.forEach((value, key) => res.setHeader(key, value))
            res.end(Buffer.from(await response.arrayBuffer()))
          } catch (err) {
            console.error('[api-routes]', err)
            res.statusCode = 500
            res.end(String(err))
          }
        },
      )
    },
  }
}
// ────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [
    tanstackStart({ srcDirectory: 'app', server: { preset: 'node-server' } }),
    tsConfigPaths(),
    tailwindcss(),
    apiRoutesPlugin(resolve(__dirname, 'app')),
  ],
  resolve: {
    alias: {
      // Map the removed @tanstack/react-start/api to our local shim
      '@tanstack/react-start/api': resolve(__dirname, 'lib/api-file-route.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['better-sqlite3'],
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
})
