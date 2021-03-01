import {
    Binding,
    Props,
    ITemplate,
    IDriver,
    Primitive,
    isPrimitive,
    disposeMany,
} from './driver';
import { isDomNode, DomDriver } from './dom';
import { isNextObserver } from '../lib/util/helpers';
import { Subscribable, Observer, Subscription } from 'rxjs';
import { combineLatest } from './util/combineLatest';

declare type PureComponent = (...args: any) => any;
declare type Func<T> = (arg: T) => any;
declare type Attachable = {
    attachTo: (dom: HTMLElement) => { dispose(): any };
};

type TemplateElement =
    | Primitive
    | Subscribable<Primitive>
    | string
    | PureComponent
    | ITemplate
    | { view: TemplateElement }
    | HTMLElement;
type TemplateInput = TemplateElement | TemplateElement[];

export function tpl(
    name: TemplateInput,
    props: Props | null = null,
    ...children: any[]
): ITemplate | ITemplate[] {
    if (typeof name === 'string') {
        const flatChildren = flatTree(children, (e) => e);
        return new TagTemplate(
            name,
            props
                ? (attributes(props) as ITemplate[]).concat(flatChildren)
                : flatChildren
        );
    }

    if (typeof name === 'function') {
        return construct(name, [props, children]) || name(props, children);
    }

    return asTemplate(name);
}

export function lazy<T>(fn: () => T | Subscribable<T>) {
    return {
        subscribe(observer: Observer<T>) {
            var value = fn();
            if (isSubscribable(value)) {
                return value.subscribe(observer);
            }
            observer.next(value);
            return {
                unsubscribe() {
                    debugger;
                },
            };
        },
    };
}

function construct(func: Function, args: any[]) {
    try {
        if (!func) return false;
        if (func === Symbol) return false;
        return Reflect.construct(func, args);
    } catch (e) {
        return false;
    }
}

export function flatTree<T = any>(
    tree: any[],
    project: (item: any) => T | T[]
) {
    if (!Array.isArray(tree)) return [];

    var retval: T[] = [];
    var stack = [];
    // copy tree to stack reverse order
    for (let i = tree.length - 1; i >= 0; i--) {
        stack.push(tree[i]);
    }

    while (stack.length > 0) {
        var curr = stack.pop();
        if (Array.isArray(curr)) {
            stack.push.apply(stack, reverse(curr));
        } else if (curr !== null && curr !== undefined) {
            const projected = project(curr);
            if (Array.isArray(projected)) {
                retval.push.apply(retval, projected);
            } else if (projected !== undefined && projected !== null) {
                retval.push(projected);
            }
        }
    }
    return retval;
}

function hasProperty<P extends string>(
    obj: any,
    prop: P
): obj is { [K in P]: any } {
    return typeof obj === 'object' && obj !== null && prop in obj;
}

export default tpl;

export class FragmentTemplate implements ITemplate {
    constructor(public children?: ITemplate[]) {}

    render(driver: IDriver) {
        return {
            driver() {
                return driver;
            },
            dispose() {},
        };
    }
}

export class EmptyTemplate implements ITemplate {
    constructor() {}

    render(driver: IDriver) {
        return {
            driver() {
                return driver;
            },
            dispose() {},
        };
    }
}

class TemplateAttachable implements ITemplate {
    constructor(private attachable: Attachable) {}

    render(driver: DomDriver) {
        return this.attachable.attachTo(driver.target);
    }
}
class TemplateSubscription implements ITemplate {
    constructor(private subscription: Subscription) {}

    dispose() {
        return this.subscription.unsubscribe();
    }

    render() {
        return this;
    }
}

export class TemplateObservable<T> implements ITemplate {
    constructor(public observable: Subscribable<T>) {}

