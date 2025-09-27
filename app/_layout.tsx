import '@/methods/Amplify';
import { data$ } from '@/methods/Amplify';
import { observer, use$ } from '@legendapp/state/react';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

const RootLayout = observer(() => {
  const [firstRender, setFrstRender] = useState(true);

  const ready = use$(() => data$.Todo.state.isPersistLoaded.get());

  useEffect(() => {
    if (ready) {
      setFrstRender(false);
    }
  }, [ready]);

  return (
    ready && !firstRender && <Stack screenOptions={{ title: 'Legend POC' }} />
  );
});

export default RootLayout;
