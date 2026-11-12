export type V2FieldTuple = [label: string, value: unknown];
export interface V2FieldObject {
  label?: string;
  name?: string;
  value: unknown;
}
export type V2FieldEntry = V2FieldTuple | V2FieldObject | false | null | undefined;

export interface V2FieldsOptions {
  omitEmpty?: boolean;
  omitIfEmpty?: boolean;
  fallback?: string;
}

export declare class V2Text {
  static clip(text: unknown, maxLen?: number, fallback?: string): string;
  static code(value: unknown): string;
  static subtext(text: unknown, maxLen?: number | null): string;
  static heading(text: unknown, level?: 1 | 2 | 3, maxLen?: number | null): string;
  static fields(rows: V2FieldEntry[], options?: V2FieldsOptions): string;
  static sectionBlock(heading: string, rows: V2FieldEntry[], options?: V2FieldsOptions): string;
  static quote(text: unknown, maxLen?: number | null, fallback?: string): string;
  static join(blocks: Array<string | false | null | undefined>, separator?: string): string;
}
