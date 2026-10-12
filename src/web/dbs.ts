// On the web build useApp() carries the IndexedDB adapters; this gives them their real types
// (the shared AppState is typed with the native SQLite handles).
import type { WebContentDb } from '@/db/content.web';
import type { UserDb } from '@/db/user.web';
import { useApp } from '@/state/app';

export function useWebDbs(): { content: WebContentDb; user: UserDb } {
  const { content, user } = useApp();
  return { content: content as unknown as WebContentDb, user: user as unknown as UserDb };
}
