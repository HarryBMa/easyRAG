import { createRouter, createRoute } from '@tanstack/react-router';
import RootComponent, { Route as rootRoute } from './routes/__root';
import IndexPage from './routes/index';
import DocumentsPage from './routes/documents';
import UploadPage from './routes/upload';

// Suppress unused import warning — RootComponent is registered via rootRoute
void RootComponent;

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: IndexPage });
const documentsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/documents', component: DocumentsPage });
const uploadRoute = createRoute({ getParentRoute: () => rootRoute, path: '/upload', component: UploadPage });

const routeTree = rootRoute.addChildren([indexRoute, documentsRoute, uploadRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
