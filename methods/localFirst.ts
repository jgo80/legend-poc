import { globalStore$ } from '@/stores/global';
import { observablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import {
  configureSynced,
  transformStringifyDates,
} from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
transformStringifyDates;

// Setup global sync and persist configuration
export const localFirst = configureSynced(syncedCrud, {
  persist: {
    name: 'data',
    plugin: observablePersistIndexedDB({
      databaseName: 'poc',
      version: 1,
      tableNames: ['todos'],
    }),
    retrySync: true,
  },
  retry: {
    infinite: true,
  },
  waitFor: globalStore$.signedIn,
});
