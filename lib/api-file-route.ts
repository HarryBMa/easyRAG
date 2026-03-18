/**
 * Compatibility shim for @tanstack/react-start/api
 *
 * createAPIFileRoute was removed in TanStack Start v1.163+.
 * This shim preserves the same call signature so existing route files
 * need zero changes. The Vite plugin in vite.config.ts handles routing.
 */

type Handler = (ctx: {
  request: Request
  params: Record<string, string>
}) => Promise<Response> | Response

export interface RouteMethods {
  GET?: Handler
  POST?: Handler
  PUT?: Handler
  PATCH?: Handler
  DELETE?: Handler
  HEAD?: Handler
  OPTIONS?: Handler
}

export function createAPIFileRoute(_path: string) {
  return (methods: RouteMethods): RouteMethods => methods
}
