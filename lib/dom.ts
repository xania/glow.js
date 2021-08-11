import {
  IDriver,
  Primitive,
  Executable,
  TextElement,
  children,
  Parent,
  Component,
  referenceNode,
  Binding,
} from './driver';
import { combineLatest } from './util/combineLatest';

const __emptyBinding = { dispose() {} };
export class DomDriver implements IDriver {
  public target: HTMLElement;
  public domElements: Node[] = [];
  private events: { eventName: string; eventBinding: any; dom: any }[] = [];
  [children]: Component[] = [];

  constructor(target: string | HTMLElement) {
    const dom =
      typeof target === 'string'
        ? (document.querySelector(target) as HTMLElement)
        : target;
    if (!dom) {
      throw Error('target element is required');
    }
    this.target = dom;
  }

  bind<R>(binder: (dom: HTMLElement) => R): R {
    return binder(this.target);
  }

  createDriver(node: HTMLElement): IDriver {
    return new DomDriver(node);
  }

  createScope(idx?: number): IDriver {
    // const commentNode = document.createComment(`--- ${name} ---`);
    // this.target.appendChild(commentNode);

    const scope = createScope(this, this);
    if (typeof idx === 'number') {
      this[children].splice(idx, 0, scope);
    } else {
      this[children].push(scope);
    }
    return scope;
  }

  createEvent(name: string, value: Function | Executable<any>) {
    if (!value) return __emptyBinding;

    const { target } = this;

    if (!('on' + name.toLocaleLowerCase() in target)) {
      return null;
    }

    target.addEventListener(name, eventHandler);

    return {
      dispose() {
        target.removeEventListener(name, eventHandler);
      },
    };

    function eventHandler(evt: Event) {
      if (typeof value === 'function') {
        value(evt);
      } else {
        value.execute(evt);
      }
    }
  }

  appendChild(child: any) {
    const _children = this[children];
    const scope = this;
    if (Array.isArray(_children)) {
      const component = {
        insertBefore(node: Node) {
          scope.target.insertBefore(node, child);
        },
        dispose() {
          child.dispose();
          removeComponent(scope, component);
        },
      };
      _children.push(component);
      this.target.appendChild(child);
    } else {
      console.warn('ignore child, driver is disposed.');
    }
  }

  createElement(name: string, init: (dom: HTMLElement) => void) {
    const tagNode = createDOMElement(this.target, name) as HTMLElement;
    this.appendChild(tagNode);
    const driver = this.createDriver(tagNode);

    return {
      ready() {
        init && init(tagNode);
      },
      driver() {
        return driver;
      },
      dispose() {
        tagNode.remove();
      },
    };
  }

  // insertAt(tagNode, index, anchorNode) {
  //     insertNodeAt(this, this.domElements, anchorNode, tagNode, index);
  // }

  createNative(value: Primitive | HTMLElement) {
    const node = isDomNode(value)
      ? value
      : document.createTextNode(value as string);
    this.appendChild(node);

    return {
      next(value: unknown) {
        node.nodeValue = value as string;
      },
      dispose() {
        return node.remove();
      },
    };
  }

  createAttribute(name: string, value: Primitive) {
    return createAttribute(this.target, name, value);
  }

  findEventBinding(target: Node | null, eventName: string) {
    var events = this.events;
    let node = target;
    while (node) {
      var e = events.length;
      while (e--) {
        var ev = events[e];
        if (ev.dom === node && ev.eventName === eventName) {
          return ev.eventBinding;
        }
      }
      node = node.parentNode;
    }
    return null;
  }

  on(eventName: string, dom: HTMLElement, eventBinding: Binding) {
    var events = this.events,
      i = events.length,
      eventBound = false;

    while (i--) {
      var ev = events[i];
      if (ev.eventName === eventName) {
        if (ev.dom === dom) return ev;
        else {
          eventBound = true;
          break;
        }
      }
    }

    if (!eventBound) {
      this.target.addEventListener(eventName, (event) => {
        const { target } = event;
        if (target) {
          var eventBinding = this.findEventBinding(target as Node, eventName);
          if (eventBinding) {
            eventBinding.fire(event);
            event.preventDefault();
          }
        }
      });
    }

    var entry = {
      eventName,
      dom,
      eventBinding,
      dispose() {
        var idx = events.indexOf(this);
        if (idx >= 0) {
          events.splice(idx, 1);
          return true;
        }
        return false;
      },
    };
    this.events.push(entry);
    return entry;
  }

