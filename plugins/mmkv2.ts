import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv';
import type {
  ObservablePersistPlugin,
  PersistOptions,
} from '@legendapp/state/sync';

class PatchedObservablePersistMMKV extends (ObservablePersistMMKV as any) {
  public getTable<T = any>(
    table: string,
    init: object,
    config: PersistOptions
  ): T {
    const storage = this.getStorage(config);
    if (this.data[table] === undefined) {
      try {
        const value = storage.getString(table);
        this.data[table] = value ? JSON.parse(value) : init;
      } catch {
        console.error('[legend-state] MMKV failed to parse', table);
      }
    }
    return this.data[table];
  }

  private save(table: string, config: PersistOptions) {
    const storage = this.getStorage(config);
    const v = this.data[table];
    if (v !== undefined) {
      try {
        console.log('Saving', table, v);
        storage.set(table, JSON.stringify(v));
      } catch (err) {
        console.error(err);
      }
    } else {
      storage.delete(table);
    }
  }
}

const Typed =
  PatchedObservablePersistMMKV as unknown as ObservablePersistPlugin;

export { Typed as ObservablePersistMMKV };
