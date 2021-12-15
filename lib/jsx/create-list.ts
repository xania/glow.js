import { Template, TemplateType, RenderContext } from './template';
import {
  ListMutation,
  ListMutationManager,
  ListMutationType,
} from '../../components';
import { flatTree } from '../../lib/tpl';

import { compile } from './compile';

export class RowContext<T> {
  property(name: string) {
    return {
      type: TemplateType.Property,
      name,
    };
  }
  get<U>(getter: (row: T) => U) {
    return function (context: { values: T }) {
      if (context) return getter(context.values);
      return null;
    };
  }
  remove(context: { remove: Function }) {
    if (context?.remove) context.remove();
  }
  call(func: (row: T) => void) {
    return function (context: { values: T }) {
      func(context.values);
    };
  }
}
export function createList<T>() {
  const mutations = new ListMutationManager<T>();
  return {
    map(mapper: (context: RowContext<T>) => Template) {
      const context = new RowContext<T>();
      const itemTemplate = mapper(context);
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
  template: {
    render: (driver: { target: any }, context: RenderContext) => unknown;
  }
) {
  const disposables: any[] = [];
  return {
    next(mut: ListMutation<T>) {
      switch (mut.type) {
        case ListMutationType.PUSH:
          disposables.push(renderPush(target, mut.values));
          break;
        case ListMutationType.PUSH_MANY:
          disposables.push(
            renderPushMany(target, mut.items, mut.start, mut.count)
          );
          break;
        case ListMutationType.CLEAR:
          flatTree(disposables, (d) => d.dispose());
          disposables.length = 0;
          break;
      }

      function renderPush(target: Element, values: T) {
        const rr = template.render({ target }, { values, remove });
        return rr;
        function remove() {
          flatTree(rr, (r) => r.dispose());
        }
      }
      function renderPushMany(
        target: Element,
        items: ArrayLike<T>,
        start: number,
        count: number
      ) {
        const end = start + count;
        let disposablesLength = disposables.length;
        const driver = { target };
        for (let i = start; i < end; i++) {
          const values = items[i];
          const rr = template.render(driver, { values, remove });
          disposables[disposablesLength++] = rr;
          function remove() {
            flatTree(rr, (r) => r.dispose());
          }
        }
      }
    },
  };
}
