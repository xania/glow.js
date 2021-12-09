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
  const renderers = createLookup<Node, Renderable>();
  const events = createLookup<Node, CompilationEvent>();

  const fragment = new  DocumentFragment();
  const stack: StackItem[] = [[fragment, rootTemplate]];
  while (stack.length > 0) {
    const curr = stack.pop();
    if (!curr) continue;
    const [target, template] = curr;
    if (Array.isArray(template)) {
      for (let i = template.length; i--; ) {
        stack.push([target, template[i]]);
      }
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
              events.add(dom, { name: attr.event, callback: attr.callback });
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
        renderers.add(target, template.renderer);
        break;
      case TemplateType.Subscribable:
        const asyncNode = document.createTextNode('');
        target.appendChild(asyncNode);
        renderers.add(asyncNode, {
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

  function createResult()
  {
   const result = new CompileResult(fragment);
    traverse(fragment.childNodes, (node, i) => {
      result.addEvents(i, events.get(node));
      result.addRenderables(i, renderers.get(node));
    })
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
    return renderers.add(target, renderer);
  }

  function setAttribute(elt: Element, name: string, value: any): void {
    if (isSubscribable(value)) {
      renderers.add(elt, {
        render(ctx) {
          bind(ctx.target, value);
        },
      });
    } else if (typeof value === 'function') {
      const func = value;
      renderers.add(elt, {
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

    traverse(rootClone.childNodes, (target, i) => {
      const events = this.eventsMap[i];
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
      const renderables = this.renderablesMap[i];
      if (renderables) {
        for (const renderer of renderables) {
          const rr = renderer.render({ target }, context);
          renderResults.push(rr);
        }
      }
    });

    const rootChildren: ChildNode[] = [];
    rootClone.childNodes.forEach((x) => rootChildren.push(x));
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
    }
  }
}

function traverse(rootNodes: NodeListOf<Node>, visitor: (child: Node, index: number) => any) {
    let stack: Node[] = [];
    rootNodes.forEach((x) => stack.push(x));
    
    let flatIndex = 0;
    while (stack.length) {
      const curr = stack.pop() as Node;
      const childNodes = curr.childNodes;
      let length = curr.childNodes.length;
      while(length--) {
        stack.push(childNodes[length])
      }
      visitor(curr, flatIndex++);
    }
}