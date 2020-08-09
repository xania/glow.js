import * as Rx from 'rxjs';
import * as Ro from 'rxjs/operators';
import { ContainerSource, Mutation } from './index';

export function createContainerSource<T>(
    source: T[]
    //     updatable: Expression<T[]> & Updatable<T[]>
): ContainerSource<T> {
    const mutations = new Rx.Subject<Mutation<T>>();

    return {
        add(values: T | Mutation<T>) {
            if (isMutation(values)) {
                mutations.next(values);
            } else {
                mutations.next({
                    type: 'push',
                    values,
                });
            }
        },
        subscribe(...args: any[]) {
            const result = mutations.pipe(
                Ro.tap(applyMutation),
                Ro.startWith(resetMutation(source))
            );
            return result.subscribe.apply(result, args as any);
        },
    };

    function applyMutation(mut: Mutation<T>) {
        if (mut.type === 'push') {
            const { values } = mut;
            source.push(values);
        } else if (mut.type === 'remove') {
            const { index } = mut;
            source.splice(index, 1);
        }
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
