export interface NextObserver<T> {
  next(value: T): void;
}

export interface Unsubscribable {
  unsubscribe(): void;
}

export interface Subscribable<T> {
  subscribe(observer: Partial<Observer<T>>): Unsubscribable;
}

export interface Observer<T> {
  next: (value: T) => void;
  error: (err: any) => void;
  complete: () => void;
}
