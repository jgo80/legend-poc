import { type Schema } from '@/amplify/data/resource';
import { ObservablePersistMMKV } from '@/plugins/mmkv';
import { observable, syncState } from '@legendapp/state';
import { observablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import { For, observer } from '@legendapp/state/react';
import { configureSynced } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { DateTime } from 'luxon';
import { useEffect } from 'react';
import { Button, Platform, Text, View } from 'react-native';
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
  changesSince: 'last-sync',
  mode: 'assign',
  waitFor: isAuthed$,
});

// Amplify Plugin
interface AmplifyCrudProps<T extends keyof Schema> {
  name: T;
  limit?: number;
}

const amplifyCrud = <T extends keyof Schema>({
  name,
  limit,
}: AmplifyCrudProps<T>) => {
  return syncPlugin({
    list: async ({ lastSync, refresh }): Promise<Schema[T]['type'][]> => {
      try {
        // @ts-ignore
        const { data, errors, nextToken } = await client.models[name].list({
          filter: lastSync
            ? {
                updatedAt: {
                  gt: DateTime.fromMillis(lastSync).toUTC().toISO(),
                },
              }
            : undefined,
          limit,
          nextToken: data$[name].nextToken.peek(),
        }); // Todo: Replace with secondary index
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

const count = (obj: object) => (obj ? Object.keys(obj).length : 0);

// Data Stores
const data$ = observable({
  Client: {
    nextToken: undefined,
    all: amplifyCrud({ name: 'Client' }),
    count: () =>
      data$.Client.state.isLoaded.get() ? count(data$.Client.all.get()) : 0,
    state: () => syncState(data$.Client.all),
  },
  Todo: {
    nextToken: undefined,
    all: amplifyCrud({
      name: 'Todo',
      //   batchSize: 5,
    }),
    count: () =>
      data$.Todo.state.isLoaded.get() ? count(data$.Todo.all.get()) : 0,
    state: () => syncState(data$.Todo.all),
  },
});

const resetStores = () => {
  data$.Todo.state.resetPersistence().then(() => {
    console.log('Cleared persisted data');
  });
  //   data$.todos.state.lastSync.set(0);
  //   console.log('Reset lastSync');
  data$.Todo.nextToken.set(undefined);
  console.log('Reset nextToken');
};

const Page = observer(() => {
  useEffect(() => {
    fetchAuthSession().then((session) => {
      if (session.userSub) {
        isAuthed$.set(true);
      }
    });
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <View>
        <Button
          title={'Sign In'}
          onPress={() => {
            signIn({ username: 'mail@joey.aero', password: '$Password123' });
          }}
        />
        <Button title={'Clear'} onPress={resetStores} />
        <Button
          title={'Sync (incremental)'}
          onPress={() => {
            data$.Todo.state.sync();
          }}
        />
        <Button
          title={'Sync (full)'}
          onPress={() => {
            // data$.todos.state.lastSync.set(0);
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
          title={'Undo Last Delete'}
          onPress={() => {
            data$.Todo.all[lastDeleted$.get()!].deleted.set(false);
            lastDeleted$.set(null);
          }}
          disabled={!lastDeleted$.get()}
        />
        <For
          each={data$.Todo.all}
          sortValues={(a, b) =>
            +new Date(a.createdAt!) - +new Date(b.createdAt!)
          }
        >
          {(todo$) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                gap: 10,
                borderBottomColor: 'lightgray',
                borderBottomWidth: 1,
              }}
            >
              <Text>{todo$.title.get()}</Text>
              <Text>
                {DateTime.fromISO(todo$.createdAt.get()!).toLocaleString(
                  DateTime.DATETIME_FULL
                )}
              </Text>
              <Text
                onPress={() => {
                  todo$.completed.set((prev) => !prev);
                }}
              >
                {todo$.completed.get() ? '✅' : '⬜️'}
              </Text>
              <Text
                onPress={() => {
                  lastDeleted$.set(todo$.id.get()!);
                  todo$.deleted.set(true);
                }}
              >
                🗑️
              </Text>
            </View>
          )}
        </For>
      </View>
      <View
        style={{ backgroundColor: 'lightgray', flexDirection: 'row', gap: 10 }}
      >
        <Text>isAuthed: {isAuthed$.get().toString()}</Text>
        <Text>
          Last sync:{' '}
          {DateTime.fromMillis(
            data$.Todo.state.lastSync.get() || 0
          ).toLocaleString(DateTime.DATETIME_FULL_WITH_SECONDS)}
        </Text>
        <Text>Clients: {data$.Client.count.get()}</Text>
        <Text>Todos: {data$.Todo.count.get()}</Text>
      </View>
    </View>
  );
});

export default Page;
