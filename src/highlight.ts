/**
 * Syntax colors for code on slides. Loaded on demand (markdown.ts imports
 * this file only when a deck has a fenced block with a language), so decks
 * without code don't pay for the parsers.
 *
 * Uses the Lezer parsers CodeMirror is built on. Each token gets one of a
 * few `tok-*` classes (below); slide.css colors them with Flexoki's syntax
 * palette.
 *
 * TO ADD A LANGUAGE: install its @lezer package, then add its fence names
 * to PARSERS below.
 */
import { highlightCode, tagHighlighter, tags as t } from '@lezer/highlight';
import type { Parser } from '@lezer/common';
import { parser as js } from '@lezer/javascript';
import { parser as python } from '@lezer/python';
import { parser as css } from '@lezer/css';
import { parser as html } from '@lezer/html';
import { parser as json } from '@lezer/json';
import { parser as rust } from '@lezer/rust';
import { parser as go } from '@lezer/go';
import { parser as java } from '@lezer/java';
import { parser as cpp } from '@lezer/cpp';
import { parser as yaml } from '@lezer/yaml';

/** Token kinds → classes. The more specific tag wins (a function name over a plain name). */
const highlighter = tagHighlighter([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'tok-comment' },
  { tag: [t.keyword, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.self], class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string), t.regexp, t.escape, t.character, t.docString], class: 'tok-string' },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], class: 'tok-number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], class: 'tok-function' },
  { tag: [t.definition(t.variableName), t.propertyName, t.attributeName], class: 'tok-variable' },
  { tag: [t.typeName, t.className, t.namespace, t.macroName, t.standard(t.variableName)], class: 'tok-type' },
  { tag: [t.tagName, t.heading, t.labelName], class: 'tok-tag' },
  { tag: [t.punctuation, t.operator, t.meta, t.bracket, t.separator, t.angleBracket], class: 'tok-punct' },
]);

const ts = js.configure({ dialect: 'ts' });
const jsx = js.configure({ dialect: 'jsx' });
const tsx = js.configure({ dialect: 'ts jsx' });

/** Fence names (```js) → parser. */
const PARSERS: Record<string, Parser> = {
  js, javascript: js, mjs: js, cjs: js,
  ts, typescript: ts,
  jsx, tsx,
  py: python, python,
  css,
  html, xml: html, svg: html,
  json,
  rs: rust, rust,
  go, golang: go,
  java,
  c: cpp, cpp, 'c++': cpp, h: cpp, hpp: cpp,
  yaml, yml: yaml,
};

/** One line of code as [text, class] runs. */
export type Line = [string, string][];

/** Tokenized lines, or null when the language isn't known. */
export function tokenize(code: string, lang: string): Line[] | null {
  const parser = PARSERS[lang.toLowerCase()];
  if (!parser) return null;
  const lines: Line[] = [[]];
  highlightCode(
    code,
    parser.parse(code),
    highlighter,
    (text, classes) => lines[lines.length - 1].push([text, classes]),
    () => lines.push([]),
  );
  return lines;
}
