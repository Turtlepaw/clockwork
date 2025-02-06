declare global {
  interface String {
    surround(character: string): string;
  }
}

String.prototype.surround = function (character: string): string {
  return `${character}${this}${character}`;
};

export {};
