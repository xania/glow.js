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
  const result = new CompileResult();
  const stack: StackItem[] = [[result.fragments, rootTemplate]];
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
              result.setAttribute(dom, attr.name, attr.value);
            } else {
              result.addEventListener(dom, attr.event, attr.callback);
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
        result.addRenderer(target, template.renderer);
        break;
      case TemplateType.Subscribable:
        const asyncNode = document.createTextNode('');
        target.appendChild(asyncNode);
        result.addRenderer(asyncNode, {
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
        result.addContext(contextNode, template.func);
        break;
    }
  }
  return result;
}

interface CompileEvent {
  element: Element;
  type: string;
  callback: Function;
}

class CompileResult implements RenderTarget {
  fragments: DocumentFragment;
  private attrs = new Map<string, unknown>();
  private rendererMap = new Map<Node, Renderable[]>();
  private events: CompileEvent[] = [];

  /**
   *
   */
  constructor() {
    this.fragments = new DocumentFragment();
  }

  appendChild(node: Node): void {
    this.fragments.appendChild(node);
    return;
  }
  setAttribute(elt: Element, name: string, value: any): void {
    if (isSubscribable(value)) {
      this.addRenderer(elt, {
        render(ctx) {
          bind(ctx.target, value);
        },
      });
    } else if (typeof value === 'function') {
      const func = value;
      this.addRenderer(elt, {
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

  addEventListener(element: Element, type: string, callback: Function) {
    this.events.push({
      element,
      type,
      callback,
    });
  }

  render(target: RenderTarget, context: any) {
    const { fragments: fragment } = this;
    const rootClone = this.fragments.cloneNode(true);
    const cloneMap = new Map<Node, Node>();
    const stack = [[fragment, rootClone]];
    while (stack.length) {
      const curr = stack.pop();
      if (!curr) continue;

      const [original, clone] = curr;
      cloneMap.set(original, clone);

      if (original.childNodes.length !== clone.childNodes.length) {
        throw Error('clone mismatch');
      }

      const originalChildNodes = original.childNodes;
      const cloneChildNodes = clone.childNodes;
      let length = originalChildNodes.length;
      while (length--) {
        stack.push([originalChildNodes[length], cloneChildNodes[length]]);
      }
    }

    const renderResults: RenderResult[] = [];

    const { rendererMap } = this;
    for (const [target, renderables] of rendererMap.entries()) {
      const targetClone = cloneMap.get(target as any);
      for (const renderer of renderables) {
        const rr = renderer.render({ target: targetClone }, context);
        renderResults.push(rr);
      }
    }

    for (const event of this.events) {
      const targetClone = cloneMap.get(event.element as any);
      const callback = event.callback;
      const handler = {
        handleEvent() {
          callback(context);
        },
      };
      targetClone?.addEventListener(event.type, handler);
    }

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

  addRenderer(target: Node, renderer: Renderable) {
    const { rendererMap } = this;
    let renderers = rendererMap.get(target);
    if (renderers) {
      renderers.push(renderer);
    } else {
      rendererMap.set(target, [renderer]);
    }
  }

  addContext(target: Node, func: Function) {
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
    return this.addRenderer(target, renderer);
  }
}
