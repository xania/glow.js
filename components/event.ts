import { IDriver } from '../lib/driver';

interface EventProps {
    callback: () => any;
}
export function Event(props: EventProps & { name: string }) {
    const { name, callback } = props;

    return {
        render(driver: IDriver) {
            return driver.createEvent(name, callback);
        },
    };
}

export const Click = (props: EventProps) => Event({ name: 'click', ...props });
export const Blur = (props: EventProps) => Event({ name: 'blur', ...props });
export const KeyUp = (props: EventProps) => Event({ name: 'keyup', ...props });
