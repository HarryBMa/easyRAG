import {
  PowerSyncDatabase,
  type AbstractPowerSyncDatabase,
} from '@powersync/web';
import type { PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/web';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { AppSchema } from './schema';

class EasyRAGConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const res = await fetch('/api/powersync/token');
    if (!res.ok) {
      throw new Error(`Failed to fetch PowerSync token: ${res.status}`);
    }
    const data = (await res.json()) as { token: string; powersync_url: string };
    return {
      endpoint: data.powersync_url || (import.meta.env['VITE_POWERSYNC_URL'] as string),
      token: data.token,
    };
  }

  async uploadData(_database: AbstractPowerSyncDatabase): Promise<void> {
    // No local mutations to upload in read-only mode.
  }
}

const PowerSyncContext = createContext<PowerSyncDatabase | null>(null);

let _db: PowerSyncDatabase | null = null;

function getDatabase(): PowerSyncDatabase {
  if (!_db) {
    _db = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: 'easyrag.db' },
    });
    _db.connect(new EasyRAGConnector()).catch(console.error);
  }
  return _db;
}

interface PowerSyncProviderWrapperProps {
  children: ReactNode;
}

export function PowerSyncProviderWrapper({ children }: PowerSyncProviderWrapperProps) {
  const db = useMemo(() => getDatabase(), []);
  return (
    <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
  );
}

export function usePowerSync(): PowerSyncDatabase {
  const db = useContext(PowerSyncContext);
  if (!db) {
    throw new Error('usePowerSync must be used inside PowerSyncProviderWrapper');
  }
  return db;
}
