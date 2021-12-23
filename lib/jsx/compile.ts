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
  // const renderersMap = createLookup<Node, Renderable>();
  // const eventsMap = createLookup<Node, CompilationEvent>();
  // const expressionsMap = new Map<Node, Expression>();
  // const attrExpressionsMap = createLookup<Node, AttrExpression>();
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

    const operations: DomOperation[] = [];
    const customizations = new Map<Node, NodeCustomization>();
    // iterate in reverse to traverse nodes bottom up
    for (let i = flattened.length - 1; i >= 0; i--) {
      const cust = flattened[i];

      const children = toArray(cust.node.childNodes)
        .map((node) => customizations.get(node))
        .filter((x) => !!x) as NodeCustomization[];

      const { operations } = cust;

      if (children.length || operations.length) {
        customizations.set(cust.node, cust);

        if (children.length) {
          cust.children = children;
        }
      }
    }

    {
      /*
    // if (children.length > 0) {
    //   const first = children[0];
    //   const index = first.index;

    //   if (index === 0) {
    //     operations.push({
    //       type: DomOperationType.PushFirstChild,
    //     });
    //   } else {
    //     operations.push({
    //       type: DomOperationType.PushChild,
    //       index,
    //     });
    //   }
    //   let prev = first;

    //   for (let i = 1; i < children.length; i++) {
    //     const curr = children[i];
    //     if (curr.index === prev.index + 1) {
    //       operations.push({
    //         type: DomOperationType.PushNextSibling,
    //       });
    //     } else {
    //       operations.push({
    //         type: DomOperationType.PushChild,
    //         index: curr.index,
    //       });
    //     }
    //   }
    // }
    // operations.push({
    //   type: DomOperationType.PopNode,
    // });
    // if (textContentExpr) {
    //   operations.push({
    //     type: DomOperationType.SetTextContent,
    //     expression: textContentExpr,
    //   });
    // }
    */
    }

    for (const o of operations) {
      switch (o.type) {
        case DomOperationType.PopNode:
          console.log('pop');
          break;
        case DomOperationType.PushChild:
          console.log('push', o.index);
          break;
        case DomOperationType.PushFirstChild:
          console.log('push firstChild');
          break;
        case DomOperationType.PushNextSibling:
          console.log('push nextSibling');
          break;
        case DomOperationType.SetAttribute:
          console.log('set attribute');
          break;
        case DomOperationType.SetTextContent:
          console.log('set content', o.expression);
          break;
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
      const retval: NodeCustomization = { node, index, operations: [] };

      // const expression = expressionsMap.get(node);
      // if (expression) retval.textContentExpr = expression;

      const operations = operationsMap.get(node);
      if (operations) retval.operations = operations;

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
    private customizations: NodeCustomization[] = []
  ) {}

  renderStack: any[] = [];

  render(
    rootTarget: RenderTarget,
    items: ArrayLike<any>,
    start: number = 0,
    count: number = items.length - start
  ) {
    const { templateNodes, customizations } = this;
    const rootLength = templateNodes.length | 0;

    const end = (start + count) | 0;
    const renderResults: RenderResult[] = [];
    let renderResultsLength = 0;
    for (let n = start; n < end; n++) {
      const values = items[n];

      const rootNodes: ChildNode[] = new Array(rootLength);
      for (let i = 0; i < rootLength; i++)
        rootNodes[i] = templateNodes[i].cloneNode(true) as ChildNode;

      const { renderStack: stack } = this;
      let stackLength = 0;

      const custLength = customizations.length | 0;
      for (let i = 0; i < custLength; i = (i + 1) | 0) {
        const cust = customizations[i];
        const index = cust.index | 0;
        stack[stackLength] = rootNodes[index];
        stackLength = (stackLength + 1) | 0;
        stack[stackLength] = cust;
        stackLength = (stackLength + 1) | 0;
      }
      while (stackLength) {
        stackLength = (stackLength - 1) | 0;
        const cus = stack[stackLength] as NodeCustomization;
        stackLength = (stackLength - 1) | 0;
        const target = stack[stackLength] as ChildNode;

        const { children } = cus;
        // if (renderers) {
        //   let { length } = renderers;
        //   if (length | 0) {
        //     const driver = { target };
        //     const renderContext = {
        //       values,
        //       remove() {
        //         console.log(12345678);
        //       },
        //     };
        //     while (length--) {
        //       const renderer = renderers[length];
        //       renderResults[renderResultsLength++] = renderer.render(
        //         driver,
        //         renderContext
        //       );
        //     }
        //   }
        // }

        if (values) {
          // if (textContentExpr && values) {
          //   switch (textContentExpr.type) {
          //     case ExpressionType.Property:
          //       target.textContent = values[textContentExpr.name];
          //       break;
          //   }
          // }
          // if (attrExpressions) {
          //   let length = attrExpressions.length | 0;
          //   while (length) {
          //     length = (length - 1) | 0;
          //     const { name, expression } = attrExpressions[length];
          //     switch (expression.type) {
          //       case ExpressionType.Property:
          //         const attrValue = values[expression.name];
          //         if (attrValue)
          //           (target as Element).setAttribute(name, attrValue);
          //         break;
          //     }
          //   }
          // }
        }

        if (children) {
          let childLength = +children.length | 0;
          while (childLength) {
            childLength = (childLength - 1) | 0;
            const childCust = children[childLength];
            const index = +childCust.index | 0;
            const childNode =
              index === 0
                ? (target.firstChild as ChildNode)
                : index === 1
                ? ((target.firstChild as ChildNode).nextSibling as ChildNode)
                : target.childNodes[index];

            stack[stackLength] = childNode;
            stackLength = (stackLength + 1) | 0;
            stack[stackLength] = childCust;
            stackLength = (stackLength + 1) | 0;
          }
        }
      }

      for (let i = 0; i < rootLength; i = (i + 1) | 0) {
        rootTarget.appendChild(rootNodes[i]);
      }
      renderResults[renderResultsLength++] = {
        dispose() {
          let length = rootNodes.length | 0;
          while (length) {
            length = (length - 1) | 0;
            rootNodes[length].remove();
          }
        },
      };
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
  children?: NodeCustomization[];
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
