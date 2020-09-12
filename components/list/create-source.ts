import * as Rx from 'rxjs';
import * as Ro from 'rxjs/operators';
import { ListSource, Mutation, peek } from './index';

export function createListSource<T, K>(
    snapshot: T[],
    keySelector: (t: T) => K
    //     updatable: Expression<T[]> & Updatable<T[]>
): ListSource<T> {
    const mutations = new Rx.Subject<Mutation<T>>();

    return {
        peek(fn: (items: T[]) => any) {
            applyMutation(peek(fn));
        },
        reset(items: T[]) {
            applyMutation(resetMutation(items));
        },
        add(values: T | Mutation<T>) {
            if (isMutation(values)) {
                applyMutation(values);
            } else {
                applyMutation({
                    type: 'push',
                    values,
                    key: keySelector(values),
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
        // if (mut.type === 'insert') {
        //     const { index, values } = mut;
        //     snapshot.splice(index, 0, values);
        // } else if (mut.type === 'push') {
        //     const { values } = mut;
        //     snapshot.push(values);
        // } else if (mut.type === 'remove') {
        //     const { key } = mut;
        //     const index = snapshot.indexOf(values);
        //     if (index >= 0) {
        //         snapshot.splice(index, 1);
        //     }
        // } else if (mut.type === 'move') {
        //     const { from, to } = mut;
        //     const tmp = snapshot[from];
        //     snapshot[from] = snapshot[to];
        //     snapshot[to] = tmp;
        // }
        mutations.next(mut);
    }

    function resetMutation(items: T[]): Mutation<T> {
        return {
            type: 'reset',
            items: items.map((x) => {
                return {
                    values: x,
                    key: keySelector(x),
                };
            }),
        };
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
