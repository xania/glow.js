export enum ExpressionType {
  Property,
  Async,
}

export interface PropertyExpression {
  type: ExpressionType.Property;
  name: string;
}

export interface AsyncExpression {
  type: ExpressionType.Async;
  observable: Expression;
}

export type Expression = PropertyExpression | AsyncExpression;
