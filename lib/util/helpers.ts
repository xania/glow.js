import * as Rx from 'rxjs';

interface Updatable {
  update(value: any): boolean;
}

export function isUpdatable(binding: any): binding is Updatable {
  if (binding === null) return false;
  if (typeof binding !== 'object') return false;

  return typeof binding.update === 'function';
}

export function isNextObserver(binding: any): binding is Rx.NextObserver<any> {
  if (binding === null) return false;
  if (typeof binding !== 'object') return false;

  return typeof binding.next === 'function';
}
