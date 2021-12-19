import {
  AttributeType,
  TemplateType,
  Template,
  Renderable,
  RenderResult,
} from './template';
import { createDOMElement } from './render';
import { isSubscribable } from '../driver';
import { Subscribable } from '../util/rxjs';
import { Expression } from './expression';
import flatten from './flatten';

export interface RenderProps {
  items: ArrayLike<unknown>;
  start: number;
  count: number;
}

interface RenderTarget {
  appendChild(node: Node): void;
}

interface AttrExpression {
  name: string;
  expression: Expression;
}

type StackItem = [Node, Template | Template[]];

export function compile(rootTemplate: Template | Template[]) {
  const renderersMap = createLookup<Node, Renderable>();
  // const eventsMap = createLookup<Node, CompilationEvent>();
  const expressionsMap = new Map<Node, Expression>();
  const attrExpressionsMap = createLookup<Node, AttrExpression>();

  const fragment = new DocumentFragment();
  const stack: StackItem[] = [[fragment, rootTemplate]];
  while (stack.length > 0) {
    const curr = stack.pop() as StackItem;
    const [target, template] = curr;

    if (Array.isArray(template)) {
      for (let i = template.length; i--; ) stack.push([target, template[i]]);
      continue;
    }

    switch (template.type) {
      case TemplateType.Tag:
        const { name, attrs, children } = template;
        const dom = createDOMElement('http://www.w3.org/1999/xhtml', name);
        target.appendChild(dom);

        if (attrs) {
          for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            if (attr.type === AttributeType.Attribute) {
              setAttribute(dom, attr.name, attr.value);
            } else {
              // eventsMap.add(dom, { name: attr.event, callback: attr.callback });
            }
          }
        }

        let { length } = children;
        while (length--) {
          stack.push([dom, children[length]]);
        }
        break;
      case TemplateType.Text:
        const textNode = document.createTextNode(template.value);
        target.appendChild(textNode);
        break;
      case TemplateType.Renderable:
        renderersMap.add(target, template.renderer);
        break;
      case TemplateType.Subscribable:
        const asyncNode = document.createTextNode('');
        target.appendChild(asyncNode);
        renderersMap.add(asyncNode, {
          render({ target }) {
            const subscr = template.value.subscribe({
              next(x) {
                target.textContent = x;
              },
            });
            return {
              dispose() {
                subscr.unsubscribe();
              },
            };
          },
        });
        break;
      case TemplateType.Context:
        const contextNode = document.createTextNode('');
        target.appendChild(contextNode);
        renderersMap.add(target, createFunctionRenderer(template.func));
        break;
      case TemplateType.Expression:
        const exprNode = document.createTextNode('');
        target.appendChild(exprNode);
        setExpression(exprNode, template.expression);
        break;
    }
  }

  return createResult();

  function createResult() {
    const rootNodes = toArray(fragment.childNodes);

    const flattened = flatten(
      rootNodes.map(createNodeCustomization),
      ({ node }) => toArray(node.childNodes).map(createNodeCustomization)
    );

    const customizations = new Map<Node, NodeCustomization>();
    // iterate in reverse to traverse nodes bottom up
    for (let i = flattened.length - 1; i >= 0; i--) {
      const cust = flattened[i];

      const children = toArray(cust.node.childNodes)
        .map((node) => customizations.get(node))
        .filter((x) => !!x) as NodeCustomization[];

      if (children.length) {
        cust.children = children;
        customizations.set(cust.node, cust);
      } else if (cust.renderers || cust.expression || cust.attrExpressions) {
        customizations.set(cust.node, cust);
      }
    }

    return new CompileResult(
      rootNodes,
      rootNodes
        .map((x) => customizations.get(x))
        .filter((x) => !!x) as NodeCustomization[]
    );

    function createNodeCustomization(
      node: Node,
      index: number
    ): NodeCustomization {
      const retval: NodeCustomization = { node, index };

      const renderers = renderersMap.get(node);
      if (renderers) retval.renderers = renderers;

      const expression = expressionsMap.get(node);
      if (expression) retval.expression = expression;

      const attrExpressions = attrExpressionsMap.get(node);
      if (attrExpressions) retval.attrExpressions = attrExpressions;

      // const children = mapNodeList(node.childNodes, (node) =>
      //   customizations.get(node)
      // ).filter((x) => !!x) as NodeCustomization[];
      // if (children.length) retval.children = children;

      return retval;
    }
  }

  function createFunctionRenderer(func: Function): Renderable {
    return {
      render({ target }: { target: Node }, context: any): RenderResult {
        const value = func(context);
        if (isSubscribable(value)) {
          const subscr = value.subscribe({
            next(x: any) {
              target.textContent = x;
            },
          });
          return {
            dispose() {
              subscr.unsubscribe();
            },
          };
        } else {
          target.textContent = value;
        }
      },
    };
  }

  function setExpression(target: Node, expr: Expression) {
    return expressionsMap.set(target, expr);
  }

  function setAttribute(elt: Element, name: string, value: any): void {
    if (!value) return;

    if (value.type === TemplateType.Expression) {
      attrExpressionsMap.add(elt, {
        name,
        expression: value.expression,
      });
    } else if (isSubscribable(value)) {
      renderersMap.add(elt, {
        render(ctx) {
          bind(ctx.target, value);
        },
      });
    } else if (typeof value === 'function') {
      const func = value;
      renderersMap.add(elt, {
        render(ctx, args) {
          const value = func(args);

          if (isSubscribable(value)) {
            bind(ctx.target, value);
          } else {
            ctx.target.setAttribute(name, value);
          }
        },
      });
    } else {
      elt.setAttribute(name, value);
    }

    function bind(target: Element, subscribable: Subscribable<any>) {
      const subscr = subscribable.subscribe({
        next(value) {
          target.setAttribute(name, value);
        },
      });

      return {
        dispose() {
          subscr.unsubscribe();
        },
      };
    }
  }
}

