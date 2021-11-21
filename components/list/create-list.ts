import { ITemplate, IDriver, disposeMany } from '../../lib/driver';
import { flatTree, renderMany } from '../../lib/tpl';
import {
  ListMutation,
  ListMutationManager,
  ListMutationType,
} from './list-mutation';
import { NextObserver, Unsubscribable } from '../../lib/util/rxjs';
import { asProxy, digestMany, flush, State, Store } from 'mutabl.js';
import { ListItem } from './list-item';
import { bindMutationsTo } from './bindMutationsTo';
import { ListSource } from './list-source';

type ItemTemplateFn<T> = (
  values: State<T>,
  context: { index: () => number; dispose(): void }
) => ITemplate[];

export function createList<T>(source: ListSource<T>) {
  const mutations = new ListMutationManager<T>();
  const sourceMutationObserver = bindMutationsTo(source);
  const listItems: ListItem<T>[] = [];
  return {
    get length() {
      return listItems.length | 0;
    },
    find(predicate: (values: T) => boolean) {
      let { length } = listItems;
      while (length--) {
        const { store } = listItems[length];
        const { value } = store;
        if (predicate(value)) {
          return store;
        }
      }
      return null;
    },
    item(index: number) {
      return listItems[index].store;
    },
    add(mut) {
      sourceMutationObserver.next(mut);
      mutations.pushMutation(mut);
    },
    subscribe(observer: NextObserver<ListMutation<T>>): Unsubscribable {
      if (typeof observer.next === 'function') observer.next(resetMutation());
      return mutations.subscribe(observer);
    },
    map(itemTemplateFn: ItemTemplateFn<T>) {
      const list = this;
      return {
        render(driver: IDriver) {
          const rootScope = driver.createScope();
          const subscr = list.subscribe(
            createMutationsObserver(rootScope, itemTemplateFn)
          );
          return [subscr, rootScope];
        },
      };
    },
    refresh() {
      const dirty = digestMany(listItems.map((li) => li.store));
      flush(dirty);
    },
  };

  function flushChanges() {
    const dirty = [];
    let parent: any = source;
    while (parent) {
      dirty.push(parent);
      parent = parent.parent;
    }
    if (dirty.length > 0) flush([...dirty, source]);
  }

  function resetMutation(): ListMutation<T> {
    const { value } = source;
    return {
      type: ListMutationType.RESET,
      items: Array.isArray(value) ? value : [],
    };
  }

  function createMutationsObserver(
    driver: IDriver,
    itemTemplateFn: ItemTemplateFn<T>
  ): NextObserver<ListMutation<T>> {
    return {
      next(m) {
        if (m.type === ListMutationType.PUSH) {
          const { values } = m;
          renderInsert(values, listItems.length);
        } else if (m.type === ListMutationType.REMOVE) {
          if ('index' in m) {
            renderRemoveAt(m.index);
          }
        } else if (m.type === ListMutationType.RESET) {
          const { items } = m;
          const newLength = items.length;
          const listLength = listItems.length;

          if (listLength > newLength) {
            for (let i = newLength; i < listLength; i++) {
              listItems[i].dispose();
            }
          } else {
            for (let i = listLength; i < newLength; i++) {
              renderInsert(items[i], i);
            }
          }

          for (let i = 0; i < listLength && i < newLength; i++) {
            listItems[i].store.update(items[i]);
          }
        } else {
          throw new Error('Not Yet Supported');
        }

        flushChanges();
      },
    };

    function renderRemoveAt(index: number) {
      const listItem = listItems[index];
      if (!listItem) {
        return;
      }

      listItem.dispose();
    }

    function renderInsert(values: T, idx: number) {
      const itemScope = driver.createScope(idx);
      const itemStore = new Store<T>(values);
      const proxy = asProxy(itemStore);
      const config = { index, dispose };
      const itemTemplates = flatTree(itemTemplateFn, (tpl) =>
        tpl(proxy, config)
      );

      const itemStoreSubscr = itemStore.subscribe({
        next() {
          flushChanges();
        },
      });

      const bindings = renderMany(itemScope, itemTemplates);
      listItems.splice(idx, 0, {
        store: itemStore,
        dispose,
      });

      function dispose() {
        itemStoreSubscr.unsubscribe();
        disposeMany(bindings);
        listItems.splice(index(), 1);
        itemScope.dispose();
      }

      function index() {
        let { length } = listItems;
        while (length--) {
          if (listItems[length].store === itemStore) return length;
        }
        return -1;
      }
    }
  }
}

export interface ContainerItemContext {
  dispose(): any;
  index: () => number;
}
