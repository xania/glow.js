import { NextObserver, Unsubscribable } from '../../lib/util/rxjs';
import { ListUpdater } from './bindMutationsTo';

export interface ListSource<T> {
  value?: T[];
  subscribe?(observer: NextObserver<T[]>): Unsubscribable;
  update?: (updater: ListUpdater<T>) => boolean;
}
