import { Store } from '@xania/mutabl.js';

export interface ListItem<T> {
  store: Store<T>;
  dispose(): void;
}
