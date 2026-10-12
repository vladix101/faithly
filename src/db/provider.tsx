// Native: opens the bundled SQLite content database and the user's SQLite database.
// The web build uses provider.web.tsx (IndexedDB) instead.
import { useEffect, useState, type ReactNode } from 'react';
import { deleteDatabaseAsync, openDatabaseAsync, SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

import contentMeta from '@/assets/db/content.json';

import { verifyContent, type ContentDb } from './content';
import { getAllSettings, migrateUserDb, setSetting, USER_DB_NAME, type UserDb } from './user';

export interface OpenedDatabases {
  content: ContentDb;
  user: UserDb;
  /** Raw settings rows read at startup */
  settings: Record<string, string>;
}

/** A new file name for every content build, so an app update imports the new asset. */
const CONTENT_DB_NAME = `content-${contentMeta.content_version}-${contentMeta.sha256.slice(0, 10)}.db`;

function OpenUser({ children }: { children: (dbs: OpenedDatabases) => ReactNode }) {
  const content = useSQLiteContext();
  const [opened, setOpened] = useState<OpenedDatabases | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await openDatabaseAsync(USER_DB_NAME);
      await migrateUserDb(user);
      const settings = await getAllSettings(user);
      // Remove the previous content database after an update imported a new one.
      if (settings.contentDbName && settings.contentDbName !== CONTENT_DB_NAME) {
        await deleteDatabaseAsync(settings.contentDbName).catch(() => undefined);
      }
      await setSetting(user, 'contentDbName', CONTENT_DB_NAME);
      if (!cancelled) setOpened({ content, user, settings });
    })().catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (error) throw error;
  return opened ? children(opened) : null;
}

export function DatabaseProvider({ children }: { children: (dbs: OpenedDatabases) => ReactNode }) {
  return (
    <SQLiteProvider
      databaseName={CONTENT_DB_NAME}
      assetSource={{ assetId: require('@/assets/db/content.db') }}
      onInit={(db) => verifyContent(db, contentMeta.schema_version)}>
      <OpenUser>{children}</OpenUser>
    </SQLiteProvider>
  );
}