  insert(_: unknown, dom: Node, idx: number) {
    var domElements = this.domElements;
    var target = this.target;

    var curIdx = domElements.indexOf(dom);
    if (idx !== curIdx) {
      var childNodes = target.childNodes;
      if (idx < childNodes.length) {
        var current = childNodes[idx];
        if (current !== dom) {
          target.insertBefore(dom, current);
        }
      } else {
        this.appendChild(dom);
      }
      var length = childNodes.length;
      domElements.length = length;
      for (let i = 0; i < length; i++) {
        domElements[i] = childNodes[i];
      }
      return true;
    }
    return false;
  }

  dispose() {
    var domElements = this.domElements,
      i = domElements.length;
    while (i--) {
      const a = domElements[i] as Element;
      if (a.remove) {
        a.remove();
      }
    }

    delete this[children];
  }
}

function createScope(root: DomDriver, parent: Parent) {
  const attributes = [];
  const scope = {
    [children]: [] as Component[],
    get target() {
      return root.target;
    },
    createEvent() {
      throw new Error('create Event is not (yet) supported');
    },
    createAttribute(name: string, value: Primitive | Primitive[]) {
      const binding = createAttribute(root.target, name, value);
      attributes.push(binding);
      return binding;
    },
    bind<R>(binder: (dom: HTMLElement) => R): R {
      return root.bind(binder);
    },
    createElement(name: string, init: any) {
      const tagNode = createDOMElement(root.target, name) as HTMLElement;
      appendChild(tagNode);

      const component = {
        tagNode,
        insertBefore(node: Node) {
          root.target.insertBefore(node, tagNode);
        },
        dispose() {
          tagNode.remove();
        },
      };
      addComponent(component);
      const binding = {
        ready() {
          init && init(tagNode);
        },
        driver() {
          return root.createDriver(tagNode);
        },
        dispose() {
          tagNode.remove();
          removeComponent(scope, component);
        },
      };
      return binding;
    },
    createNative(value: Primitive): TextElement {
      const textNode = document.createTextNode(value as string);
      appendChild(textNode);
      const component = {
        textNode,
        insertBefore(node: Node) {
          root.target.insertBefore(node, textNode);
        },
        dispose() {
          textNode.remove();
        },
      };
      addComponent(component);

      const binding = {
        next(value: string) {
          textNode.nodeValue = value;
        },
        dispose() {
          textNode.remove();
          removeComponent(scope, component);
        },
      };
      return binding;
    },
    createScope(idx?: number) {
      // const comment = document.createComment(`-- ${name} --`);
      // scope.appendChild(comment);
      const subscope = createScope(root, scope);
      if (typeof idx === 'number') {
        scope[children].splice(idx, 0, subscope);
      } else {
        scope[children].push(subscope);
      }
      return subscope;
    },
    dispose() {
      removeComponent(parent, scope);
      // deliberately use the children array instance instead of cloning it.
      // disposeChildren(scope[children]);
      delete scope[children]; // mark as disposed
    },
  };

  function appendChild(node: Comment | HTMLElement) {
    const refNode = referenceNode(root, scope);
    if (refNode) {
      refNode.insertBefore(node);
    } else root.target.appendChild(node);
  }

  function addComponent(component: Component) {
    const _children = scope[children];
    if (Array.isArray(_children)) {
      _children.push(component);
      return true;
    } else {
      console.warn(
        'appending child is skipped because scope is disposed already.'
      );
      return false;
    }
  }
  return scope;
}

function removeComponent(scope: Parent, node: Component) {
  const _children = scope[children];
  if (!Array.isArray(_children)) {
    return;
  }

  const idx = _children.indexOf(node);
  if (idx >= 0) {
    _children.splice(idx, 1);
  }
}

