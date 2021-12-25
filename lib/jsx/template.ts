import { Subscribable } from '../util/rxjs';
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

export interface ExpressionTemplate {
  type: TemplateType.Expression;
  expression: Expression;
  async(): ExpressionTemplate;
}

export type RenderResult = Disposable | Removable | RenderResult[] | void;
export interface RenderContext {
  values: any;
  remove(): unknown;
}
export interface Renderable {
  render(driver: { target: any }, context?: RenderContext): RenderResult;
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
