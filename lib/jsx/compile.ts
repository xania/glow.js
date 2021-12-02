import { TemplateType, Template } from './template';
import { createDOMElement } from './render';

interface RenderTarget {
  appendChild(node: Node): void;
}

type StackItem = [RenderTarget, Template | Template[]];

export function compile(
  namespaceURI: string | null,
  rootTemplate: Template | Template[]
) {
  const fragments = new DocumentFragment();
  const stack: StackItem[] = [[fragments, rootTemplate]];
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
    }
  }
  console.log(fragments);
}
