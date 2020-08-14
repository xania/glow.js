import { ITemplate } from '../../lib/driver';
import { Container, ContainerSource } from '.';
import { createContainerSource } from './create-source';
import { flatTree } from './helpers';
import { State, Updatable, Expression } from 'mutabl.js/lib/observable';
import { Store, asProxy, flush } from 'mutabl.js';
import { asTemplate } from '../../lib/tpl';

type ListItemTemplate<T> = (context: State<T>) => ITemplate[];

interface ListProps<T> {
    mutations: ContainerSource<T>;
}

export function List<T>(props: ListProps<T>, _children: ListItemTemplate<T>[]) {
    const { mutations } = props;

    return Container({ mutations }, [itemTemplate]);

    function itemTemplate(values: T, index: () => number) {
        return flatTree(_children, [values, { index, dispose }]);

        function notify() {
            // flush(source);
        }

        function dispose() {
            const idx = index();
            if (idx >= 0) {
                mutations.add({
                    type: 'remove',
                    values,
                });
            }
        }
    }
}
