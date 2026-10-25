import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Compile the actual local components. Only Next's router/auth/data boundaries
// are injected; component event handlers and React state run unchanged.
export function loadModule(path, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  const sourceRequire = createRequire(new URL(path, import.meta.url));
  compileFunction(source, ['require', 'exports', 'module'])(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('@/') ? require(fileURLToPath(new URL(`../../src/${name.slice(2)}`, import.meta.url))) : sourceRequire(name), compiledModule.exports, compiledModule,
  );
  return compiledModule.exports;
}

export function loadTsx(path, mocks = {}) { return loadModule(path, mocks).default; }
