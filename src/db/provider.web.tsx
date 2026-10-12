// Web (PWA): content cache and user data in IndexedDB. See provider.tsx for Android.
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { openWebContent, type ContentDb } from './content.web';
import { getAllSettings, openUserDb, type UserDb } from './user.web';

export interface OpenedDatabases {
  content: ContentDb;
  user: UserDb;
  settings: Record<string, string>;
}

let opening: Promise<OpenedDatabases> | null = null;

async function openAll(): Promise<OpenedDatabases> {
  const [content, user] = await Promise.all([openWebContent(), openUserDb()]);
  return { content, user, settings: await getAllSettings(user) };
}

export function DatabaseProvider({ children }: { children: (dbs: OpenedDatabases) => ReactNode }) {
  const [opened, setOpened] = useState<OpenedDatabases | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    opening ??= openAll();
    opening.then(setOpened, (e: unknown) => {
      opening = null; // allow "Pokušaj ponovo"
      setError(e instanceof Error ? e : new Error(String(e)));
    });
  }, []);

  if (error) throw error;
  if (opened) return children(opened);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F0E3', gap: 16 }}>
      <ActivityIndicator color="#9A7531" />
      <Text style={{ color: '#6B6252', fontSize: 16 }}>Faithly se učitava…</Text>
    </View>
  );
}
