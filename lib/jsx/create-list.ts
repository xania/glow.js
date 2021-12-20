import { Template, TemplateType, ExpressionTemplate } from './template';
import {
  ListMutation,
  ListMutationManager,
  ListMutationType,
} from '../../components';
import { flatTree } from '../../lib/tpl';

import { compile } from './compile';
import { ExpressionType } from './expression';

export class RowContext<T> {
  property(name: keyof T & string): ExpressionTemplate {
    return {
      type: TemplateType.Expression,
      expression: {
        type: ExpressionType.Property,
        name,
      },
      async() {
        return {
          type: TemplateType.Expression,
          expression: {
            type: ExpressionType.Async,
            observable: this.expression,
          },
          async(): any {
            throw Error('Not yet implemented');
          },
        };
      },
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
  call(func: (row: T, element: Element) => void) {
    return function (context: { values: T }) {
      func(context.values, null as any);
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
    render: (
      target: Element,
      items: ArrayLike<T>,
      start: number,
      count: number
    ) => unknown;
  }
) {
  const disposables: any[] = [];
  return {
    next(mut: ListMutation<T>) {
      switch (mut.type) {
        case ListMutationType.PUSH:
          disposables.push(template.render(target, [mut.values], 0, 1));
          break;
        case ListMutationType.PUSH_MANY:
          disposables.push(
            template.render(target, mut.items, mut.start, mut.count)
          );
          break;
        case ListMutationType.CLEAR:
          flatTree(disposables, (d) => d.dispose());
          disposables.length = 0;
          break;
      }

      // function renderPush(target: Element, values: T) {
      //   const rr = template.render(target, [values], 0, 1);
      //   return rr;
      //   function remove() {
      //     flatTree(rr, (r) => r.dispose());
      //   }
      // }
    },
  };
}
