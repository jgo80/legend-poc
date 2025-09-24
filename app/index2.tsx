import { Schema } from '@/amplify/data/resource';
import { observable } from '@legendapp/state';
import { observablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import { For, observer, useObserve } from '@legendapp/state/react';
import { configureSynced } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { useEffect } from 'react';
import { Button, Text, View } from 'react-native';
import { uuid } from 'short-uuid';
import outputs from '../amplify_outputs.json';

const store$ = observable({
  ready: false,
});

// Setup Amplify GraphQL
Amplify.configure(outputs);
const client = generateClient<Schema>();

// Setup global sync and persist configuration
const localFirst = configureSynced(syncedCrud, {
  persist: {
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
  waitFor: store$.ready,
});

const todos$ = observable(
  localFirst({
    persist: {
      name: 'todos',
    },
    list: async () => {
      const { data } = await client.models.Todo.list();
      return data;
    },
    create: async (item) => {
      const { data } = await client.models.Todo.create(item);
      return data;
    },
    update: async (item) => {
      const { data } = await client.models.Todo.update(item as any);
      return data;
    },
    delete: async (item) => {
      const { data } = await client.models.Todo.delete(item);
      return data;
    },
    subscribe: ({ refresh, update }) => {
      const createSub = client.models.Todo.onCreate().subscribe({
        next: (data) => {
          console.log(data);
          refresh();
        },
      });

      const updateSub = client.models.Todo.onUpdate().subscribe({
        next: (data) => {
          console.log(data);
          refresh();
        },
      });

      const deleteSub = client.models.Todo.onDelete().subscribe({
        next: (data) => {
          console.log(data);
          refresh();
        },
      });

      return () => {
        createSub.unsubscribe();
        updateSub.unsubscribe();
        deleteSub.unsubscribe();
      };
    },
    onSaved: (params) => {
      console.log('onSaved', params);
    },
    onError: (error, params) => {
      console.error('Sync error', error, params);
    },
  })
);

const Page = observer(() => {
  const addTodo = () => {
    const id = uuid();
    todos$[id].set({ title: 'New Todo', completed: false });
  };

  const deleteTodo = (id: string) => {
    todos$[id].delete();
  };

  useObserve(() => {
    console.log(todos$.get());
  });

  useEffect(() => {
    // signUp({ username: 'mail@joey.aero', password: '$Password123' });
    // confirmSignUp({ username: 'mail@joey.aero', confirmationCode: '855805' });
    fetchAuthSession().then((session) => {
      if (session.userSub) {
        store$.ready.set(true);
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
      <Button title={'Add Todo'} onPress={addTodo} />
      <For each={todos$}>
        {(todo$) => (
          <Text>
            {todo$.title.get()} -{' '}
            {typeof todo$.createdAt.get() === 'string'
              ? todo$.createdAt.get()
              : 'creating...'}
            <Text
              style={{ color: 'blue' }}
              onPress={() => deleteTodo(todo$.id.get())}
            >
              Delete
            </Text>
          </Text>
        )}
      </For>
    </View>
  );
});

export default Page;
