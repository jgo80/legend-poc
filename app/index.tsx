import { globalStore$, todos$ } from '@/stores';
import { For, observer } from '@legendapp/state/react';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { DateTime } from 'luxon';
import { useEffect, useRef } from 'react';
import { Button, Text, View } from 'react-native';
import { uuid } from 'short-uuid';

const Page = observer(() => {
  const renderCount = ++useRef(0).current;

  const addTodo = () => {
    const id = uuid();
    todos$[id].set({ id, title: 'New Todo', completed: false });
  };

  const deleteTodo = (id: string) => {
    todos$[id].delete();
  };

  useEffect(() => {
    // signUp({ username: 'mail@joey.aero', password: '$Password123' });
    // confirmSignUp({ username: 'mail@joey.aero', confirmationCode: '855805' });
    fetchAuthSession().then((session) => {
      if (session.userSub) {
        globalStore$.signedIn.set(true);
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
        <Button title={'Add Todo'} onPress={addTodo} />
        <For
          each={todos$}
          sortValues={(a, b) =>
            DateTime.fromISO(a.createdAt).toMillis() -
            DateTime.fromISO(b.createdAt).toMillis()
          }
        >
          {(todo$) => (
            <Text>
              {todo$.id.get().split('-')[1]} - {todo$.title.get()}-{' '}
              {DateTime.fromISO(todo$.createdAt.get()).toLocaleString(
                DateTime.DATETIME_MED
              )}{' '}
              -{' '}
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
      <View
        style={{ backgroundColor: 'lightgrey', flexDirection: 'row', gap: 10 }}
      >
        <Text>Renders: {renderCount}</Text>
        <Text>
          Local DB: {globalStore$.localDBReady.get() ? 'Ready' : 'Not Ready'}
        </Text>
        <Text>Signed in: {globalStore$.signedIn.get() ? 'Yes' : 'No'}</Text>
      </View>
    </View>
  );
});

export default Page;
