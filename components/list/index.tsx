import { createList } from './create-list';
import { ListSource } from './list-source';

export interface ListProps<T> {
  source: ListSource<T> | T[];
}

export function List<T>(props: ListProps<T>, children: any) {
  const { source } = props;
  if (Array.isArray(source)) {
    return createList({
      value: source,
    }).map(children);
  } else {
    return createList(source).map(children);
  }
}

export * from './create-list';
export * from './list-item';
export * from './list-source';
export * from './list-mutation';