    render(driver: IDriver): Binding {
        const { observable } = this;
        let bindings: null | Binding[] = null;
        const scope = driver.createScope();
        const subscr = observable.subscribe((value) => {
            if (bindings && bindings.length === 1 && isPrimitive(value)) {
                const binding = bindings[0];
                if (isNextObserver(binding)) {
                    binding.next(value);
                    return;
                }
            }
            disposeMany(bindings);
            bindings = render(scope, asTemplate(value));
        });

        return {
            dispose() {
                subscr.unsubscribe();
                scope.dispose();
                disposeMany(bindings);
            },
        };
    }
}

class TemplatePromise<T extends TemplateInput> implements ITemplate {
    constructor(public promise: Promise<T>) {}

    then<U>(fn: (value: T) => U | PromiseLike<U>): Promise<U> {
        return this.promise.then(fn);
    }

    render(driver: IDriver): Binding {
        var scope = driver.createScope();
        var disposed = false;
        var loaded = false;
        var loadingBinding: Binding[] | Binding | null = null;
        const promise = this.promise;

        setTimeout(function () {
            if (loaded || disposed) return;

            loadingBinding = render(
                scope,
                tpl('div', { class: 'loading-placeholder' })
            );
            promise.then((_) => {
                disposeMany(loadingBinding);
            });
        }, 200);

        const bindingPromise = promise.then((item) => {
            loaded = true;
            const template = asTemplate(item);
            return disposed ? null : render(scope, template);
        });
        return {
            driver() {
                return scope;
            },
            dispose() {
                disposed = true;
                scope.dispose();
                bindingPromise.then(disposeMany);
            },
        };
    }
}

export function attributes(props: Props) {
    return (
        props && Object.keys(props).map((key) => new Attribute(key, props[key]))
    );
}

const __emptyTemplate: ITemplate = {
    render() {
        return {
            dispose() {},
        } as Binding;
    },
};

export function asTemplate(name: any): ITemplate | ITemplate[] {
    if (typeof name === 'undefined' || name === null) {
        return __emptyTemplate;
    } else if (isTemplate(name)) return name;
    else if (isAttachable(name)) return new TemplateAttachable(name);
    else if (typeof name === 'function') return name;
    else if (Array.isArray(name)) return flatTree(name, asTemplate);
    else if (isPromise<TemplateInput>(name)) return new TemplatePromise(name);
    else if (isSubscribable(name)) return new TemplateObservable(name);
    else if (isSubscription(name)) return new TemplateSubscription(name);
    else if (hasProperty(name, 'view')) return asTemplate(name.view);

    return new NativeTemplate(name);
}

function isAttachable(value: any): value is Attachable {
    return value && typeof value.attachTo === 'function';
}

function isSubscribable(value: any): value is Subscribable<unknown> {
    return value && typeof value.subscribe === 'function';
}

function isSubscription(value: any): value is Subscription {
    return value && typeof value.unsubscribe === 'function';
}

function isPromise<T = unknown>(value: any): value is Promise<T> {
    return value && typeof value.then === 'function';
}

function isTemplate(value: any): value is ITemplate {
    return typeof value['render'] === 'function';
}

function functionAsTemplate(func: Function): ITemplate {
    return {
        render(driver: IDriver, ...args) {
            const tpl = func(...args);
            var template = asTemplate(tpl);
            if (Array.isArray(template)) {
                const bindings: Binding[] = [];
                for (let i = 0; i < template.length; i++) {
                    const b = template[i].render(driver);
                    if (b) {
                        bindings.push();
                    }
                }
                return {
                    dispose() {
                        for (let i = 0; i < bindings.length; i++) {
                            const binding = bindings[i];
                            if (binding.dispose) {
                                binding.dispose();
                            }
                        }
                    },
                };
            } else {
                return template.render(driver);
            }
        },
    };
}

class TagTemplate implements ITemplate {
    constructor(public name: string, public children: ITemplate[]) {}

    render(driver: IDriver, init?: Func<any>) {
        let { name } = this;
        return driver.createElement(name, init);
    }
}

