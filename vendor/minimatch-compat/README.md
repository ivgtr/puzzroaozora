# minimatch compatibility bridge

ESLint plugins in this project require the legacy callable CommonJS export, while the patched minimatch 11 exports an object. This bridge forwards the callable and named exports to the real `minimatch-patched` npm alias; it contains no matcher implementation. Scoped overrides apply only to the current ESLint dependency consumers, not arbitrary glob consumers. The full audit must continue to inspect the real alias.

The major-version compatibility is tested for representative ESLint paths, not every possible pattern. Remove this bridge and the overrides when the upstream plugins accept a patched minimatch release. `.npmrc` enables packed local dependencies so npm 10 and 11 can reproduce the lockfile.
