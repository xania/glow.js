import {
  Template,
  TemplateType,
  ExpressionTemplate,
  RenderResult,
} from './template';
import {
  ListMutation,
  ListMutationManager,
  ListMutationType,
} from '../../components';

import { compile, RenderOptions } from './compile';
import { ExpressionType } from './expression';

export class RowContext<T> {
  property(name: keyof T & string): ExpressionTemplate {
    return {
      type: TemplateType.Expression,
      expression: {
        type: ExpressionType.Property,
        name,
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
  call(func: (row: T, target: Element) => void) {
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

// type RenderTarget = {
//   appendChild<T extends Node>(node: T): T;
//   addEventListener(): void;
// };

function createMutationsObserver<T>(
  target: Element,
  template: {
    render: (target: RenderTarget, options: RenderOptions) => RenderResult[];
  }
) {
  const renderResults: RenderResult[] = [];
  let renderResultsLength: number = 0;

  function pushMany(items: RenderResult[]) {
    for (let i = 0, len = items.length; i < len; i++)
      renderResults[renderResultsLength++] = items[i];
  }

  const renderTarget: RenderTarget = new ElementTarget(target);
  return {
    next(mut: ListMutation<T>) {
      switch (mut.type) {
        case ListMutationType.PUSH:
          pushMany(
            template.render(renderTarget, {
              items: [mut.values],
              start: 0,
              count: 1,
            })
          );
          break;
        case ListMutationType.PUSH_MANY:
          pushMany(template.render(renderTarget, mut));
          break;
        case ListMutationType.CLEAR:
          while (renderResultsLength) {
            renderResults[--renderResultsLength].dispose();
          }
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
