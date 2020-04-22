import { Subscribable } from 'rxjs';

export type Executable<T> = { execute: (e: T) => any } | Function;
export type BindingValue<T> = T | Subscribable<T>;

export const children = Symbol('children');

export interface IDriver {
    bind<R>(binder: (dom: HTMLElement) => R): R;
    createElement(name: string, init?: Action<any>): TagElement;
    createNative(value: any): TextElement;
    createAttribute(name: string, value: any | any[]): TextElement;
    createEvent(
        name: string,
        value: Executable<any> | Function
    ): TagEvent | null;
    createScope(idx?: number): IDriver;
    dispose(): void;
}

export interface TagEvent {
    dispose(): any;
}
export interface TagElement {
    ready?(): any;
    driver?(): IDriver;
    dispose(): any;
}

export interface TextElement {
    dispose(): void;
    next(value: Primitive | Primitive[]): any;
}

export interface ScopeElement {
    driver(index?: number): IDriver;
    dispose(): any;
}

export declare type Props = { [key: string]: any };
export declare type Element = TagElement | TextElement | ScopeElement;
export type Primitive = string | number | boolean | Date;

export function isPrimitive(value: any): value is Primitive {
    if (value === null || value === undefined) return false;

    return (
        typeof value === 'number' ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        value instanceof Date
    );
}

declare type Action<T> = (arg: T) => any;

export interface ITemplate {
    render(driver: IDriver, init?: Action<any>): Binding | null;
    children?: ITemplate[];
}

export interface Binding {
    driver?(): IDriver;
    dispose?(): any;
}

export function init(view: ITemplate, callback: (dom: any) => any) {
    return {
        children: view.children,
        render(driver: IDriver) {
            return view.render(driver, callback);
        },
    };
}

export function isSubscribable<T>(value: any): value is Subscribable<T> {
    return value && typeof value.subscribe === 'function';
}

export interface Parent {
    [children]: Component[];
}
interface Leaf {
    insertBefore(node: Comment | HTMLElement): any;
    dispose(): void;
}
export type Component = Leaf | Parent;

function isParent(node: any): node is Parent {
    if (node == null) return false;
    if (typeof node === 'object') return children in node;
    return false;
}

export function referenceNode(root: Parent, component: Component) {
    const stack: Component[] = [root];
    let found = false;
    while (stack.length) {
        const curr = stack.pop();
        if (curr === component) {
            found = true;
        } else if (isParent(curr)) {
            const _children = curr[children];
            for (let i = _children.length - 1; i >= 0; i--) {
                stack.push(_children[i]);
            }
        } else if (found === true) {
            return curr;
        }
    }
    return null;
}

interface Disposable {
    dispose?(): void;
}

export function disposeMany(disposables: null | Disposable | Disposable[]) {
    if (!disposables) {
        return;
    }
    const stack: Disposable[] = Array.isArray(disposables)
        ? disposables.slice(0)
        : [disposables];
    while (stack.length) {
        const curr: any = stack.pop();
        if (!curr) continue;
        if (typeof curr.dispose === 'function') {
            curr.dispose();
        }

        const _children = curr[children];
        if (Array.isArray(_children)) {
            for (let i = _children.length - 1; i >= 0; i--) {
                stack.push(_children[i]);
            }
        }
    }
}
