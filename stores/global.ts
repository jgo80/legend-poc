import { observable } from '@legendapp/state';

export const globalStore$ = observable({
  signedIn: false,
  localDBReady: false,
});
