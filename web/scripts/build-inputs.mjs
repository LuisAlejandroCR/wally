#!/usr/bin/env node
// scripts/build-inputs.mjs
//
// Copies the engine's own fixture files into the site and records what they are.
//
// The receipt names its input as an absolute path on the machine that ran it,
// which tells a reader nothing and leaks a home directory besides. What a reader
// actually wants is the file: to open it, to download it, and to check that its
// sha256 is the one the receipt claims. So the files travel with the site.
//
// The hash is computed here rather than copied from the receipt. If a fixture is
// ever edited without the run being redone, the two stop matching and the page
// says so — which is the whole reason for showing a hash at all.
//
//   node scripts/build-inputs.mjs

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(AQUI, '../../code/evals/fixtures')
const PUBLICO = resolve(AQUI, '../public/inputs')
const DATOS = resolve(AQUI, '../src/data/inputs.json')

/** What each file is, in the words the page will use for it. */
const FILES = [
  { name: 'nomina_agosto.csv', role: 'The payroll, as it arrived.' },
  { name: 'nomina_inyeccion.csv', role: 'The same payroll with three cells rewritten to attack the model.' },
  { name: 'allowlist.txt', role: 'Every address the treasury is allowed to pay.' }
]

mkdirSync(PUBLICO, { recursive: true })

const files = {}
for (const { name, role } of FILES) {
  const bytes = readFileSync(join(FIXTURES, name))
  writeFileSync(join(PUBLICO, name), bytes)

  files[name] = {
    name,
    role,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    // The text is inlined so opening a file costs no request and works with the
    // page offline; the copy in `public/` is what a download link points at.
    text: bytes.toString('utf8')
  }
  console.log(`  ${name.padEnd(24)} ${String(bytes.length).padStart(6)} B  ${files[name].sha256.slice(0, 16)}…`)
}

writeFileSync(DATOS, JSON.stringify({ generated: new Date().toISOString(), files }, null, 2) + '\n')
console.log(`\n  ${Object.keys(files).length} files → src/data/inputs.json and public/inputs/\n`)