class NativeTemplate implements ITemplate {
    constructor(
        public value: Primitive | Subscribable<Primitive> | HTMLElement
    ) {}

    render(driver: IDriver): Binding {
        let { value } = this;

        if (isPrimitive(value)) {
            return driver.createNative(value);
        } else if (isSubscribable(value)) {
            let expr = value;
            let textElement = driver.createNative(null);
            expr.subscribe(textElement as any);
            return textElement;
        } else {
            return driver.createNative(value);
        }
    }
}

type AttributeValue = Primitive | Subscribable<Primitive>;

class Attribute implements ITemplate {
    constructor(
        public name: string,
        public value:
            | (AttributeValue | AttributeValue[])
            | (() => AttributeValue | AttributeValue[])
    ) {}

    render(driver: IDriver): Binding | null {
        let { name, value } = this;

        if (value === null || value === void 0) {
            return null;
        }

        if (typeof value === 'function') {
            const eventBinding = driver.createEvent(name, value);
            if (eventBinding) return eventBinding;

            console.error('not a valid event ' + name);
            value = value();
        }

        if (Array.isArray(value)) {
            const binding = driver.createAttribute(name, undefined);
            const subscr = combineLatest(value).subscribe(binding);

            return {
                dispose() {
                    subscr.unsubscribe();
                    binding.dispose();
                },
            };
        } else if (isSubscribable(value)) {
            const expr = value;
            const binding = driver.createAttribute(name, undefined);
            const subscr = expr.subscribe(binding);
            return {
                dispose() {
                    subscr.unsubscribe();
                    binding.dispose();
                },
            };
        } else return driver.createAttribute(name, value);
    }
}

export function render(
    target: IDriver | HTMLElement,
    template: ITemplate | ITemplate[]
): Binding[] {
    const driver: IDriver = isDomNode(target) ? new DomDriver(target) : target;
    return renderStack([{ driver, template }]);
}

type StackItem = {
    driver: IDriver;
    template: ITemplate | ITemplate[] | (() => any);
};
export function renderStack(roots: StackItem[]) {
    const bindings: Binding[] = [];
    const stack = roots.slice(0);

    while (stack.length) {
        const curr = stack.pop();
        if (!curr) {
            break;
        }
        const { driver, template } = curr;
        if (template === null || template === undefined) continue;

        if (Array.isArray(template)) {
            for (let i = template.length - 1; i >= 0; i--) {
                stack.push({ driver, template: template[i] });
            }
            continue;
        } else if (typeof template === 'function') {
            stack.push({
                driver,
                template: asTemplate(template.name || '[ Function ]'),
            });
            continue;
        } else if (!isTemplate(template)) {
            stack.push({ driver, template: asTemplate(template) });
            continue;
        }

        const binding = template.render(driver);
        if (binding) {
            bindings.push(binding);
            if (binding.driver) {
                const { children } = template;
                if (children) {
                    var childDriver = binding.driver();
                    if (childDriver) {
                        for (var i = children.length - 1; i >= 0; i--) {
                            stack.push({
                                driver: childDriver,
                                template: asTemplate(children[i]),
                            });
                        }
                    }
                }
            }
        }
    }

    for (var i = 0; i < bindings.length; i++) {
        const binding = bindings[i];
        if (isInitializable(binding)) binding.ready();
    }

    return bindings;
}

interface Initializable {
    ready(): void;
}

function isInitializable(obj: any): obj is Initializable {
    return obj && typeof obj['ready'] === 'function';
}

export function renderMany(driver: IDriver, children: ITemplate[]): Binding[] {
    const stack = [];

    for (let i = children.length - 1; i >= 0; i--) {
        const template = children[i];
        stack.push({
            driver,
            template,
        });
    }

    return renderStack(stack);
}

function reverse<T>(arr: T[]): T[] {
    const result: T[] = [];

    for (let i = arr.length - 1; i >= 0; i--) {
        result.push(arr[i]);
    }

    return result;
}
