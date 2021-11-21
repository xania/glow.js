import { ListMutation, ListMutationType } from './list-mutation';

export type ListUpdater<T> = (items: T[]) => T[] | void;
type Target<T> = { update?: (updater: ListUpdater<T>) => boolean };
export function bindMutationsTo<T>(target: Target<T>) {
  if (typeof target.update !== 'function') return null;
  return {
    next(mut: ListMutation<T>) {
      target.update((items) => {
        if (mut.type === ListMutationType.REMOVE) {
          if ('index' in mut) {
            items.splice(mut.index, 1);
          }
        } else if (mut.type === ListMutationType.PUSH) {
          const { values } = mut;
          if (Array.isArray(items)) {
            items.push(values);
          } else {
            return [values];
          }
        }

        return items;
      });
    },
  };
}
