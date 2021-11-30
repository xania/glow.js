import { NextObserver, Unsubscribable } from '../../lib/util/rxjs';

export type ListMutation<T = unknown> =
  | PushItem<T>
  | MoveItem
  | RemoveItem<T>
  | RemoveItemAt
  | InsertItem<T>
  | ResetItems<T>
  | ClearItems;

export enum ListMutationType {
  PUSH = 0,
  MOVE = 1,
  REMOVE = 2,
  INSERT = 3,
  RESET = 4,
  CLEAR = 5,
}

interface PushItem<T> {
  type: ListMutationType.PUSH;
  values: T;
}

interface MoveItem {
  type: ListMutationType.MOVE;
  from: number;
  to: number;
}

interface RemoveItem<T> {
  type: ListMutationType.REMOVE;
  predicate(t: T): boolean;
}

interface RemoveItemAt {
  type: ListMutationType.REMOVE;
  index: number;
}

interface InsertItem<T> {
  type: ListMutationType.INSERT;
  values: T;
  index: number;
}

interface ResetItems<T> {
  type: ListMutationType.RESET;
  items: T[];
}

interface ClearItems {
  type: ListMutationType.CLEAR;
}

export function pushItem<T>(values: T): PushItem<T> {
  return {
    type: ListMutationType.PUSH,
    values,
  };
}
export function insertItem<T>(values: T, index: number): InsertItem<T> {
  return {
    type: ListMutationType.INSERT,
    values,
    index,
  };
}

export function removeItem<T>(
  predicateOrIndex: number | ((t: T) => boolean)
): RemoveItem<T> | RemoveItemAt {
  if (typeof predicateOrIndex === 'function')
    return {
      type: ListMutationType.REMOVE,
      predicate: predicateOrIndex,
    };

  return {
    type: ListMutationType.REMOVE,
    index: predicateOrIndex,
  };
}

export function resetItems<T>(items: T[]): ResetItems<T> {
  return {
    type: ListMutationType.RESET,
    items,
  };
}

type Prop<T, K extends keyof T> = T[K];

export function isMutation<T = unknown>(mut: any): mut is ListMutation<T> {
  if (!mut) {
    return false;
  }
  const type: Prop<ListMutation, 'type'> = mut.type;
  debugger;
  return type in ListMutationType;
}

export class ListMutationManager<T> {
  private mutationObservers: NextObserver<ListMutation<T>>[] = [];

  pushMutation = (mut: ListMutation<T>) => {
    if (!mut) return;
    const { mutationObservers } = this;
    let { length } = mutationObservers;
    while (length--) {
      const observer = mutationObservers[length];
      if (observer.next) {
        observer.next(mut);
      }
    }
  };

  subscribe = (observer: NextObserver<ListMutation<T>>): Unsubscribable => {
    if (!observer) {
      return EMPTY;
    }
    if (typeof observer.next !== 'function') return EMPTY;

    const { mutationObservers } = this;
    mutationObservers.push(observer);
    return {
      unsubscribe() {
        const idx = mutationObservers.indexOf(observer);
        if (idx >= 0) {
          mutationObservers.splice(idx, 1);
        }
      },
    };
  };
}

const EMPTY: Unsubscribable = {
  unsubscribe() {},
};
