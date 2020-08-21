import { ITemplate, IDriver, Binding, disposeMany } from '../../lib/driver';
import { renderStack } from '../../lib/tpl';
import { flatTree } from './helpers';
import { Subscribable } from 'rxjs';

type Disposable = { dispose(): any };
export type Mutation<T = unknown> =
    | PushItem<T>
    | InsertItem<T>
    | MoveItem
    | RemoveItem
    | ResetItems<T>
    | CallItems<T>;
interface PushItem<T> {
    type: 'push';
    values: T;
    key;
}

interface MoveItem {
    type: 'move';
    from: number;
    to: number;
}

export function push<T>(key, values: T): PushItem<T> {
    return {
        type: 'push',
        values,
        key,
    };
}
interface InsertItem<T> {
    type: 'insert';
    values: T;
    key;
    index: number;
}

export function insert<T>(key, values: T, index: number): InsertItem<T> {
    return {
        type: 'insert',
        values,
        key,
        index,
    };
}
interface RemoveItem {
    type: 'remove';
    key: any;
}
export function remove(key): RemoveItem {
    return {
        type: 'remove',
        key,
    };
}

interface ResetItems<T> {
    type: 'reset';
    items: { key: any; values: T }[];
}

export function reset<T>(items: { key: any; values: T }[]): ResetItems<T> {
    return {
        type: 'reset',
        items,
    };
}

interface CallItems<T> {
    type: 'call';
    func: (items: T[]) => void;
}

export function call<T>(func: (items: T[]) => void): CallItems<T> {
    return {
        type: 'call',
        func,
    };
}

type ItemTemplate<T> = (key, values: T, index: () => number) => ITemplate[];
interface ListProps<T> {
    source: ListSource<T>;
}
export function List<T>(props: ListProps<T>, _children: ItemTemplate<T>[]) {
    const { source } = props;

    function itemTemplate(values: T, key, index: () => number) {
        return flatTree(_children, [values, { key, index, dispose }]);

        function dispose() {
            const idx = index();
            if (idx >= 0) {
                source.add({
                    type: 'remove',
                    key,
                });
            }
        }
    }

    return {
        render(driver: IDriver) {
            const items: ContainerItem<T>[] = [];
            const { source } = props;
            const rootScope = driver.createScope();

            return [
                source.subscribe(applyMutation),
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
                    const { key, values } = m;
                    applyInsert(key, values, items.length);
                } else if (m.type === 'insert') {
                    const { key, values, index } = m;
                    applyInsert(key, values, index);
                } else if (m.type === 'remove') {
                    const idx = items.findIndex((x) => x.key === m.key);
                    if (idx >= 0) {
                        const item = items[idx];
                        const { scope, bindings } = item;
                        scope.dispose();
                        disposeMany(bindings);
                        items.splice(idx, 1);
                    }
                } else if (m.type === 'reset') {
                    applyReset(m.items);
                } else if (m.type === 'move') {
                    // TODO implement!
                    debugger;
                } else if (m.type === 'call') {
                    m.func(items.map((x) => x.values));
                } else {
                    console.error('not a mutation ', m);
                }

                function applyInsert(key: any, values: T, idx: number) {
                    const itemScope = rootScope.createScope(idx);
                    const bindings = renderStack(
                        flatTree([itemTemplate], [values, key, index])
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
                        key,
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

                function applyReset(pairs: { key: any; values: T }[]) {
                    // while (items.length) {
                    //     const { scope, bindings } = items.pop();
                    //     scope.dispose();
                    //     disposeMany(bindings);
                    // }

                    // for (let i = 0; i < m.items.length; i++) {
                    //     applyInsert(m.items[i], i);
                    // }

                    for (let i = 0; i < items.length; i++) {
                        // for (const snap of items) {
                        const snap = items[i];
                        const { values, scope, bindings } = snap;

                        if (values) {
                            const idx = pairs.findIndex(
                                (x) => x.key == snap.key
                            );
                            if (idx < 0) {
                                scope.dispose();
                                disposeMany(bindings);
                                items.splice(i, 1);
                                i--;
                            }
                        }
                    }

                    for (let i = 0; i < pairs.length; i++) {
                        const { key, values } = pairs[i];
                        const n = items.findIndex((src) => src.key == key);

                        if (n < 0) {
                            applyMutation({
                                type: 'insert',
                                index: i,
                                values,
                                key,
                            });
                        } else if (n != i) {
                            items[n].values = values;
                            applyMutation({
                                type: 'move',
                                from: n,
                                to: i,
                            });
                        } else {
                            items[n].values = values;
                        }
                    }
                }
            }
        },
    };
}

export interface ListSource<T> extends Subscribable<Mutation<T>> {
    add(values: T | Mutation<T>): void;
    reset(items: T[]): void;
    call(fn: (items: T[]) => any): void;
}

interface ContainerItem<T> {
    bindings: Binding[];
    scope: Disposable;
    values: T;
    key: any;
}

export interface ContainerItemContext {
    dispose(): any;
    index: () => number;
}
