import { ObservablePersistMMKV } from '@/plugins/mmkv';
import { globalStore$ } from '@/stores/global';
import { configureSynced } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';

// Setup global sync and persist configuration
export const localFirst = configureSynced(syncedCrud, {
  persist: {
    name: 'data',
    plugin: new ObservablePersistMMKV({
      id: 'poc',
    }),
    retrySync: true,
  },
  retry: {
    infinite: true,
  },
  waitFor: globalStore$.signedIn,
});
