/**
 * A lesson with one box and no register names says "the box", never "box a0": the name `a0` is not on screen,
 * so the card must not use it. Later lessons show the names, and then the text is left alone.
 */
export const plainBoxes = (text: string): string => text.replace(/\b([Bb])ox [a-z]\d+\b/g, (_, b: string) => (b === "B" ? "The box" : "the box"));
