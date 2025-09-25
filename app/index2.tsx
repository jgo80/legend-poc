import { type Schema } from '@/amplify/data/resource';
import { observable } from '@legendapp/state';
import { observablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import { For, observer, useObservable } from '@legendapp/state/react';
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
const tableNames: (keyof Schema)[] = ['Todo'];

// Global Stores
const isAuthed$ = observable(false);

// Sync & Persist
const localFirst = configureSynced(syncedCrud, {
  persist: {
    plugin: observablePersistIndexedDB({
      databaseName: 'keys-poc',
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

const generateStableKey = <T extends Record<string, any>>(obj: T) => {
  return JSON.stringify(
    Object.keys(obj)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = obj[key];
          return acc;
        },
        {} as Record<string, any>
      )
  );
};

// Extrahiert alle Model-Types aus dem Client zur Compile-Zeit
type ExtractModels<T> = T extends { models: infer M } ? M : never;
type ClientModels = ExtractModels<typeof client>;

// Generischer Helper um Filter-Type für beliebiges Model zu inferieren
type InferFilterType<
  Models extends Record<string, any>,
  ModelName extends keyof Models,
> = Models[ModelName] extends { list: (args?: { filter?: infer F }) => any }
  ? F
  : never;

type Filter<T extends keyof Schema> = InferFilterType<ClientModels, T>;

// Generische Props - TypeScript inferiert automatisch alle Filter-Types!
interface AmplifyCrudProps<T extends keyof Schema> {
  client: typeof client;
  name: T;
  filter?: Filter<T>;
}

const amplifySyncedCrud = <T extends keyof Schema>({
  client,
  name,
  filter,
}: AmplifyCrudProps<T>) => {
  const stableKey = generateStableKey(filter || {});

  // Type-sichere Model-Extraktion mit Generics
  const model = client.models[name] as ClientModels[T];

  return localFirst({
    persist: {
      name: name as string,
      indexedDB: { itemID: stableKey },
    },
    list: async () => {
      // @ts-ignore
      const { data } = await model.list({ filter });
      return data as Schema[T]['type'][];
    },
    create: async (item) => {
      // @ts-ignore
      const { data } = await model.create(item);
      return data;
    },
    update: async (item) => {
      // @ts-ignore
      const { data } = await model.update(item as any);
      return data;
    },
    delete: async (item) => {
      // @ts-ignore
      const { data } = await model.delete(item);
      return data;
    },
    subscribe: ({ refresh }) => {
      const onAny = () => refresh();
      // @ts-ignore
      const c = model.onCreate().subscribe({ next: onAny });
      // @ts-ignore
      const u = model.onUpdate().subscribe({ next: onAny });
      // @ts-ignore
      const d = model.onDelete().subscribe({ next: onAny });
      return () => {
        c.unsubscribe();
        u.unsubscribe();
        d.unsubscribe();
      };
    },
    onSaved: ({ saved }) => {
      const { createdAt, updatedAt } = saved;
      return { createdAt, updatedAt } as Partial<Schema[T]['type']>;
    },
    onError: (error, params) => {
      console.error(`[${name}] sync error`, error, params);
    },
  });
};

const Page = observer(() => {
  const filter$ = useObservable<Filter<'Todo'>>({ completed: { eq: true } });
  const filtetedTodos$ = useObservable(
    amplifySyncedCrud({
      client,
      name: 'Todo',
      // filter: filter$.get(),
    })
  );

  useEffect(() => {
    fetchAuthSession().then((session) => {
      if (session.userSub) {
        isAuthed$.set(true);
      }
    });
  }, []);

  return (
    <View>
      <Button
        title={'Sign In'}
        onPress={() => {
          signIn({ username: 'mail@joey.aero', password: '$Password123' });
        }}
      />
      <Button
        title={'Add Todo'}
        onPress={() => {
          const id = uuid();
          filtetedTodos$[id].set({ id, title: 'Todo', completed: false });
        }}
      />
      <Button
        title={
          filter$.completed.eq.get()
            ? 'Showing Completed'
            : 'Showing Uncompleted'
        }
        onPress={() => {
          filter$.completed.eq.set((prev) => !prev);
        }}
      />
      <For
        each={filtetedTodos$}
        sortValues={(a, b) =>
          +DateTime.fromISO(a.createdAt!) - +DateTime.fromISO(b.createdAt!)
        }
      >
        {(todo$) => (
          <Text>
            <Text style={{ fontWeight: 'bold' }}>{todo$.title.get()}</Text>{' '}
            {DateTime.fromISO(todo$.createdAt.get()!).toLocaleString(
              DateTime.DATETIME_MED
            )}{' '}
            -{' '}
            <Text
              style={{ color: 'blue' }}
              onPress={() => todo$.completed.set((prev) => !prev)}
            >
              {todo$.completed.get() ? '✅' : '⬜️'}
            </Text>
            -{' '}
            <Text style={{ color: 'blue' }} onPress={() => todo$.delete()}>
              🗑️
            </Text>
          </Text>
        )}
      </For>
    </View>
  );
});

export default Page;
