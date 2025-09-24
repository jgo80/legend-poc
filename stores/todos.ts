import { Schema } from '@/amplify/data/resource';
import { localFirst } from '@/methods';
import { observable, syncState, when } from '@legendapp/state';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../amplify_outputs.json';
import { globalStore$ } from './global';

// Setup Amplify GraphQL
Amplify.configure(outputs);
const client = generateClient<Schema>();

export const todos$ = observable(
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
    subscribe: ({ refresh }) => {
      const createSub = client.models.Todo.onCreate().subscribe({
        next: () => {
          refresh();
        },
      });

      const updateSub = client.models.Todo.onUpdate().subscribe({
        next: () => {
          refresh();
        },
      });

      const deleteSub = client.models.Todo.onDelete().subscribe({
        next: () => {
          refresh();
        },
      });

      return () => {
        createSub.unsubscribe();
        updateSub.unsubscribe();
        deleteSub.unsubscribe();
      };
    },
    onSaved: ({ saved }) => {
      const { createdAt, updatedAt } = saved;
      return {
        createdAt,
        updatedAt,
      };
    },
    onError: (error, params) => {
      console.error('Sync error', error, params);
    },
  })
);

const status = syncState(todos$);
when(() => status.isPersistLoaded).then(() => {
  globalStore$.localDBReady.set(true);
});
