import { AttributeType, TemplateType, Template, Renderable } from './template';
import { createDOMElement } from './render';

interface RenderTarget {
  appendChild(node: Node): void;
  setAttribute(name: string, value: any): void;
}

type StackItem = [Node, Template | Template[]];

export function compile(rootTemplate: Template | Template[]) {
  const result = new CompileResult();
  const stack: StackItem[] = [[result.root, rootTemplate]];
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
            if (attr.type === AttributeType.Attribute)
              dom.setAttribute(attr.name, attr.value);
            else
              dom.addEventListener(attr.event, {
                handleEvent() {
                  debugger;
                  attr.callback({ target });
                },
              });
          }
        }

        for (let i = 0; i < children.length; i++) {
          stack.push([dom, children[i]]);
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
        const asyncNode = document.createTextNode('loading...');
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
    }
  }
  return result;
}

class CompileResult implements RenderTarget {
  root: DocumentFragment;
  private attrs = new Map<string, unknown>();
  private rendererMap = new Map<Node, Renderable[]>();

  /**
   *
   */
  constructor() {
    this.root = new DocumentFragment();
  }

  appendChild(node: Node): void {
    this.root.appendChild(node);
  }
  setAttribute(name: string, value: any): void {
    this.attrs.set(name, value);
  }

  render(target: RenderTarget, context: any) {
    const { root: fragment } = this;
    const fragmentClone = this.root.cloneNode(true);
    const cloneMap = new Map<Node, Node>();
    const stack = [[fragment, fragmentClone]];
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

    const { rendererMap } = this;
    for (const [target, renderables] of rendererMap.entries()) {
      const targetClone = cloneMap.get(target as any);
      for (const renderer of renderables) {
        renderer.render({ target: targetClone }, context);
      }
    }
    target.appendChild(fragmentClone);
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
}
