#!/usr/bin/env node
'use strict';
/**
 * Finds names a script uses but never declares (a typo, or something a module forgot to take from window.HLEP).
 * A missing name only fails when that line runs, so this check catches what a quick click-through can miss.
 *
 *   node tools/lint-free.js beta/app.js beta/sw.js beta/js/*.js
 *
 * It is deliberately simple: a name counts as declared if it is declared anywhere in the file.
 */
const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');

const GLOBALS = new Set(('window document navigator location history localStorage sessionStorage indexedDB fetch console setTimeout clearTimeout ' +
  'setInterval clearInterval requestAnimationFrame cancelAnimationFrame Promise JSON Math Date Array Object String Number Boolean RegExp Error TypeError ' +
  'Map Set WeakMap Symbol Intl URL URLSearchParams Blob File FileReader Image FormData AbortController Uint8Array Float32Array Int16Array DataView ' +
  'ArrayBuffer atob btoa encodeURIComponent decodeURIComponent isNaN isFinite parseInt parseFloat undefined NaN Infinity createImageBitmap matchMedia ' +
  'getComputedStyle self caches clients Response Request Headers MediaRecorder AudioContext OfflineAudioContext IntersectionObserver ResizeObserver ' +
  'MutationObserver performance crypto TextEncoder TextDecoder structuredClone queueMicrotask CSS globalThis arguments importScripts DOMParser ' +
  'CustomEvent Event KeyboardEvent ClipboardItem SpeechRecognition webkitSpeechRecognition devicePixelRatio innerWidth innerHeight scrollTo ' +
  'visualViewport alert confirm').split(/\s+/));

function patternNames(p, out) {
  if (!p) return;
  if (p.type === 'Identifier') out.add(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach((q) => patternNames(q, out));
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
}

function check(file) {
  const src = fs.readFileSync(file, 'utf8');
  const isModule = /^\s*(import|export)\s/m.test(src);
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: isModule ? 'module' : 'script', locations: true });
  const declared = new Set();
  walk.full(ast, (n) => {
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      if (n.id) declared.add(n.id.name);
      n.params.forEach((p) => patternNames(p, declared));
    } else if (n.type === 'VariableDeclarator') patternNames(n.id, declared);
    else if (n.type === 'ClassDeclaration' || n.type === 'ClassExpression') { if (n.id) declared.add(n.id.name); }
    else if (n.type === 'CatchClause') patternNames(n.param, declared);
    else if (n.type === 'ImportSpecifier' || n.type === 'ImportDefaultSpecifier' || n.type === 'ImportNamespaceSpecifier') declared.add(n.local.name);
  });
  const missing = new Map();
  walk.fullAncestor(ast, (n, _state, anc) => {
    if (n.type !== 'Identifier') return;
    const p = anc[anc.length - 2];
    if (!p) return;
    if (p.type === 'MemberExpression' && p.property === n && !p.computed) return;
    if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === n && !p.computed && p.value !== n) return;
    if (p.type === 'Property' && p.key === n && !p.computed && p.shorthand === false) return;
    if (p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') return;
    if ((p.type === 'ImportSpecifier' && p.imported === n) || (p.type === 'ExportSpecifier')) return;
    if (declared.has(n.name) || GLOBALS.has(n.name)) return;
    if (!missing.has(n.name)) missing.set(n.name, n.loc.start.line);
  });
  return Array.from(missing.entries());
}

let bad = 0;
process.argv.slice(2).forEach((f) => {
  const m = check(f);
  if (m.length) { bad += m.length; console.log('❌ ' + f + ': ' + m.map((x) => x[0] + ' (line ' + x[1] + ')').join(', ')); }
  else console.log('✅ ' + f);
});
process.exit(bad ? 1 : 0);
