import { IDriver } from '../lib/driver';
import { Subscribable } from 'rxjs';

interface CssProps {
    value: string;
    when?: Subscribable<boolean>;
}

export default function Css(props: CssProps) {
    return {
        render(driver: IDriver) {
            const { when, value } = props;
            if (when && typeof when.subscribe === 'function') {
                const binding = driver.createAttribute('class', undefined);

                when.subscribe((e) => {
                    if (e) binding.next(value);
                    else binding.next([]);
                });

                return binding;
            } else {
                return driver.createAttribute('class', value);
            }
        },
    };
}
