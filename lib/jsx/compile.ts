import {
  AttributeType,
  TemplateType,
  Template,
  Renderable,
  RenderResult,
} from './template';
import { createDOMElement } from './render';
import { isSubscribable } from '../driver';
import { Subscribable } from '../util/rxjs';

interface RenderTarget {
  appendChild(node: Node): void;
}

type StackItem = [Node, Template | Template[]];

export function compile(rootTemplate: Template | Template[]) {
  const renderersMap = createLookup<Node, Renderable>();
  const eventsMap = createLookup<Node, CompilationEvent>();

  const fragment = new DocumentFragment();
  const stack: StackItem[] = [[fragment, rootTemplate]];
  while (stack.length > 0) {
    const curr = stack.pop() as StackItem;
    const [target, template] = curr;

    if (Array.isArray(template)) {
      for (let i = template.length; i--; ) stack.push([target, template[i]]);
      continue;
    }

    switch (template.type) {
      case TemplateType.Tag:
        const { name, attrs, children } = template;
        const dom = createDOMElement('http://www.w3.org/1999/xhtml', name);
        target.appendChild(dom);

        if (attrs) {
          for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            if (attr.type === AttributeType.Attribute) {
              setAttribute(dom, attr.name, attr.value);
            } else {
              eventsMap.add(dom, { name: attr.event, callback: attr.callback });
            }
          }
        }

        let { length } = children;
        while (length--) {
          stack.push([dom, children[length]]);
        }
        break;
      case TemplateType.Text:
        const textNode = document.createTextNode(template.value);
        target.appendChild(textNode);
        break;
      case TemplateType.Renderable:
        renderersMap.add(target, template.renderer);
        break;
      case TemplateType.Subscribable:
        const asyncNode = document.createTextNode('');
        target.appendChild(asyncNode);
        renderersMap.add(asyncNode, {
          render({ target }) {
            const subscr = template.value.subscribe({
              next(x) {
                target.textContent = x;
              },
            });
            return {
              dispose() {
                subscr.unsubscribe();
              },
            };
          },
        });
        break;
      case TemplateType.Context:
        const contextNode = document.createTextNode('');
        target.appendChild(contextNode);
        addContext(contextNode, template.func);
        break;
    }
  }

  return createResult();

  function createResult() {
    const result = new CompileResult(fragment);
    console.log(
      transform<any>(fragment.childNodes, (node) => {
        const events = eventsMap.get(node);
        const renderers = renderersMap.get(node);
        if (!events && !renderers) return undefined;
        return {
          node,
          events,
          renderers,
        };
      })
    );
    // type StackItem = { node: Node; compilationNode: CompilationNode };
    // const rootItems: StackItem[] = [];
    // fragment.childNodes.forEach((node, index) =>
    //   rootItems.push({
    //     node,
    //     compilationNode: { index },
    //   })
    // );

    // traverse(fragment.childNodes, (child, path));
    // const stack = [...rootItems];
    // while (stack.length) {
    //   const { node, compilationNode } = stack.pop() as StackItem;

    //   node.childNodes.forEach((x, index) => {
    //     const childItem = {
    //       node: x,
    //       compilationNode: { index, parent: compilationNode },
    //     };
    //     stack.push(childItem);

    //     if (compilationNode.children)
    //       compilationNode.children.push(childItem.compilationNode);
    //     else compilationNode.children = [childItem.compilationNode];
    //   });
    // }

    // console.log(rootItems);

    // const stack: StackItem[] = [
    //   { childNode: childNode, compilationNode: { index: 0 } },
    // ];
    // while (stack.length) {
    //   const { childNode, comilationNode } = stack.pop() as typeof stack[number];
    //   childNode.childNodes.forEach((x) => stack.push(x));
    // }
    return result;
  }

  function addContext(target: Node, func: Function) {
    const renderer: Renderable = {
      render({ target }: { target: Node }, context: any): RenderResult {
        const value = func(context);
        if (isSubscribable(value)) {
          const subscr = value.subscribe({
            next(x: any) {
              target.textContent = x;
            },
          });
          return {
            dispose() {
              subscr.unsubscribe();
            },
          };
        } else {
          target.textContent = value;
        }
      },
    };
    return renderersMap.add(target, renderer);
  }

  function setAttribute(elt: Element, name: string, value: any): void {
    if (isSubscribable(value)) {
      renderersMap.add(elt, {
        render(ctx) {
          bind(ctx.target, value);
        },
      });
    } else if (typeof value === 'function') {
      const func = value;
      renderersMap.add(elt, {
        render(ctx, args) {
          const value = func(args);

          if (isSubscribable(value)) {
            bind(ctx.target, value);
          } else {
            ctx.target.setAttribute(name, value);
          }
        },
      });
    } else {
      elt.setAttribute(name, value);
    }

    function bind(target: Element, subscribable: Subscribable<any>) {
      const subscr = subscribable.subscribe({
        next(value) {
          target.setAttribute(name, value);
        },
      });

      return {
        dispose() {
          subscr.unsubscribe();
        },
      };
    }
  }
}

