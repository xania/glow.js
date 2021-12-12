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
    const actions = transform<NodeAction>(fragment.childNodes, (node) => {
      const events = eventsMap.get(node);
      const renderers = renderersMap.get(node);
      if (!events && !renderers) return undefined;
      const retval: NodeAction = {};
      if (events) retval['events'] = events;
      if (renderers) retval['renderers'] = renderers;

      return retval;
    });
    return new CompileResult(fragment, actions);
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

interface NodeAction {
  renderers?: Renderable[];
  events?: CompilationEvent[];
}

class CompileResult {
  constructor(
    private fragment: DocumentFragment,
    private nodeActionTree?: TransformResult<NodeAction>
  ) {
    console.log(nodeActionTree);
  }

  render(target: RenderTarget, context: any) {
    const { fragment, nodeActionTree } = this;
    const rootClone = fragment.cloneNode(true);
    const renderResults: RenderResult[] = [];

    const rootChildren: ChildNode[] = [];
    rootClone.childNodes.forEach((x) => rootChildren.push(x));

    if (nodeActionTree) {
      type StackItem = [ChildNode[], TransformResult<NodeAction>];
      const stack: StackItem[] = [[rootChildren, nodeActionTree]];
      while (stack.length) {
        const [nodes, tree] = stack.pop() as StackItem;

        for (const i in tree) {
          const actionNode = tree[i];
          const { value: actions, children } = actionNode;
          const target = nodes[i];
          if (actions) {
            const { events, renderers } = actions;
            if (events) {
              for (const event of events) {
                const callback = event.callback;
                const handler = {
                  handleEvent() {
                    callback(context);
                  },
                };
                target.addEventListener(event.name, handler);
              }
            }
            if (renderers) {
              for (const renderer of renderers) {
                const rr = renderer.render({ target }, context);
                renderResults.push(rr);
              }
            }
          }
          if (children) {
            const childNodes: ChildNode[] = [];
            target.childNodes.forEach((x) => childNodes.push(x));
            stack.push([childNodes, children]);
          }
        }
      }
    }

    target.appendChild(rootClone);
    renderResults.push({
      dispose() {
        for (const root of rootChildren) {
          root.remove();
        }
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
  visitFn: (child: Node, children?: TransformResult<T>) => T | undefined
) {
  type StackItem = [result: TransformResult<T>, index: number, node: Node];
  let stack: StackItem[] = [];
  const rootResult: TransformResult<T> = {};
  rootNodes.forEach((x, i) => stack.push([rootResult, i, x]));

  while (stack.length) {
    const [parentResult, index, node] = stack.pop() as StackItem;
    let visitResult = parentResult[index];
    if (visitResult) {
      const children = sanitize(visitResult.children);
      if (!children) {
        delete visitResult.children;
      }
      const visitValue = visitFn(node, children);
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

  return sanitize(rootResult);
}

function sanitize<T>(children?: TransformResult<T>) {
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
    if (!hasAny) return undefined;
    return children;
  } else {
    return undefined;
  }
}