function createAttribute(
  target: HTMLElement,
  name: string,
  value: Primitive | Primitive[]
) {
  var prevValues: string[] = [];
  if (name === 'disabled') {
    isDisabled(target, value);
    return {
      target,
      next: (value: any) => isDisabled(target, value),
      dispose() {
        isDisabled(target, false);
      },
    };
  } else if (name === 'class') {
    const subscr = combineLatest(
      Array.isArray(value) ? value : [value]
    ).subscribe(className);
    return {
      target,
      next: className,
      dispose() {
        subscr.unsubscribe();
        prevValues.forEach((cl) => cl && target.classList.remove(cl));
      },
    };
  } else if (name === 'value') {
    valueAttribute(toString(value));
    return {
      next: valueAttribute,
      dispose() {
        target.removeAttribute(name);
      },
    };
  } else {
    defaultAttribute(toString(value));
    return {
      next: defaultAttribute,
      dispose() {
        target.removeAttribute(name);
      },
    };
  }

  function className(value: any) {
    const nextValues = [];

    const stack = [value];
    while (stack.length) {
      const curr = stack.pop();
      if (curr === null || curr === undefined) continue;

      if (Array.isArray(curr)) {
        for (var i = 0; i < curr.length; i++) {
          stack.push(curr[i]);
        }
      } else if (typeof curr === 'string') {
        const split = curr.split(' ');
        for (var i = 0; i < split.length; i++) {
          const cl = split[i];
          if (cl) nextValues.push(cl);
        }
      } else {
        const split = curr.toString().split(' ');
        for (var i = 0; i < split.length; i++) {
          const cl = split[i];
          if (cl) nextValues.push(cl);
        }
      }
    }

    prevValues.forEach((cl) => target.classList.remove(cl));
    nextValues.forEach((cl) => target.classList.add(cl));
    prevValues = nextValues;
  }

  function valueAttribute(value: string) {
    if (isInputElement(target)) {
      if (value === null || value === undefined) {
        target.value = '';
      } else if (target.type === 'date') {
        var d = new Date(value);
        // ensure GMT timezone
        // https://austinfrance.wordpress.com/2012/07/09/html5-date-input-field-and-valueasdate-timezone-gotcha-3/
        target.valueAsDate = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          12
        );
      } else target.value = value;

      return true;
    } else {
      return defaultAttribute(value);
    }
  }

  function defaultAttribute(value: string) {
    if (value === void 0 || value === null) {
      target.removeAttribute(name);
    } else {
      var attr = document.createAttributeNS(null, name);
      attr.value = value;
      target.setAttributeNode(attr);
    }
  }
}

function getNamespaceURI(target: HTMLElement, name: string) {
  return name === 'svg'
    ? 'http://www.w3.org/2000/svg'
    : target
    ? target.namespaceURI
    : null;
}
function createDOMElement(target: HTMLElement, name: string) {
  const namespaceURI = getNamespaceURI(target, name);
  const tagNode = document.createElementNS(namespaceURI, name);

  return tagNode;
}

function toString(value: any) {
  if (value === null || typeof value === 'undefined') return value;

  if (typeof value === 'string' || typeof value === 'boolean') return value;

  return value.toString();
}

export function isDomNode(obj: any): obj is HTMLElement {
  try {
    //Using W3 DOM2 (works for FF, Opera and Chrome)
    return obj instanceof HTMLElement;
  } catch (e) {
    //Browsers not supporting W3 DOM2 don't have HTMLElement and
    //an exception is thrown and we end up here. Testing some
    //properties that all elements have (works on IE7)
    return (
      typeof obj === 'object' &&
      obj.nodeType === 1 &&
      typeof obj.style === 'object' &&
      typeof obj.ownerDocument === 'object'
    );
  }
}

function isInputElement(elt: any): elt is HTMLInputElement {
  return elt && 'value' in elt && 'type' in elt;
}

function isDisabled(target: HTMLElement, value: any) {
  if (isInputElement(target)) {
    target.disabled = !!value;
  }
}
