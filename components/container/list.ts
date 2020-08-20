import { ITemplate } from '../../lib/driver';
import { Container, ContainerSource } from '.';
import { flatTree } from './helpers';
import { State, Updatable, Expression } from 'mutabl.js/lib/observable';

type ListItemTemplate<T> = (context: State<T>) => ITemplate[];

interface ListProps<T> {
    mutations: ContainerSource<T>;
}

export function List<T>(props: ListProps<T>, _children: ListItemTemplate<T>[]) {
    const { mutations } = props;

    return Container({ mutations }, [itemTemplate]);

    function itemTemplate(values: T, key, index: () => number) {
        return flatTree(_children, [values, { key, index, dispose }]);

        function dispose() {
            const idx = index();
            if (idx >= 0) {
                mutations.add({
                    type: 'remove',
                    key,
                });
            }
        }
    }
}
