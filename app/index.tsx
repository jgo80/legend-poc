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

const amplifyCrud = <T extends keyof Schema>({
  name,
  limit,
}: AmplifyCrudProps<T>) => {
  return syncPlugin({
    list: async ({ lastSync, refresh }): Promise<Schema[T]['type'][]> => {
      try {
        if (data$[name].currentSync.peek() === undefined) {
          data$[name].currentSync.set(lastSync || 0);
        }

        // @ts-ignore
        const { data, errors, nextToken } = await client.models[name][
          `list${name}ByAccountIdAndUpdatedAt`
        ](
          {
            accountId,
            updatedAt: {
              ge: DateTime.fromMillis(data$[name].currentSync.peek() || 0)
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

        return data;
      } catch (error) {
        console.error('Error fetching list', error);
        throw error;
      }
    },
    create: async (input): Promise<Schema[T]['type']> => {
      try {
        data$[name].touched.set(+DateTime.now());
        input.accountId = accountId; // Replace with createMutation

        // @ts-ignore
        const { data, errors } = await client.models[name].create(input);
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
        data$[name].touched.set(+DateTime.now());
        input.accountId = accountId; // Replace with updateMutation

        // @ts-ignore
        const { data, errors } = await client.models[name].update(input);
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
        data$[name].touched.set(+DateTime.now());
        input.accountId = accountId; // Replace with deleteMutation
        input.deleted = true; // Soft delete

        // @ts-ignore
        const { data, errors } = await client.models[name].update(input);
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

interface ModelState<T extends keyof Schema> {
  touched?: number;
  currentSync?: number;
  nextToken?: string | null;
  all: Record<string, Schema[T]['type']>;
  count: number;
  state: Observable<ObservableSyncState>;
}

const countKeys = (all: Record<string, any>): number =>
  Object.keys(all || {}).length;

const data$ = observable<Record<keyof Schema, ModelState<keyof Schema>>>({
  Client: {
    all: amplifyCrud({
      name: 'Client',
      limit: 100,
    }),
    count: (): number => countKeys(data$.Client.all),
    state: () => syncState(data$.Client.all),
  },
  Todo: {
    all: amplifyCrud({
      name: 'Todo',
      limit: 1000,
    }),
    count: (): number => countKeys(data$.Todo.all),
    state: () => syncState(data$.Todo.all),
  },
});

// Render Page
const Page = observer(() => {
  return (
    <View style={{ flex: 1, gap: 10 }}>
      <Worker />
      <Menu />
      <Text>
        {data$.Todo.count.get({ shallow: true }) ||
          (!data$.Todo.state.isPersistLoaded.get() ? 'Loading...' : 0)}
      </Text>
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
