import * as Rx from 'rxjs';
import * as Ro from 'rxjs/operators';
import { ContainerSource, Mutation } from './index';

export function createContainerSource<T, K>(
    snapshot: T[],
    keySelector: (t: T) => K
    //     updatable: Expression<T[]> & Updatable<T[]>
): ContainerSource<T> {
    const mutations = new Rx.Subject<Mutation<T>>();

    return {
        peek<R>(fn: (items: T[]) => R): R {
            return fn(snapshot);
        },
        reset(items: T[]) {
            const itemMap = new Map<K, T>();
            for (const item of items) {
                itemMap.set(keySelector(item), item);
            }
            const sourceMap = new Map<K, T>();
            for (const snap of Object.values(snapshot)) {
                const key = keySelector(snap);
                sourceMap.set(key, snap);
                if (!itemMap.has(key)) {
                    applyMutation({
                        type: 'remove',
                        values: snap,
                    });
                }
            }

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const n = snapshot.findIndex(
                    (src) => keySelector(src) == keySelector(item)
                );

                if (n < 0) {
                    applyMutation({
                        type: 'insert',
                        index: i,
                        values: item,
                    });
                } else if (n != i) {
                    applyMutation({
                        type: 'move',
                        from: n,
                        to: i,
                    });
                } else {
                    snapshot[i] = item;
                }
            }
        },
        add(values: T | Mutation<T>) {
            if (isMutation(values)) {
                applyMutation(values);
            } else {
                applyMutation({
                    type: 'push',
                    values,
                });
            }
        },
        subscribe(...args: any[]) {
            const result = mutations.pipe(
                Ro.startWith(resetMutation(snapshot))
            );
            return result.subscribe.apply(result, args as any);
        },
    };

    function applyMutation(mut: Mutation<T>) {
        if (mut.type === 'insert') {
            const { index, values } = mut;
            snapshot.splice(index, 0, values);
        } else if (mut.type === 'push') {
            const { values } = mut;
            snapshot.push(values);
        } else if (mut.type === 'remove') {
            const { values } = mut;
            const index = snapshot.indexOf(values);
            if (index >= 0) {
                snapshot.splice(index, 1);
            }
        } else if (mut.type === 'move') {
            const { from, to } = mut;
            const tmp = snapshot[from];
            snapshot[from] = snapshot[to];
            snapshot[to] = tmp;
        }
        mutations.next(mut);
    }

    function resetMutation(items: T[]) {
        return { type: 'reset', items };
    }
}

function isMutation(m: any): m is Mutation {
    if (!m) {
        return false;
    }
    const type: Prop<Mutation, 'type'> = m.type;
    return (
        type === 'remove' ||
        type === 'push' ||
        type === 'insert' ||
        type === 'reset'
    );
}

type Prop<T, K extends keyof T> = T[K];
