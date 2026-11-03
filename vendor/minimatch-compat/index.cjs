// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS consumers expect a callable export.
const implementation = require('minimatch-patched');
module.exports = Object.assign(implementation.minimatch, implementation);
