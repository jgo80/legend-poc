import { type Schema } from '@/amplify/data/resource';
import { ObservablePersistMMKV } from '@/plugins/mmkv';
import { batch, observable, syncState } from '@legendapp/state';
import { observablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import { observer } from '@legendapp/state/react';
import { configureSynced } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { FlashList } from '@shopify/flash-list';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { DateTime } from 'luxon';
import { useEffect, useRef } from 'react';
import { Button, Platform, ScrollView, Text, View } from 'react-native';
import { uuid } from 'short-uuid';
import outputs from '../amplify_outputs.json';

// Amplify
Amplify.configure(outputs);
const client = generateClient<Schema>();
const tableNames = Object.keys(client.models) as (keyof Schema)[];

// Global Stores
const isAuthed$ = observable(false);
const lastDeleted$ = observable<string | null>(null);

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

const accountId = 'poc';
const future = DateTime.fromObject({ year: 2099 });

const amplifyCrud = <T extends keyof Schema>({
  name,
  limit,
}: AmplifyCrudProps<T>) => {
  return syncPlugin({
    list: async ({ lastSync, refresh }): Promise<Schema[T]['type'][]> => {
      console.log({ lastSync });
      try {
        // @ts-ignore
        const { data, errors, nextToken } = await client.models[name][
          `list${name}ByAccountIdAndUpdatedAt`
        ](
          {
            accountId,
            updatedAt: {
              between: [
                DateTime.fromMillis(lastSync || 0).toISO(),
                future.toISO(),
              ],
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
          data$[name].nextToken.set(undefined);
        }

        return data;
      } catch (error) {
        console.error('Error fetching list', error);
        throw error;
      }
    },
    create: async (input): Promise<Schema[T]['type']> => {
      try {
        data$.Todo.touched.set(+DateTime.now());
        input.accountId = accountId;
        // @ts-ignore
        const { data, errors } = await client.models[name].create(input); // Replace with createMutation
        if (errors) {
          throw errors;
        }
        return data;
      } catch (error) {
        console.error('Error creating item', error);
        throw error;
      }
    },
    update: async (input): Promise<Schema[T]['type']> => {
      try {
        data$.Todo.touched.set(+DateTime.now());
        input.accountId = accountId;
        // @ts-ignore
        const { data, errors } = await client.models[name].update(input); // Replace with updateMutation
        if (errors) {
          throw errors;
        }
        return data;
      } catch (error) {
        console.error('Error updating item', error);
        throw error;
      }
    },
    delete: async (input) => {
      try {
        data$.Todo.touched.set(+DateTime.now());
        input.accountId = accountId;
        input.deleted = true; // Remove, replace with deleteMutation
        // @ts-ignore
        const { data, errors } = await client.models[name].update(input); // Replace with deleteMutation
        if (errors) {
          throw errors;
        }
        return data;
      } catch (error) {
        console.error('Error deleting item', error);
        throw error;
      }
    },
    subscribe: ({ refresh }) => {
      const onAny = () => refresh();
      // @ts-ignore
      const c = client.models[name].onCreate().subscribe({ next: onAny });
      // @ts-ignore
      const u = client.models[name].onUpdate().subscribe({ next: onAny });
      // @ts-ignore
      const d = client.models[name].onDelete().subscribe({ next: onAny });
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

export const count = (obj: object) => (obj ? Object.keys(obj).length : 0);

// Data Stores
export const data$ = observable({
  Client: {
    nextToken: undefined as string | undefined,
    all: amplifyCrud({ name: 'Client' }),
    count: () =>
      data$.Client.state.isLoaded.get() ? count(data$.Client.all.get()) : 0,
    state: () => syncState(data$.Client.all),
  },
  Todo: {
    nextToken: undefined as string | undefined,
    all: amplifyCrud({
      name: 'Todo',
      limit: 100,
    }),
    touched: 0,
    list: () =>
      Object.values(data$.Todo.all).sort(
        (a, b) => +new Date(a.createdAt.get()!) - +new Date(b.createdAt.get()!)
      ),
    count: () =>
      data$.Todo.state.isLoaded.get() ? count(data$.Todo.all.get()) : 0,
    state: () => syncState(data$.Todo.all),
  },
});

const Page = observer(() => {
  const flashListRef = useRef<any>(null);

  useEffect(() => {
    fetchAuthSession().then((session) => {
      if (session.userSub) {
        isAuthed$.set(true);
      }
    });
  }, []);

  return (
    <View
      style={Platform.select({ web: { height: '100vh' }, native: { flex: 1 } })}
    >
      <View style={{ flex: 1 }}>
        <ScrollView horizontal style={{ flexGrow: 0 }}>
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              padding: 10,
            }}
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
                data$.Todo.state.resetPersistence().then(() => {
                  console.log('Cleared');
                });
              }}
            />
            <Button
              title={'Sync (incremental)'}
              onPress={() => {
                data$.Todo.state.sync().then(() => {
                  console.log('Synced');
                });
              }}
            />
            <Button
              title={'Sync (full)'}
              onPress={() => {
                data$.Todo.state.sync({ resetLastSync: true });
              }}
            />
            <Button
              title={'Add Todo'}
              onPress={() => {
                const id = uuid();
                data$.Todo.all[id].set({ id, title: 'Todo', completed: false });
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
            <Button
              title={'STB'}
              onPress={() => {
                flashListRef.current?.scrollToEnd();
              }}
            />
          </View>
        </ScrollView>
        {1 === 1 && (
          <FlashList
            ref={flashListRef}
            style={{ flex: 1 }}
            data={data$.Todo.list}
            // extraData={data$.Todo.touched.get()}
            keyExtractor={(item) => item.id.get()}
            renderItem={({ item }) => {
              const { id, title, createdAt, completed } = item;
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
        )}
      </View>
      <View
        style={{ backgroundColor: 'lightgray', flexDirection: 'row', gap: 10 }}
      >
        <Text>isAuthed: {isAuthed$.get().toString()}</Text>
        <Text>
          Last sync:{' '}
          {DateTime.fromMillis(
            data$.Todo.state.lastSync.get() || 0
          ).toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS)}
        </Text>
        <Text>Todos: {data$.Todo.count.get()}</Text>
      </View>
    </View>
  );
});

export default Page;
