'use strict';

// date-holidays-parser only uses deepmerge.all(array). Keep its array
// concatenation and cloning behavior with a merge implementation that rejects
// __proto__, constructor and prototype at every nesting level.
const createMerge = require('@fastify/deepmerge');
const merge = createMerge({symbols: true});
merge.all = function all(values) {
  if (!Array.isArray(values)) throw new TypeError('Expected an array of merge inputs.');
  return values.reduce((result, value) => merge(result, value), {});
};
module.exports = merge;
