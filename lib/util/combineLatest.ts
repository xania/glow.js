import { Subscribable, PartialObserver, Unsubscribable } from 'rxjs';

type Action<T> = (value: T) => void;
type ExpressionType<T> = T extends Subscribable<infer U> ? U : T;
export type UnpackSubscribables<T> = {
  [K in keyof T]:
    | Exclude<T[K], Subscribable<any>>
    | ExpressionType<Extract<T[K], Subscribable<any>>>;
};

export function combineLatest<T extends any[]>(expressions: T) {
  type U = UnpackSubscribables<T>;
  return {
    subscribe(observer: PartialObserver<U> | Action<U>) {
      const state = new Array(expressions.length) as U;
      const subscriptions: Unsubscribable[] = [];

      for (let i = 0; i < expressions.length; i++) {
        const expr = expressions[i];
        if (isSubscribable(expr)) {
          const subscr = expr.subscribe({
            next: (v) => {
              if (state[i] !== v) {
                state[i] = v;
                emit();
              }
            },
          });
          subscriptions.push(subscr);
        } else {
          state[i] = expr;
        }
      }
      emit();

      function emit() {
        if (typeof observer === 'function') observer(state);
        else if (observer.next) observer.next(state);
      }

      return {
        unsubscribe() {
          for (let i = 0; i < subscriptions.length; i++) {
            subscriptions[i].unsubscribe();
          }
        },
      };
    },
  };
}

export function isSubscribable(o: any): o is Subscribable<unknown> {
  if (o === null || typeof o !== 'object') return false;

  if (typeof o.subscribe !== 'function') return false;

  return true;
}
