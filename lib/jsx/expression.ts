export enum ExpressionType {
  Property,
}

export type Expression = {
  type: ExpressionType.Property;
  name: string;
};
