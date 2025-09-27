import { data$, isAuthed$, SchemaModelType } from '@/methods/Amplify';
import { batch, observable, Observable } from '@legendapp/state';
import { observer, use$, useObservable } from '@legendapp/state/react';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { fetchAuthSession, signIn, signOut } from 'aws-amplify/auth';
import { DateTime } from 'luxon';
import { useEffect } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import { uuid } from 'short-uuid';

// state remains in memory for the lifetime of the app
const filteredTodos$ = observable(() =>
  data$.Todo.list.filter((todo) => todo.title.get().includes('123'))
);

// Render Page
const Page = observer(() => {
  // state is specific to the lifetime of the component
  const filteredTodos$ = useObservable(() =>
    data$.Todo.list.filter((todo) => todo.title.get().includes('123'))
  );

  // propably use this as replacement for useState w/o depenency array
  const toggle = useObservable(false);

  // Track change explicitly
  const isToggles = use$(toggle);

  return (
    <View
      style={{
        flex: 1,
        gap: 10,
      }}
    >
      <Worker />
      <Text
        style={{ padding: 10, fontWeight: 'bold', color: 'blue' }}
        onPress={() => {
          toggle.set((prev) => !prev);
        }}
      >
        Menu
      </Text>
      {isToggles && <Menu />}
      <FlashList
        data={filteredTodos$}
        extraData={data$.Todo.changed.get()}
        renderItem={renderItem}
      />
      <Footer />
    </View>
  );
});

export default Page;

const renderItem: ListRenderItem<Observable<SchemaModelType<'Todo'>>> = ({
  item: todo$,
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      height: 40,
      gap: 10,
      padding: 10,
    }}
  >
    <Text>{todo$.title.get()}</Text>
    <Text>
      {DateTime.fromISO(todo$.createdAt.get()!).toLocaleString(
        DateTime.DATETIME_SHORT_WITH_SECONDS
      )}
    </Text>
    <Text
      onPress={() => {
        todo$.completed.set((prev) => !prev);
      }}
    >
      {todo$.completed.get() ? '✅' : '⬜️'}
    </Text>
  </View>
);

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
          }).then(() => {
            isAuthed$.set(true);
          });
        }}
      />
      <Button
        title={'Sign Out'}
        onPress={() => {
          signOut().then(() => {
            isAuthed$.set(false);
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
