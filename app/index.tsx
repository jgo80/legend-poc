import { type Schema } from '@/amplify/data/resource';
import { ObservablePersistMMKV } from '@/plugins/mmkv';
import {
  batch,
  Observable,
  observable,
  ObservableSyncState,
  syncState,
} from '@legendapp/state';
import { observablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import { observer } from '@legendapp/state/react';
import { configureSynced } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { FlashList } from '@shopify/flash-list';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { DateTime } from 'luxon';
import { useEffect } from 'react';
import { Button, Platform, ScrollView, Text, View } from 'react-native';
import { uuid } from 'short-uuid';
import outputs from '../amplify_outputs.json';

const accountId = 'poc';

// Amplify
Amplify.configure(outputs);
const client = generateClient<Schema>();
const tableNames = Object.keys(client.models) as (keyof Schema)[];

// Global Stores
const isAuthed$ = observable(false);

// Sync & Persist
const syncPlugin = configureSynced(syncedCrud, {
  persist: {
    plugin: Platform.select<any>({
      native: new ObservablePersistMMKV({
        id: 'poc',
      }),
      web: observablePersistIndexedDB({
        databaseName: 'poc',
        version: 2,
        tableNames,
      }),
    }),
    retrySync: true,
  },
  retry: {
    infinite: true,
    maxDelay: 30,
  },
  mode: 'assign',
  changesSince: 'last-sync',
  waitFor: isAuthed$,
});

// Amplify Plugin
interface AmplifyCrudProps<T extends keyof Schema> {
  name: T;
  limit?: number;
}

// Type helpers for better type inference
type SchemaModelType<T extends keyof Schema> = Schema[T]['type'];
type SchemaModelInput<T extends keyof Schema> = Partial<SchemaModelType<T>> & {
  id?: string;
};

const amplifyCrud = <T extends keyof Schema>({
  name,
  limit,
}: AmplifyCrudProps<T>) => {
  // Type assertion for the model to avoid ts-ignore

  return syncPlugin({
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
    persist: { name },
    updatePartial: true,
    fieldCreatedAt: 'createdAt',
    fieldUpdatedAt: 'updatedAt',
    fieldDeleted: 'deleted',
  });
};

const listFromObject = <T,>(obj: Record<string, T>): T[] =>
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

const data$ = observable<DataStore>({
  Client: {
    all: amplifyCrud({
      name: 'Client',
      limit: 100,
    }) as Record<string, SchemaModelType<'Client'>>,
    list: () => listFromObject(data$.Client.all),
    count: (): number => countKeys(data$.Client.all),
    state: () => syncState(data$.Client.all),
  },
  Todo: {
    all: amplifyCrud({
      name: 'Todo',
      limit: 1000,
    }) as Record<string, SchemaModelType<'Todo'>>,
    list: () =>
      listFromObject(data$.Todo.all).sort(
        (a, b) => +new Date(a.createdAt.get()!) - +new Date(b.createdAt.get()!)
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

// Render Page
const Page = observer(() => {
  return (
    <View
      style={{
        ...Platform.select({
          web: { height: '100vh' } as any,
          native: { flex: 1 },
        }),
        gap: 10,
      }}
    >
      <Worker />
      <Menu />
      <FlashList
        data={data$.Todo.list}
        extraData={data$.Todo.changed.get()}
        keyExtractor={(item) => item.id.get()}
        renderItem={({ item }) => {
          const { title, createdAt, completed } = item;
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 40,
                gap: 10,
                padding: 10,
              }}
            >
              <Text>{title.get()}</Text>
              <Text>
                {DateTime.fromISO(createdAt.get()!).toLocaleString(
                  DateTime.DATETIME_SHORT_WITH_SECONDS
                )}
              </Text>
              <Text
                onPress={() => {
                  completed.set((prev) => !prev);
                }}
              >
                {completed.get() ? '✅' : '⬜️'}
              </Text>
            </View>
          );
        }}
      />
      <Footer />
    </View>
  );
});

export default Page;

const Worker = () => {
  useEffect(() => {
    fetchAuthSession().then((session) => {
      if (session.userSub) {
        isAuthed$.set(true);
      }
    });
  }, []);
  return <></>;
};

const Menu = observer(() => {
  return (
    <ScrollView
      horizontal
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ flexDirection: 'row', gap: 10 }}
    >
      <Button
        title={'Sign In'}
        onPress={() => {
          signIn({
            username: 'mail@joey.aero',
            password: '$Password123',
          });
        }}
      />
      <Button
        title={'Clear'}
        onPress={() => {
          data$.Todo.state.resetPersistence().then(async () => {
            console.log('Cleared');
          });
        }}
      />
      <Button
        title={'Sync'}
        onPress={() => {
          data$.Todo.state.sync().then(() => {
            console.log('Synced');
          });
        }}
      />
      <Button
        title={'Re-Sync'}
        onPress={() => {
          data$.Todo.state.sync({ resetLastSync: true });
        }}
      />
      <Button
        title={'Add 100 Todos'}
        onPress={() => {
          batch(() => {
            for (let i = 0; i < 100; i++) {
              const id = uuid();
              data$.Todo.all[id].set({
                id,
                title: `Todo ${Math.floor(Math.random() * 1000)}`,
                completed: false,
              });
            }
          });
        }}
      />
    </ScrollView>
  );
});

const Footer = observer(() => {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        padding: 10,
        backgroundColor: 'lightgray',
      }}
    >
      <Text>Authed: {isAuthed$.get() ? 'Yes' : 'No'}</Text>
      <Text>
        Synced:{' '}
        {DateTime.fromMillis(
          data$.Todo.state.lastSync.get() || 0
        ).toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS)}
      </Text>
      <Text>
        Todos:{' '}
        {data$.Todo.count.get({ shallow: true }) ||
          (!data$.Todo.state.isPersistLoaded.get() ? 'Loading...' : 0)}
      </Text>
    </View>
  );
});
