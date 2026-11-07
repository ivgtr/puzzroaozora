import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('patched minimatch supports callable and named consumers and React lint patterns', () => {
  const minimatch = require('minimatch');
  assert.equal(minimatch('src/page.tsx', 'src/**/*.tsx'), true);
  assert.equal(new minimatch.Minimatch('src/**/*.tsx').match('src/page.tsx'), true);
  const { Linter } = require('eslint');
  const react = require('eslint-plugin-react');
  const messages = new Linter().verify('const x = <Bad_name />;', [{
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { react },
    rules: { 'react/jsx-pascal-case': ['error', { ignore: ['Foo*'] }] },
  }]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, 'react/jsx-pascal-case');
});
