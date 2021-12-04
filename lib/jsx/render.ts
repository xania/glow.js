import { Renderable, Template, TemplateType } from './template';

export interface RenderTarget {
  addEventListener(event: string, handler: EventHandler): void;
  setAttribute(name: string, value: string): void;
  namespaceURI: string | null;
  removeChild(node: Node): void;
  appendChild(node: Node): void;
}

export type EventHandler = { handleEvent(): void };

export function render(
  root: RenderTarget,
  children: Template | Template[]
  // args?: any[]
) {
  const stack: [RenderTarget, Template][] = [];
  const disposables: ReturnType<Renderable['render']>[] = [];

  if (Array.isArray(children)) {
    let { length } = children;
    for (let i = length - 1; i >= 0; i--) {
      stack.push([root, children[i]]);
    }
  } else {
    stack.push([root, children]);
  }

  let curr;
  while ((curr = stack.pop())) {
    const [target, child] = curr;

    switch (child.type) {
      case TemplateType.Tag:
        const { children } = child;
        const tag = createDOMElement(target.namespaceURI, child.name);

        let { length } = children;
        target.appendChild(tag);
        for (let i = length - 1; i >= 0; i--) {
          stack.push([tag, children[i]]);
        }

        if (target === root) {
          disposables.push({
            dispose() {
              target.removeChild(tag);
            },
          });
        }

        break;

      case TemplateType.Text:
        const textNode = document.createTextNode(child.value);
        target.appendChild(textNode);
        if (target === root) {
          disposables.push({
            dispose() {
              target.removeChild(textNode);
            },
          });
        }
        break;

      case TemplateType.Attribute:
        target.setAttribute(child.name, child.value);
        break;

      case TemplateType.Event:
        const { event, callback } = child;
        target.addEventListener(event, {
          handleEvent() {
            callback({ target });
          },
        });

        break;

      case TemplateType.Subscribable:
        const subscribableNode = document.createTextNode('');
        target.appendChild(subscribableNode);
        const subcr = child.value.subscribe({
          next(value) {
            subscribableNode.textContent = value;
          },
        });
        disposables.push({
          dispose() {
            subcr.unsubscribe();
          },
        });
        break;

      case TemplateType.Disposable:
        disposables.push(child);
        break;
      case TemplateType.DOM:
        target.appendChild(child.node);
        break;
      case TemplateType.Renderable:
        addDisposables(child.renderer.render({ target }));
        break;
    }
  }

  function addDisposables(result: ReturnType<Renderable['render']>) {
    if (result) {
      disposables.push(result);
    }
  }
  return disposables;
}

export function createDOMElement(namespaceURI: string | null, name: string) {
  return document.createElementNS(
    name === 'svg' ? 'http://www.w3.org/2000/svg' : namespaceURI,
    name
  );
}
