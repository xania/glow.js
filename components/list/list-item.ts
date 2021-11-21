import { Store } from 'mutabl.js';

export interface ListItem<T> {
  store: Store<T>;
  dispose(): void;
}
