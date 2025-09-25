import { observablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import { configureSynced } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';

// Setup global sync and persist configuration
export const localFirst = configureSynced(syncedCrud, {
  persist: {
    name: 'data',
    plugin: observablePersistIndexedDB({
      databaseName: 'poc',
      version: 1,
      tableNames: ['todos', 'store'],
    }),
    retrySync: true,
  },
  retry: {
    infinite: true,
  },
  waitFor: globalStore$.signedIn,
});
