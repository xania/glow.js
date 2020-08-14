import { ITemplate, IDriver, Binding, disposeMany } from '../../lib/driver';
import { renderStack } from '../../lib/tpl';
import { flatTree } from './helpers';
import { Subscribable } from 'rxjs';

type Disposable = { dispose(): any };
export type Mutation<T = unknown> =
    | PushItem<T>
    | InsertItem<T>
    | MoveItem
    | RemoveItem<T>
    | ResetItems<T>;
interface PushItem<T> {
    type: 'push';
    values: T;
}

interface MoveItem {
    type: 'move';
    from: number;
    to: number;
}

export function push<T>(values: T): PushItem<T> {
    return {
        type: 'push',
        values,
    };
}
interface InsertItem<T> {
    type: 'insert';
    values: T;
    index: number;
}

export function insert<T>(values: T, index: number): InsertItem<T> {
    return {
        type: 'insert',
        values,
        index,
    };
}
interface RemoveItem<T> {
    type: 'remove';
    values: T;
}
export function remove<T>(values: T): RemoveItem<T> {
    return {
        type: 'remove',
        values,
    };
}

interface ResetItems<T> {
    type: 'reset';
    items: T[];
}

export function reset<T>(items: T[]): ResetItems<T> {
    return {
        type: 'reset',
        items,
    };
}

type ItemTemplate<T> = (values: T, index: () => number) => ITemplate[];
interface ContainerProps<T> {
    mutations: ContainerSource<T>;
}
export function Container<T>(
    props: ContainerProps<T>,
    _children: ItemTemplate<T>[]
) {
    return {
        render(driver: IDriver) {
            const items: ContainerItem<T>[] = [];
            const { mutations } = props;
            const rootScope = driver.createScope();

            return [
                mutations.subscribe(applyMutation),
                {
                    dispose() {
                        for (const item of items) {
                            const { scope, bindings } = item;
                            for (const binding of bindings) {
                                if (binding.dispose) {
                                    binding.dispose();
                                }
                            }
                            scope.dispose();
                        }
                    },
                },
            ];

            function applyMutation(m: Mutation<T>) {
                if (m.type === 'push') {
                    const { values } = m;
                    applyInsert(values, items.length);
                } else if (m.type === 'insert') {
                    const { values, index } = m;
                    applyInsert(values, index);
                } else if (m.type === 'remove') {
                    const idx = items.findIndex((x) => x.values === m.values);
                    if (idx >= 0) {
                        const item = items[idx];
                        const { scope, bindings } = item;
                        scope.dispose();
                        disposeMany(bindings);
                        items.splice(idx, 1);
                    }
                } else if (m.type === 'reset') {
                    while (items.length) {
                        const { scope, bindings } = items.pop();
                        scope.dispose();
                        disposeMany(bindings);
                    }

                    for (let i = 0; i < m.items.length; i++) {
                        applyInsert(m.items[i], i);
                    }
                } else if (m.type === 'move') {
                    // TODO implement!
                } else {
                    console.error('not a mutation ', m);
                }

                function applyInsert(values: T, idx: number) {
                    const itemScope = rootScope.createScope(idx);
                    const bindings = renderStack(
                        flatTree(_children, [values, index])
                            .map((template) => ({
                                driver: itemScope,
                                template,
                            }))
                            .reverse()
                    );
                    const item: ContainerItem<T> = {
                        scope: itemScope,
                        bindings,
                        values,
                    };
                    items.splice(idx, 0, item);

                    function index() {
                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            if (item.scope === itemScope) {
                                return i;
                            }
                        }
                        return idx;
                    }
                }
            }
        },
    };
}

export interface ContainerSource<T> extends Subscribable<Mutation<T>> {
    add(values: T | Mutation<T>): void;
    reset(items: T[]): void;
    peek<R>(fn: (items: T[]) => R): R;
}

interface ContainerItem<T> {
    bindings: Binding[];
    scope: Disposable;
    values: T;
}

export interface ContainerItemContext {
    dispose(): any;
    index: () => number;
}
