import { Template } from './template';
import {
  ListMutation,
  ListMutationManager,
  ListMutationType,
} from '../../components';
import { flatTree } from '../../lib/tpl';
import { render } from './render';
import { compile } from './compile';

export function createList<T>() {
  const mutations = new ListMutationManager<T>();
  return {
    map(itemTemplate: Template) {
      return {
        render({ target }: { target: Element }) {
          const result = compile(target.namespaceURI, itemTemplate);
          result.render(target);

          // const subscr = mutations.subscribe(
          //   createMutationsObserver<T>(target, itemTemplate)
          // );
          // return {
          //   dispose() {
          //     subscr.unsubscribe();
          //   },
          // };
        },
      };
    },
    add(mut: ListMutation<T>) {
      mutations.pushMutation(mut);
    },
  };
}

function createMutationsObserver<T>(target: Element, template: Template) {
  const disposables: any[] = [];
  return {
    next(mut: ListMutation<T>) {
      const { type } = mut;
      switch (type) {
        case ListMutationType.PUSH:
          disposables.push(render(target, template, mut.values));
          break;
        case ListMutationType.CLEAR:
          flatTree(disposables, (d) => d.dispose());
          disposables.length = 0;
          break;
      }
    },
  };
}
