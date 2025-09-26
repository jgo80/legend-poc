import { observer, use$ } from '@legendapp/state/react';
import { ScrollView, Text, View } from 'react-native';
import { data$ } from './index';

const Page = observer(() => {
  const count = use$(data$.Todo.count.get());

  return (
    <View style={{ height: '100vh', backgroundColor: 'yellow' }}>
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }}>
          {Array.from({ length: 500 }).map((_, i) => (
            <Text key={i}>Item {i + 1}</Text>
          ))}
        </ScrollView>
      </View>
      <View style={{ backgroundColor: 'lightgray' }}>
        <Text>Footer</Text>
      </View>
    </View>
  );
});

export default Page;
