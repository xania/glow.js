import {
  ITemplate,
  IDriver,
  Binding,
  BindingValue,
  isSubscribable,
} from '../lib/driver';
import {
  asTemplate,
  FragmentTemplate,
  EmptyTemplate,
  renderMany,
  flatTree,
} from '../lib/tpl';
import * as Rx from '../lib/util/rxjs';

export function If(
  props: { condition: BindingValue<boolean> },
  children: ITemplate[]
) {
  if (isSubscribable(props.condition)) {
    return new ConditionalTemplate(
      props.condition,
      flatTree(children, asTemplate)
    );
  } else {
    if (props.condition) return new FragmentTemplate(children);
    else return new EmptyTemplate();
  }
}

class ConditionalTemplate implements ITemplate {
  constructor(
    public expr: Rx.Subscribable<boolean>,
    public _children: ITemplate[]
  ) {}

  render(driver: IDriver): Binding {
    const scope = driver.createScope();
    let inner: Binding[] | null = null;
    const self = this;
    var subscr = self.expr.subscribe({
      next: (visible) => {
        const { _children } = self;
        if (visible) {
          inner = inner || renderMany(scope, _children);
        } else if (inner) {
          for (const b of inner) {
            if (b.dispose) {
              b.dispose();
            }
          }
          inner = null;
        }
      },
    });

    return {
      driver() {
        return scope;
      },
      dispose() {
        if (subscr && typeof subscr.unsubscribe === 'function')
          subscr.unsubscribe();
        scope.dispose();
      },
    };
  }
}
