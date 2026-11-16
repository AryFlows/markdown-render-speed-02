import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from './parse.js';

const cases = JSON.parse(readFileSync('/input/cases.json', 'utf8')) as {
  markdown: string;
}[];

mkdirSync('/output', { recursive: true });
writeFileSync('/output/html.json', JSON.stringify(cases.map(({ markdown }) => parse(markdown))));
