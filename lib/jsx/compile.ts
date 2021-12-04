import { TemplateType, Template, Renderable } from './template';
import { createDOMElement } from './render';

interface RenderTarget {
  appendChild(node: Node): void;
  setAttribute(name: string, value: any): void;
}

type StackItem = [RenderTarget, Template | Template[]];

export function compile(rootTemplate: Template | Template[]) {
  const result = new CompileResult();
  const stack: StackItem[] = [[result, rootTemplate]];
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
        const { name, children } = template;
        const dom = createDOMElement(null, name);
        target.appendChild(dom);

        for (let i = 0; i < children.length; i++) {
          stack.push([dom, children[i]]);
        }
        break;
      case TemplateType.Attribute:
        target.setAttribute(template.name, template.value);
        break;
      case TemplateType.Text:
        const textNode = document.createTextNode(template.value);
        target.appendChild(textNode);
        break;
      case TemplateType.Renderable:
        result.addRenderer(target, template.renderer);
        break;
    }
  }
  return result;
}

class CompileResult implements RenderTarget {
  private fragment: DocumentFragment;
  private attrs = new Map<string, unknown>();
  private rendererMap = new Map<RenderTarget, Renderable[]>();

  /**
   *
   */
  constructor() {
    this.fragment = new DocumentFragment();
  }

  appendChild(node: Node): void {
    this.fragment.appendChild(node);
  }
  setAttribute(name: string, value: any): void {
    this.attrs.set(name, value);
  }

  render(target: RenderTarget, context: any) {
    const { fragment } = this;
    const fragmentClone = this.fragment.cloneNode(true);
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

  addRenderer(target: RenderTarget, renderer: Renderable) {
    const { rendererMap } = this;
    let renderers = rendererMap.get(target);
    if (renderers) {
      renderers.push(renderer);
    } else {
      rendererMap.set(target, [renderer]);
    }
  }
}