class CompileResult {
  constructor(
    private templateNodes: Node[],
    private customizations?: NodeCustomization[]
  ) {}

  renderStack: any[] = [];

  render(
    rootTarget: RenderTarget,
    items: ArrayLike<any>,
    start: number = 0,
    count: number = items.length - start
  ) {
    const { templateNodes, customizations } = this;
    const rootLength = +templateNodes.length;

    const end = start + count;
    const renderResults: RenderResult[] = [];
    for (let n = start; n < end; n++) {
      const values = items[n];

      const rootNodes: ChildNode[] = new Array(rootLength);
      for (let i = 0; i < rootLength; i++)
        rootNodes[i] = templateNodes[i].cloneNode(true) as ChildNode;

      if (customizations) {
        const { renderStack: stack } = this;
        let stackLength = 0;

        for (const cust of customizations) {
          const index = cust.index;
          stack[stackLength++] = rootNodes[index];
          stack[stackLength++] = cust;
        }
        while (stackLength) {
          const cus = stack[--stackLength] as NodeCustomization;
          const target = stack[--stackLength] as ChildNode;

          const { renderers, expression, children, attrExpressions } = cus;
          if (renderers) {
            let { length } = renderers;
            const driver = { target };
            while (length--) {
              const renderer = renderers[length];
              const rr = renderer.render(driver, {
                values,
                remove() {
                  console.log(12345678);
                },
              });
              renderResults.push(rr);
            }
          }

          if (values) {
            if (expression && values) {
              const { name } = expression;
              target.textContent = values[name];
            }

            if (attrExpressions) {
              let length = attrExpressions.length;
              while (length--) {
                const { name, expression } = attrExpressions[length];
                const attrValue = values[expression.name];
                if (attrValue)
                  (target as Element).setAttribute(name, attrValue);
              }
            }
          }

          if (children) {
            let childLength = +children.length;
            while (childLength--) {
              const childCust = children[childLength];
              const index = +childCust.index;
              const childNode =
                index === 0
                  ? (target.firstChild as ChildNode)
                  : index === 1
                  ? ((target.firstChild as ChildNode).nextSibling as ChildNode)
                  : target.childNodes[index];

              stack[stackLength++] = childNode;
              stack[stackLength++] = childCust;
            }
          }
        }
      }

      for (let i = 0; i < rootLength; i++) {
        rootTarget.appendChild(rootNodes[i]);
      }
      renderResults.push({
        dispose() {
          for (const root of rootNodes) {
            root.remove();
          }
        },
      });
    }
    return renderResults;
  }
}

function createLookup<K, T>() {
  const lookup = new Map<K, T[]>();
  return {
    get(key: K) {
      return lookup.get(key);
    },
    add(key: K, value: T) {
      const values = lookup.get(key);
      if (values) {
        values.push(value);
      } else {
        lookup.set(key, [value]);
      }
    },
  };
}

type VisitResult<T> = {
  value?: T;
  children?: TransformResult<T>;
};

type NodeCustomization = {
  index: number;
  node: Node;
  expression?: Expression;
  renderers?: Renderable[];
  // events?: CompilationEvent[];
  children?: NodeCustomization[];
  attrExpressions?: AttrExpression[];
};
type TransformResult<T> = {
  [i: number]: VisitResult<T>;
};

function toArray<T extends Node>(nodes: NodeListOf<T>) {
  const result: T[] = [];
  const length = nodes.length;
  for (let i = 0; i < length; i++) {
    result.push(nodes[i]);
  }
  return result;
}
