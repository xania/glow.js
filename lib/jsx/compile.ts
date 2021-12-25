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
import { Expression, ExpressionType } from './expression';
import flatten from './flatten';
import { DomOperation, DomOperationType } from './dom-operation';

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
  const operationsMap = createLookup<Node, DomOperation>();

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
        operationsMap.add(target, {
          type: DomOperationType.Renderable,
          renderable: template.renderer,
        });
        break;
      case TemplateType.Subscribable:
        const asyncNode = document.createTextNode('');
        target.appendChild(asyncNode);
        operationsMap.add(asyncNode, {
          type: DomOperationType.Renderable,
          renderable: {
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
          },
        });
        break;
      case TemplateType.Context:
        const contextNode = document.createTextNode('');
        target.appendChild(contextNode);
        operationsMap.add(target, {
          type: DomOperationType.Renderable,
          renderable: createFunctionRenderer(template.func),
        });
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

      const operations = cust.operations;

      if (children.length || operations.length) {
        customizations.set(cust.node, cust);

        if (
          children.length === 1 &&
          children[0].node.nodeType === Node.TEXT_NODE &&
          children[0].operations.length === 1 &&
          children[0].operations[0].type === DomOperationType.SetTextContent
        ) {
          const child = children[0];
          child.node.remove();
          operations.push(child.operations[0]);
        } else if (children.length) {
          let prevIndex = -1;

          for (const child of children) {
            if (child.operations.length) {
              const { index } = child;
              if (index === 0) {
                operations.push({
                  type: DomOperationType.PushFirstChild,
                });
              } else if (index === prevIndex + 1) {
                operations.pop();
                operations.push({
                  type: DomOperationType.PushNextSibling,
                });
              } else {
                operations.push({
                  type: DomOperationType.PushChild,
                  index,
                });
              }
              operations.push(...child.operations);
              operations.push({ type: DomOperationType.PopNode });
              prevIndex = index;
            }
          }
        }
      }
    }

    return new CompileResult(
      rootNodes,
      rootNodes
        .map((x) => customizations.get(x))
        .filter((x) => x?.operations?.length) as NodeCustomization[]
    );

    function createNodeCustomization(
      node: ChildNode,
      index: number
    ): NodeCustomization {
      return { node, index, operations: operationsMap.get(node) || [] };
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
    operationsMap.add(target, {
      type: DomOperationType.SetTextContent,
      expression: expr,
    });
  }

  function setAttribute(elt: Element, name: string, value: any): void {
    if (!value) return;

    if (value.type === TemplateType.Expression) {
      operationsMap.add(elt, {
        type: DomOperationType.SetAttribute,
        name,
        expression: value.expression,
      });
    } else if (isSubscribable(value)) {
      operationsMap.add(elt, {
        type: DomOperationType.Renderable,
        renderable: {
          render(ctx) {
            bind(ctx.target, value);
          },
        },
      });
    } else if (typeof value === 'function') {
      const func = value;
      operationsMap.add(elt, {
        type: DomOperationType.Renderable,
        renderable: {
          render(ctx, args) {
            const value = func(args);

            if (isSubscribable(value)) {
              bind(ctx.target, value);
            } else {
              ctx.target.setAttribute(name, value);
            }
          },
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
    private customizations: (NodeCustomization | undefined)[] = []
  ) {}

  renderStack: ChildNode[] = [];

  render(
    rootTarget: RenderTarget,
    items: ArrayLike<any>,
    start: number = 0,
    count: number = (items.length - start) | 0
  ) {
    const { templateNodes, customizations } = this;
    const rootLength = templateNodes.length | 0;

    const end = (start + count) | 0;
    let renderResultsLength = 0;
    const renderResults: RenderResult[] = new Array(count);
    const { renderStack } = this;

    for (let n = start; n < end; n = (n + 1) | 0) {
      const values = items[n];

      const renderResult: RenderResult = new Array(rootLength);
      for (let i = 0; i < rootLength; i = (i + 1) | 0) {
        const rootNode = templateNodes[i].cloneNode(true) as ChildNode;
        rootTarget.appendChild(rootNode);
        renderResult[i] = rootNode;

        renderResults[renderResultsLength++] = renderResult;

        const cust = customizations[i];
        if (!cust) continue;

        renderStack[0] = rootNode;
        let stackLength = 1;
        const operations = cust.operations;
        for (let n = 0, len = operations.length | 0; n < len; n = (n + 1) | 0) {
          const operation = operations[n];
          const curr = renderStack[stackLength - 1];
          switch (operation.type) {
            case DomOperationType.PushChild:
              renderStack[stackLength++] = curr.childNodes[operation.index];
              break;
            case DomOperationType.PushFirstChild:
              renderStack[stackLength++] = curr.firstChild as ChildNode;
              break;
            case DomOperationType.PushNextSibling:
              renderStack[stackLength++] = curr.nextSibling as ChildNode;
              break;
            case DomOperationType.PopNode:
              stackLength--;
              break;
            case DomOperationType.SetTextContent:
              if (values) {
                const textContentExpr = operation.expression;
                switch (textContentExpr.type) {
                  case ExpressionType.Property:
                    const value = values[textContentExpr.name];
                    if (value) {
                      if ('subscribe' in value) {
                        const subsr = value.subscribe({
                          next(v: any) {
                            curr.textContent = v;
                          },
                        });
                        renderResult.push(subsr);
                      } else {
                        curr.textContent = value;
                      }
                    }

                    break;
                }
              }
              break;
            default:
              break;
          }
        }
      }
      //   const { operations } = cus;
      //   // if (renderers) {
      //   //   let { length } = renderers;
      //   //   if (length | 0) {
      //   //     const driver = { target };
      //   //     const renderContext = {
      //   //       values,
      //   //       remove() {
      //   //         console.log(12345678);
      //   //       },
      //   //     };
      //   //     while (length--) {
      //   //       const renderer = renderers[length];
      //   //       renderResults[renderResultsLength++] = renderer.render(
      //   //         driver,
      //   //         renderContext
      //   //       );
      //   //     }
      //   //   }
      //   // }

      //   if (values) {
      //     // if (textContentExpr && values) {
      //     //   switch (textContentExpr.type) {
      //     //     case ExpressionType.Property:
      //     //       target.textContent = values[textContentExpr.name];
      //     //       break;
      //     //   }
      //     // }
      //     // if (attrExpressions) {
      //     //   let length = attrExpressions.length | 0;
      //     //   while (length) {
      //     //     length = (length - 1) | 0;
      //     //     const { name, expression } = attrExpressions[length];
      //     //     switch (expression.type) {
      //     //       case ExpressionType.Property:
      //     //         const attrValue = values[expression.name];
      //     //         if (attrValue)
      //     //           (target as Element).setAttribute(name, attrValue);
      //     //         break;
      //     //     }
      //     //   }
      //     // }
      //   }
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
  node: ChildNode;
  operations: DomOperation[];
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
