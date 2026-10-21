import { createHash } from 'node:crypto';
export function parseJSON(text) {
  try { return JSON.parse(String(text).replace(/^\uFEFF/, ''), (key,value,context) => typeof value === 'number' && context?.source && /^-?\d+$/.test(context.source) && !Number.isSafeInteger(value) ? BigInt(context.source) : value); }
  catch (error) {
    // Runtime SyntaxError messages can quote private source fragments. Only a
    // numerical position may cross into stored diagnostics or report exports.
    if (!(error instanceof SyntaxError)) throw error;
    const position = /position (\d+)/i.exec(error.message)?.[1];
    throw new SyntaxError(`Invalid JSON syntax${position ? ` at character ${position}` : ''}.`);
  }
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
