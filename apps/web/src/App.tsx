import { RouterProvider } from '@tanstack/react-router';
import { PowerSyncProviderWrapper } from './powersync/PowerSyncProvider';
import { router } from './router';

export default function App() {
  return (
    <PowerSyncProviderWrapper>
      <RouterProvider router={router} />
    </PowerSyncProviderWrapper>
  );
}
