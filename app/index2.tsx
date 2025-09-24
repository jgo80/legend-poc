import { observable } from '@legendapp/state';
import { For, observer, use$ } from '@legendapp/state/react';
import { Button, Text, View } from 'react-native';

interface Store {
  dates: string[];
  firstDate?: string;
  lastDate?: string;
  count: number;
  addDate: (date: string) => void;
}

const store$ = observable<Store>({
  dates: [],
  firstDate: (): string => {
    return store$.dates.get()[0];
  },
  lastDate: (): string => {
    const dates = store$.dates.get();
    return dates[dates.length - 1];
  },
  count: (): number => {
    return store$.dates.length;
  },
  addDate: () => {
    store$.dates.push(new Date().toISOString());
  },
});

const Page = observer(() => {
  const count = use$(store$.count);
  const firstDate = use$(store$.firstDate);
  const lastDate = use$(store$.lastDate);

  return (
    <View>
      <Text>Count: {count}</Text>
      <Button
        title="Add Date"
        onPress={() => {
          store$.addDate(new Date().toISOString());
        }}
      />
      <Text>First Date: {firstDate}</Text>
      <Text>Last Date: {lastDate}</Text>
      <For each={store$.dates}>{(date$) => <Text>{date$.get()}</Text>}</For>
    </View>
  );
});

export default Page;
