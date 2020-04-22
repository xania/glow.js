import { ITemplate } from '../../lib/driver';
import { asTemplate } from '../../lib/tpl';

export function flatTree<T>(source: Tree<T>, args: any[]): ITemplate[] {
    const stack: Tree<T> = [source];
    const result: ITemplate[] = [];

    while (stack.length > 0) {
        const curr = stack.pop();
        if (window.Array.isArray(curr)) {
            for (let i = curr.length - 1; i >= 0; i--) {
                stack.push(curr[i]);
            }
        } else if (typeof curr === 'function') {
            const fn: any = curr;
            const retval = fn.apply(null, args);
            stack.push(retval);
        } else {
            result.push(asTemplate(curr) as ITemplate);
        }
    }

    return result;
}

type Func<T> = (...args: any[]) => Tree<T>;
type Tree<T> = T | Func<T> | Tree<T>[];
// type Tree<T> = T | [ Tree | Tree[] ]

// console.log(elements);
