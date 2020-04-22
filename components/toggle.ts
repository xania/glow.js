import { IDriver } from '../lib/driver';
import { Subscribable } from 'rxjs';

interface ToggleProps {
    value: Updatable<boolean> & Subscribable<boolean>;
    class?: string;
}

export default function Toggle(props: ToggleProps) {
    const { value, class: className } = props;

    return {
        render(driver: IDriver) {
            if (typeof className === 'string' && className) {
                const binding = driver.createAttribute('class', undefined);
                return [
                    driver.createEvent('click', () => value.update((e) => !e)),
                    value.subscribe((e) => binding.next(!!e && className)),
                    binding,
                ];
            } else
                return driver.createEvent('click', () =>
                    value.update((e) => !e)
                );
        },
    };
}

type Updater<T> = (a: T) => T;
interface Updatable<T> {
    update(value: Updater<T>): boolean;
}
