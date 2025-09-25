import { type Schema } from '@/amplify/data/resource';
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
import { Button, Text, View } from 'react-native';
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
    plugin: observablePersistIndexedDB({
      databaseName: 'poc',
      version: 1,
      tableNames,
    }),
    retrySync: true,
  },
  retry: {
    infinite: true,
  },
  waitFor: isAuthed$,
});

// Amplify Plugin
interface AmplifyCrudProps<T extends keyof Schema> {
  name: T;
}

const amplifyCrud = <T extends keyof Schema>({ name }: AmplifyCrudProps<T>) => {
  return syncPlugin({
    list: async (params): Promise<Schema[T]['type'][]> => {
      const filter = params.lastSync
        ? {
            updatedAt: {
              gt: DateTime.fromMillis(params.lastSync).toUTC().toISO(),
            },
          }
        : undefined;

      // @ts-ignore
      const { data } = await client.models[name].list({
        filter,
      }); // Replace with secondary index
      return data;
    },
    create: async (input): Promise<Schema[T]['type']> => {
      // @ts-ignore
      const { data } = await client.models[name].create(input); // Replace with createMutation
      return data;
    },
    update: async (input): Promise<Schema[T]['type']> => {
      // @ts-ignore
      const { data } = await client.models[name].update(input); // Replace with updateMutation
      return data;
    },
    delete: async (input) => {
      // @ts-ignore
      await client.models[name].update({ ...input, deleted: true }); // Replace with deleteMutation
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
    changesSince: 'last-sync',
    mode: 'assign',
    updatePartial: true,
    fieldCreatedAt: 'createdAt',
    fieldUpdatedAt: 'updatedAt',
    fieldDeleted: 'deleted',
  });
};

const count = (obj: object) => (obj ? Object.keys(obj).length : 0);

// Data Stores
const data$ = observable({
  clients: {
    all: amplifyCrud({ name: 'Client' }),
    count: () =>
      data$.clients.state.isLoaded.get() ? count(data$.clients.all.get()) : 0,
    state: () => syncState(data$.clients.all),
  },
  todos: {
    all: amplifyCrud({ name: 'Todo' }),
    count: () =>
      data$.todos.state.isLoaded.get() ? count(data$.todos.all.get()) : 0,
    state: () => syncState(data$.todos.all),
  },
});

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
        <Button
          title={'Sync (incremental)'}
          onPress={() => {
            data$.todos.state.sync();
          }}
        />
        <Button
          title={'Sync (full)'}
          onPress={() => {
            data$.todos.state.sync({ resetLastSync: true });
          }}
        />
        <Button
          title={'Add Todo'}
          onPress={() => {
            const id = uuid();
            data$.todos.all[id].set({ id, title: 'Todo', completed: false });
          }}
        />
        <Button
          title={'Undo Last Delete'}
          onPress={() => {
            data$.todos.all[lastDeleted$.get()!].deleted.set(false);
            lastDeleted$.set(null);
          }}
          disabled={!lastDeleted$.get()}
        />
        <For
          each={data$.todos.all}
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
            data$.todos.state.lastSync.get() || 0
          ).toLocaleString(DateTime.DATETIME_FULL_WITH_SECONDS)}
        </Text>
        <Text>Clients: {data$.clients.count.get()}</Text>
        <Text>Todos: {data$.todos.count.get()}</Text>
      </View>
    </View>
  );
});

export default Page;
