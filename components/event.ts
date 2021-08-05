import { IDriver } from '../lib/driver';

interface EventProps {
    callback: (e) => any;
}
export function Event(props: EventProps & { name: string }) {
    const { name, callback } = props;

    return {
        render(driver: IDriver) {
            return driver.createEvent(name, callback);
        },
    };
}

function createEvent(name: string, callback: EventProps['callback']) {
    return Event({ name, callback });
}

export const Click = (props: EventProps) =>
    createEvent('click', props.callback);
export const Blur = (props: EventProps) => createEvent('click', props.callback);
export const KeyUp = (props: EventProps) =>
    createEvent('click', props.callback);
export const MouseEnter = (props: EventProps) =>
    createEvent('click', props.callback);
export const Focus = (props: EventProps) =>
    createEvent('click', props.callback);
export const MouseLeave = (props: EventProps) =>
    createEvent('click', props.callback);