interface CompilationEvent {
  name: string;
  callback: Function;
}

class CompileResult {
  private renderablesMap: { [i: number]: Renderable[] } = {};
  private eventsMap: { [i: number]: CompilationEvent[] } = {};

  constructor(private fragment: DocumentFragment) {}

  addEvents(index: number, events?: CompilationEvent[]) {
    if (events) this.eventsMap[index] = events;
  }

  addRenderables(index: number, renderables?: Renderable[]) {
    if (renderables) this.renderablesMap[index] = renderables;
  }

  render(target: RenderTarget, context: any) {
    const { fragment } = this;
    const rootClone = fragment.cloneNode(true);
    const renderResults: RenderResult[] = [];

    const rootChildren: ChildNode[] = [];
    rootClone.childNodes.forEach((x) => rootChildren.push(x));
    // const { renderablesMap } = this;

    // let stack: Node[] = [...rootChildren];
    // let flatIndex = 0;
    // let stackLength = stack.length;
    // while (stackLength) {
    //   const target = stack[--stackLength] as Node;
    //   const childNodes = target.childNodes;
    //   let length = childNodes.length;
    //   while (length--) {
    //     stack[stackLength++] = childNodes[length];
    //   }

    //   // const events = eventsMap[flatIndex];
    //   // if (events) {
    //   //   for (const event of events) {
    //   //     const callback = event.callback;
    //   //     const handler = {
    //   //       handleEvent() {
    //   //         callback(context);
    //   //       },
    //   //     };
    //   //     target.addEventListener(event.name, handler);
    //   //   }
    //   // }
    //   const renderables = renderablesMap[flatIndex];
    //   if (renderables) {
    //     for (const renderer of renderables) {
    //       const rr = renderer.render({ target }, context);
    //       renderResults.push(rr);
    //     }
    //   }
    //   flatIndex++;
    // }
    target.appendChild(rootClone);
    renderResults.push({
      dispose() {
        rootChildren.forEach((child) => child.remove());
      },
    });
    return renderResults;
  }
}

function createLookup<K, T>() {
  const lookup = new Map<K, T[]>();
  return {
    get(key: K) {
      return lookup.get(key);
    },
    add(key: K, value: T) {
      const values = lookup.get(key);
      if (values) {
        values.push(value);
      } else {
        lookup.set(key, [value]);
      }
    },
  };
}

type VisitResult<T> = {
  value?: T;
  children?: TransformResult<T>;
};
type TransformResult<T> = {
  [i: number]: VisitResult<T>;
};
function transform<T>(
  rootNodes: NodeListOf<Node>,
  visitFn: (child: Node, children?: TransformResult<T>) => T
) {
  type StackItem = [result: TransformResult<T>, index: number, node: Node];
  let stack: StackItem[] = [];
  const rootResult: TransformResult<T> = {};
  rootNodes.forEach((x, i) => stack.push([rootResult, i, x]));

  while (stack.length) {
    const [parentResult, index, node] = stack.pop() as StackItem;
    let visitResult = parentResult[index];
    if (visitResult) {
      const { children } = visitResult;
      let visitValue: VisitResult<T>['value'];
      if (children) {
        let hasAny = false;
        for (const key in Object.keys(children)) {
          const child = children[key];
          if (child.value || child.children) {
            hasAny = true;
          } else {
            delete children[key];
          }
        }
        if (!hasAny) delete visitResult.children;
        visitValue = visitFn(node, visitResult.children);
      } else {
        visitValue = visitFn(node);
      }
      if (visitValue) {
        visitResult.value = visitValue;
      }
    } else {
      parentResult[index] = visitResult = {};
      stack.push([parentResult, index, node]);

      const childNodes = node.childNodes;
      let length = childNodes.length;
      if (length) {
        const children: TransformResult<T> = {};
        visitResult.children = children;

        while (length--) {
          stack.push([children, length, childNodes[length]]);
        }
      }
    }
  }

  return rootResult;
}

type CompilationNodeAction = Renderable | CompilationEvent;
type CompilationNode = {
  index: number;
  actions?: CompilationNodeAction[];
  children?: CompilationNode[];
  parent?: CompilationNode;
};
