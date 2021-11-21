import { createList } from '..';
import { ListSource } from './list-source';

export interface ListProps<T> {
  source: ListSource<T> | T[];
}

export function List<T>(props: ListProps<T>, children) {
  const { source } = props;
  if (Array.isArray(source)) {
    return createList({
      value: source,
    }).map(children);
  } else {
    return createList(source).map(children);
  }
}
