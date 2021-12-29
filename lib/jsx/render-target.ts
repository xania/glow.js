import { Disposable } from './template';

export interface RenderTarget {
  appendChild(child: Node): void;

  addEventListener(
    target: Element,
    type: string,
    handler: Function
  ): Disposable;
}

export class ElementTarget implements RenderTarget {
  constructor(public target: Element) {}

  appendChild(child: Node): void {
    this.target.appendChild(child);
  }

  addEventListener(target: Element, type: string, handler: Function) {
    // this.target.addEventListener(type, handler);
    console.log({ target, type, handler });
    return {
      dispose() {},
    };
  }
}
