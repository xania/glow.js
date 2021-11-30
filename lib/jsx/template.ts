import { Subscribable } from '../util/rxjs';

export interface Disposable {
  dispose(): void;
}

export enum TemplateType {
  Attribute,
  Event,
  Text,
  Tag,
  Subscribable,
  Disposable,
  DOM,
  Function,
  Renderable,
}

// type Primitive = string | number | boolean | Date;

interface TagTemplate {
  type: TemplateType.Tag;
  name: string;
  children: Template[];
}
interface AttributeTemplate {
  type: TemplateType.Attribute;
  name: string;
  value: Exclude<any, null>;
}
interface EventTemplate {
  type: TemplateType.Event;
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
interface FunctionTemplate {
  type: TemplateType.Function;
  func: Function;
}

export interface Renderable {
  render(context: { target: any }): Disposable | Disposable[] | void;
}
interface RenderableTemplate {
  type: TemplateType.Renderable;
  renderer: Renderable;
}

export type Template =
  | TagTemplate
  | AttributeTemplate
  | NativeTemplate
  | EventTemplate
  | SubscribableTemplate
  | DisposableTemplate
  | DomTemplate
  | FunctionTemplate
  | RenderableTemplate;
