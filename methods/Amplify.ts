import { type Schema } from '@/amplify/data/resource';
import { observablePersistIndexedDB } from '@/plugins/indexeddb';
import { observablePersistMMKV } from '@/plugins/mmkv';
import {
  Observable,
  observable,
  ObservableSyncState,
  syncState,
} from '@legendapp/state';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { DateTime } from 'luxon';
import { Platform } from 'react-native';
import outputs from '../amplify_outputs.json';

const accountId = 'poc';

// Amplify
Amplify.configure(outputs);
const client = generateClient<Schema>();
const tableNames = Object.keys(client.models) as (keyof Schema)[];

// Amplify Plugin
interface SyncedAmplifyProps<T extends keyof Schema> {
  name: T;
  limit?: number;
}

// Type helpers for better type inference
export type SchemaModelType<T extends keyof Schema> = Schema[T]['type'];
export type SchemaModelInput<T extends keyof Schema> = Partial<
  SchemaModelType<T>
> & {
  id?: string;
};

export const syncedAmplify = <T extends keyof Schema>({
  name,
  limit,
}: SyncedAmplifyProps<T>) => {
  return syncedCrud({
    list: async ({ lastSync, refresh }): Promise<SchemaModelType<T>[]> => {
      try {
        if (data$[name].currentSync.peek() === undefined) {
          data$[name].currentSync.set(lastSync || 0);
        }

        const model = client.models[name] as any;
        const listMethodName = `list${name}ByAccountIdAndUpdatedAt` as const;
        const { data, errors, nextToken } = await model[listMethodName](
          {
            accountId,
            updatedAt: {
              gt: DateTime.fromMillis(data$[name].currentSync.peek() || 0)
                .toUTC()
                .toISO()!,
            },
          },
          {
            limit,
            nextToken: data$[name].nextToken.peek(),
            sortDirection: 'DESC',
          }
        );

        if (errors) {
          throw errors;
        } else if (nextToken) {
          data$[name].nextToken.set(nextToken);
          refresh();
        } else {
          data$[name].currentSync.set(undefined);
          data$[name].nextToken.set(undefined);
        }

        return data as SchemaModelType<T>[];
      } catch (error) {
        console.error('Error fetching list', error);
        throw error;
      }
    },
    create: async (input: SchemaModelInput<T>): Promise<SchemaModelType<T>> => {
      try {
        (input as any).accountId = accountId; // Replace with createMutation

        const model = client.models[name] as any;
        const { data, errors } = await model.create(input);
        if (errors) {
          throw errors;
        }
        return data as SchemaModelType<T>;
      } catch (error) {
        console.error('Error creating item', error);
        throw error;
      }
    },
    update: async (input: SchemaModelInput<T>): Promise<SchemaModelType<T>> => {
      try {
        (input as any).accountId = accountId; // Replace with updateMutation

        const model = client.models[name] as any;
        const { data, errors } = await model.update(input);
        if (errors) {
          throw errors;
        }
        return data as SchemaModelType<T>;
      } catch (error) {
        console.error('Error updating item', error);
        throw error;
      }
    },
    delete: async (input: SchemaModelInput<T>) => {
      try {
        (input as any).accountId = accountId; // Replace with deleteMutation
        (input as any).deleted = true; // Soft delete

        const model = client.models[name] as any;
        const { data, errors } = await model.update(input);
        if (errors) {
          throw errors;
        }
        return data as SchemaModelType<T>;
      } catch (error) {
        console.error('Error deleting item', error);
        throw error;
      }
    },
    subscribe: ({ refresh }) => {
      const model = client.models[name] as any;
      const c = model.onCreate().subscribe({ next: refresh });
      const u = model.onUpdate().subscribe({ next: refresh });
      const d = model.onDelete().subscribe({ next: refresh });
      return () => {
        c.unsubscribe();
        u.unsubscribe();
        d.unsubscribe();
      };
    },
    onSaved: ({ saved }) => {
      return saved;
    },
    persist: {
      plugin: Platform.select<any>({
        native: observablePersistMMKV({
          id: 'poc',
        }),
        web: observablePersistIndexedDB({
          databaseName: 'poc',
          version: 2,
          tableNames,
        }),
      }),
      name,
      retrySync: true,
    },
    retry: {
      infinite: true,
      maxDelay: 30,
    },
    mode: 'assign',
    changesSince: 'last-sync',
    waitFor: isAuthed$,
    updatePartial: true,
    fieldCreatedAt: 'createdAt',
    fieldUpdatedAt: 'updatedAt',
    fieldDeleted: 'deleted',
  });
};

const listFromObject = <T>(obj: Record<string, T>): T[] =>
  Object.values(obj || {});

const countKeys = (all: Record<string, any>): number =>
  Object.keys(all || {}).length;

interface ModelState<T extends keyof Schema> {
  currentSync?: number;
  nextToken?: string | null;
  all: Record<string, SchemaModelType<T>>;
  list: Schema[T]['type'][];
  count: number;
  changed?: number;
  state: Observable<ObservableSyncState>;
}

type DataStore = {
  [K in keyof Schema]: ModelState<K>;
};

export const isAuthed$ = observable(false);

export const data$ = observable<DataStore>({
  Client: {
    all: syncedAmplify({
      name: 'Client',
      limit: 100,
    }) as Record<string, SchemaModelType<'Client'>>,
    list: () => listFromObject(data$.Client.all),
    count: (): number => countKeys(data$.Client.all),
    state: () => syncState(data$.Client.all),
  },
  Todo: {
    all: syncedAmplify({
      name: 'Todo',
      limit: 1000,
    }) as Record<string, SchemaModelType<'Todo'>>,
    list: () =>
      listFromObject(data$.Todo.all).sort(
        (a, b) => +new Date(b.createdAt.get()!) - +new Date(a.createdAt.get()!)
      ),
    count: (): number => countKeys(data$.Todo.all),
    state: () => syncState(data$.Todo.all),
  },
});

// Setup change tracker for re-rendering lists
for (const modelName of Object.keys(data$) as (keyof Schema)[]) {
  data$[modelName].all.onChange(() => {
    data$[modelName].changed.set(+DateTime.now());
  });
}
