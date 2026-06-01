import { Type } from '@mikro-orm/core';

export class VectorType extends Type<number[], string> {
  convertToDatabaseValue(value: number[]): string {
    return `[${value.join(',')}]`;
  }

  convertToJSValue(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number);
  }

  getColumnType(): string {
    return 'vector';
  }
}