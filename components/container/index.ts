import { ITemplate, IDriver, Binding, disposeMany } from '../../lib/driver';
import { renderStack } from '../../lib/tpl';
import { flatTree } from './helpers';
import { Subscribable } from 'rxjs';

type Disposable = { dispose(): any };
export type Mutation<T = unknown> =
    | PushItem<T>
    | InsertItem<T>
    | RemoveItem
    | ResetItems<T>;
interface PushItem<T> {
    type: 'push';
    values: T;
}
interface InsertItem<T> {
    type: 'insert';
    values: T;
    index: number;
}
interface RemoveItem {
    type: 'remove';
    index: number;
}
interface ResetItems<T> {
    type: 'reset';
    items: T[];
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
            const items: ContainerItem[] = [];
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
                    const idx = m.index;
                    const item = items[idx];
                    const { scope, bindings } = item;
                    scope.dispose();
                    disposeMany(bindings);
                    items.splice(idx, 1);
                } else if (m.type === 'reset') {
                    const { items } = m;
                    for (let i = 0; i < items.length; i++) {
                        applyInsert(items[i], i);
                    }
                } else {
                    console.error('not a mutation ' + m);
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
                    const item: ContainerItem = {
                        scope: itemScope,
                        bindings,
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
}

interface ContainerItem {
    bindings: Binding[];
    scope: Disposable;
}

export interface ContainerItemContext {
    dispose(): any;
    index: () => number;
}
