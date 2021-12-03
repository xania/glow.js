import { TemplateType, Template } from './template';
import { createDOMElement } from './render';

interface RenderTarget {
  appendChild(node: Node): void;
  setAttribute(name: string, value: any): void;
}

type StackItem = [RenderTarget, Template | Template[]];

export function compile(
  namespaceURI: string | null,
  rootTemplate: Template | Template[]
) {
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
        const dom = createDOMElement(namespaceURI, name);
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
    }
  }
  return result;
}

class CompileResult implements RenderTarget {
  private fragment: DocumentFragment;
  private attrs = new Map<string, unknown>();

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

  render(target: RenderTarget) {
    target.appendChild(this.fragment);
  }
}
