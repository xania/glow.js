import { ITemplate, IDriver, Binding, disposeMany } from '../../lib/driver';
import { renderStack } from '../../lib/tpl';
import { flatTree } from './helpers';
import * as M from '../../../mutabl.js';
import { asProxy, isExpression, Value } from '../../../mutabl.js';

type Disposable = { dispose(): any };

type ItemTemplate<T> = (key, values: T, index: () => number) => ITemplate[];
interface ListProps<T> {
    source: M.ListSource<T> | T[];
}
export function List<T>(props: ListProps<T>, _children: ItemTemplate<T>[]) {
    const { source } = props;

    function itemTemplate(values: T, key, index: () => number) {
        return flatTree(_children, [
            isExpression(values) ? asProxy(values) : values,
            { key, index, dispose },
        ]);

        function dispose() {
            const idx = index();
            if (idx >= 0) {
                if (Array.isArray(source)) {
                    source.splice(idx, 1);
                } else {
                    source.add({
                        type: 'remove',
                        predicate: x => x == values,
                    });
                }
            }
        }
    }

    return {
        render(driver: IDriver) {
            const items: ContainerItem<T>[] = [];
            const { source } = props;
            const rootScope = driver.createScope();
            const disposable = {
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
            };

            if (Array.isArray(source)) {
                for (let i = 0; i < source.length; i++) {
                    applyMutation({
                        type: 'insert',
                        index: i,
                        values: source[i],
                    });
                }
                return disposable;
            } else {
                return [source.subscribe(applyMutation), disposable];
            }

            function applyMutation(m: M.ListMutation<T>) {
                if (m.type === 'push') {
                    const { values } = m;
                    applyInsert(values, items.length);
                } else if (m.type === 'insert') {
                    const { values, index } = m;
                    applyInsert(values, index);
                } else if (m.type === 'remove') {
                    const idx =
                        typeof m.predicate === 'number'
                            ? m.predicate
                            : items.findIndex(containerPredicate(m.predicate));
                    // const idx = items.findIndex((ci) => m.predicate(ci.values));
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
                    const tmp = items[m.from];
                    items[m.from] = items[m.to];
                    items[m.to] = tmp;
                } else {
                    console.error('not a mutation ', m);
                }

                function applyInsert(values: T, idx: number) {
                    const itemScope = rootScope.createScope(idx);
                    const item: ContainerItem<T> = {
                        scope: itemScope,
                        values,
                        bindings: renderStack(
                            flatTree([itemTemplate], [values, index])
                                .map(template => ({
                                    driver: itemScope,
                                    template,
                                }))
                                .reverse()
                        ),
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

                function applyReset(newItems: T[]) {
                    for (let i = 0; i < items.length; i++) {
                        // for (const snap of items) {
                        const snap = items[i];
                        const { values, scope, bindings } = snap;
                        if (values) {
                            const idx = newItems.findIndex(
                                x => x === snap.values
                            );
                            if (idx < 0) {
                                scope.dispose();
                                disposeMany(bindings);
                                items.splice(i, 1);
                                i--;
                            }
                        }
                    }
                    for (let i = 0; i < newItems.length; i++) {
                        const values = newItems[i];
                        const index = items.findIndex(
                            ci => ci.values === values
                        );
                        if (index < 0) {
                            applyMutation({
                                type: 'insert',
                                index: i,
                                values,
                            });
                        } else if (index != i) {
                            // items[n].update(values);
                            applyMutation({
                                type: 'move',
                                from: index,
                                to: i,
                            });
                        } else {
                            // items[n].update(values);
                        }
                    }
                }
            }
        },
    };
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

function containerPredicate<T>(filter: (t: T) => boolean) {
    return (ci: ContainerItem<T>) => filter(ci.values);
}
