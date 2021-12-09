import { Subscribable } from '../util/rxjs';

export interface Disposable {
  dispose(): void;
}

export enum TemplateType {
  Text,
  Tag,
  Subscribable,
  Disposable,
  DOM,
  Renderable,
  Context,
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
  callback: Function;
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

export type RenderResult = Disposable | RenderResult[] | void;
export interface Renderable {
  render(context: { target: any }, args?: any[]): RenderResult;
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
  | RenderableTemplate;
