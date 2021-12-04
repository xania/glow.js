import { Template } from './template';
import {
  ListMutation,
  ListMutationManager,
  ListMutationType,
} from '../../components';
import { flatTree } from '../../lib/tpl';

import { compile } from './compile';

export function createList<T>() {
  const mutations = new ListMutationManager<T>();
  return {
    map(itemTemplate: Template) {
      const compiled = compile(itemTemplate);
      return {
        render({ target }: { target: Element }) {
          const subscr = mutations.subscribe(
            createMutationsObserver<T>(target, compiled)
          );
          return {
            dispose() {
              subscr.unsubscribe();
            },
          };
        },
      };
    },
    add(mut: ListMutation<T>) {
      mutations.pushMutation(mut);
    },
  };
}

function createMutationsObserver<T>(
  target: Element,
  template: { render: Function }
) {
  const disposables: any[] = [];
  return {
    next(mut: ListMutation<T>) {
      const { type } = mut;
      switch (type) {
        case ListMutationType.PUSH:
          disposables.push(template.render(target, mut.values));
          break;
        case ListMutationType.CLEAR:
          flatTree(disposables, (d) => d.dispose());
          disposables.length = 0;
          break;
      }
    },
  };
}
