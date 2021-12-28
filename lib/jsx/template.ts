import { Subscribable, Unsubscribable } from '../util/rxjs';
import { Expression } from './expression';

export interface Disposable {
  dispose(): void;
}

export interface Removable {
  remove(): void;
}

export enum TemplateType {
  Text,
  Tag,
  Subscribable,
  Disposable,
  DOM,
  Renderable,
  Context,
  Expression,
}

export enum AttributeType {
  Attribute,
  Event,
}

// type Primitive = string | number | boolean | Date;

export interface TagTemplate {
  type: TemplateType.Tag;
  name: string;
  attrs: (AttributeTemplate | EventTemplate)[] | null;
  children: Template[];
}

interface AttributeTemplate {
  type: AttributeType.Attribute;
  name: string;
  value: Exclude<any, null>;
}
interface EventTemplate {
  type: AttributeType.Event;
  event: string;
  handler: Function;
}
interface NativeTemplate {
  type: TemplateType.Text;
  value: string;
}
interface SubscribableTemplate {
  type: TemplateType.Subscribable;
  value: Subscribable<any>;
}
interface DisposableTemplate extends Disposable {
  type: TemplateType.Disposable;
}

interface DomTemplate {
  type: TemplateType.DOM;
  node: Node;
}

interface ContextTemplate {
  type: TemplateType.Context;
  func: (context: any) => any;
}

export interface ExpressionTemplate {
  type: TemplateType.Expression;
  expression: Expression;
}

interface EventHandler {
  target: Element;
  type: string;
  handler: any;
}

type RenderResultItem = Unsubscribable | Disposable | Removable;
export class RenderResult {
  readonly items: RenderResultItem[] = [];

  static create(...results: (RenderResultItem | null | undefined | void)[]) {
    var result = new RenderResult();
    const { items } = result;

    for (const x of results) {
      if (x) {
        items.push(x);
      }
    }

    return result;
  }

  dispose() {
    const { items } = this;
    for (const item of items) {
      if ('dispose' in item) item.dispose();
      if ('remove' in item) item.remove();
      if ('unsubscribe' in item) item.unsubscribe();
    }

    items.length = 0;
  }
}

export interface RenderContext {
  values: any;
  remove(): unknown;
}
export interface Renderable {
  render(driver: { target: any }, context?: RenderContext): RenderResult | void;
}
export interface RenderableTemplate {
  type: TemplateType.Renderable;
  renderer: Renderable;
}

export type Template =
  | TagTemplate
  | NativeTemplate
  | SubscribableTemplate
  | DisposableTemplate
  | DomTemplate
  | ContextTemplate
  | RenderableTemplate
  | ExpressionTemplate;
