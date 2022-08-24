#!/usr/bin/env node

import { program as p } from 'commander'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bundle } from './bundle.js'
import { deploy } from './deploy.js'

const nebulaRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '')
const version = JSON.parse(readFileSync(resolve(nebulaRoot, '../package.json'), 'utf8')).version

p.name('nebula')
  .description('Runtime-agnostic build system for Lyra')
  .version(version, '-V, --version', 'Show nebula version')
  .addHelpCommand(true)
  .showSuggestionAfterError(true)
  .allowUnknownOption(false)

p.command('bundle [configuration]').description('Bundles Lyra and a data source').alias('b').action(bundle)

p.command('deploy [configuration]')
  .description('Deploys Lyra to the edge')
  .alias('d')
  .option('-B, --no-build', 'Do not run the build step')
  .action(deploy)

p.parse()
