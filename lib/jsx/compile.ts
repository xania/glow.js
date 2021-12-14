import {
  AttributeType,
  TemplateType,
  Template,
  Renderable,
  RenderResult,
  RenderContext,
} from './template';
import { createDOMElement } from './render';
import { isSubscribable } from '../driver';
import { Subscribable } from '../util/rxjs';
import { Expression, ExpressionType } from './expression';
import flatten, { bottomUp } from './flatten';

interface RenderTarget {
  appendChild(node: Node): void;
}

type StackItem = [Node, Template | Template[]];

export function compile(rootTemplate: Template | Template[]) {
  const renderersMap = createLookup<Node, Renderable>();
  // const eventsMap = createLookup<Node, CompilationEvent>();
  const expressionsMap = new Map<Node, Expression>();

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
      case TemplateType.Property:
        const exprNode = document.createTextNode('');
        target.appendChild(exprNode);
        setExpression(exprNode, template.name.split('.'));
        break;
    }
  }

  return createResult();

  function createResult() {
    const rootNodes = mapNodeList(fragment.childNodes, (node) => node);

    const flattened = flatten(
      rootNodes.map(createNodeCustomization),
      ({ node }) => mapNodeList(node.childNodes, createNodeCustomization)
    );

    const customizations = new Map<Node, NodeCustomization>();
    // iterate in reverse to traverse nodes bottom up
    for (let i = flattened.length - 1; i >= 0; i--) {
      const cust = flattened[i];

      const children = mapNodeList(cust.node.childNodes, (node) =>
        customizations.get(node)
      ).filter((x) => !!x) as NodeCustomization[];

      if (children.length) {
        cust.children = children;
        customizations.set(cust.node, cust);
      } else if (cust.renderers || cust.expression) {
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

  function setExpression(target: Node, path: string[]) {
    return expressionsMap.set(target, {
      type: ExpressionType.Property,
      path,
    });
  }

  function setAttribute(elt: Element, name: string, value: any): void {
    if (isSubscribable(value)) {
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

interface NodeAction {
  renderers?: Renderable[];
  // events?: CompilationEvent[];
  expression?: Expression;
}

class CompileResult {
  constructor(
    private fragment: Node[],
    private customizations?: NodeCustomization[]
  ) {}

  render(driver: { target: RenderTarget }, context?: RenderContext) {
    const { fragment, customizations } = this;
    const rootNodes: ChildNode[] = []; // fragment.map((x) => x.cloneNode(true) as ChildNode);
    const rootLength = fragment.length;
    for (let i = 0; i < rootLength; i++)
      rootNodes[i] = fragment[i].cloneNode(true) as ChildNode;
    const renderResults: RenderResult[] = [];

    if (customizations) {
      const stack: any[] = [];

      for (const cust of customizations) {
        const index = cust.index;
        stack.push(rootNodes[index]);
        stack.push(cust);
      }
      let stackLength = stack.length;
      while (stackLength) {
        const cus = stack[--stackLength] as NodeCustomization;
        const target = stack[--stackLength] as ChildNode;

        const { renderers, expression, children } = cus;
        if (renderers) {
          let { length } = renderers;
          const driver = { target };
          while (length--) {
            const renderer = renderers[length];
            const rr = renderer.render(driver, context);
            renderResults.push(rr);
          }
        }

        if (expression && context) {
          let value = context.values;
          const { path } = expression;
          const pathLength = path.length;
          for (let i = 0; i < pathLength; i++) {
            value = value[path[i]];
          }
          target.textContent = value;
        }
        if (children) {
          let firstChild: ChildNode | null = null;
          for (const childCust of children) {
            const { index } = childCust;
            const childNode =
              index === 0
                ? (firstChild = target.firstChild as ChildNode)
                : index === 1
                ? ((firstChild || (target.firstChild as ChildNode))
                    .nextSibling as ChildNode)
                : target.childNodes[index];

            stack[stackLength++] = childNode;
            stack[stackLength++] = childCust;
          }
        }
      }
    }

    const rootTarget = driver.target;
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
};
type TransformResult<T> = {
  [i: number]: VisitResult<T>;
};
// function transform<T>(
//   rootNode: { childNodes: NodeListOf<ChildNode> },
//   visitFn: (child: Node, children?: TransformResult<T>) => T | undefined
// ): NodeCustomization {
//   type StackItem = [result: NodeCustomization[], index: number, node: Node];
//   let stack: StackItem[] = [];
//   const rootResult: NodeCustomization[] = [];
//   rootNode.childNodes.forEach((x, i) => stack.push([rootResult, i, x]));

//   while (stack.length) {
//     const [parentResult, index, node] = stack.pop() as StackItem;
//     let visitResult = parentResult[index];
//     if (visitResult) {
//       const children = sanitize(visitResult.children);
//       if (!children) {
//         delete visitResult.children;
//       }
//       const visitValue = visitFn(node, children);
//       if (visitValue) {
//         visitResult.value = visitValue;
//       }
//     } else {
//       parentResult[index] = visitResult = {};
//       stack.push([parentResult, index, node]);

//       const childNodes = node.childNodes;
//       let length = childNodes.length;
//       if (length) {
//         const children: TransformResult<T> = {};
//         visitResult.children = children;

//         while (length--) {
//           stack.push([children, length, childNodes[length]]);
//         }
//       }
//     }
//   }

//   return sanitize(rootResult);
// }

function sanitize(rootCustomizations?: NodeCustomization[]) {
  if (!rootCustomizations) return undefined;
  const flattened = flatten(rootCustomizations, (c) => c.children);
  let length = flattened.length;
  const set = new Set<NodeCustomization>();
  while (length--) {
    const cust = flattened[length];
    if (cust.expression) {
      set.add(cust);
    } else if (Array.isArray(cust.renderers) && cust.renderers.length > 0) {
      set.add(cust);
    } else if (Array.isArray(cust.children)) {
      if (cust.children.some((x) => set.has(x))) set.add(cust);
    }
  }
  return rootCustomizations.filter((x) => set.has(x));
}

function mapNodeList<U>(
  nodes: NodeListOf<Node>,
  mapper: (x: Node, i: number) => U
) {
  const result: U[] = [];
  const length = nodes.length;
  for (let i = 0; i < length; i++) {
    result.push(mapper(nodes[i], i));
  }
  return result;
}
