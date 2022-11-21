#!/usr/bin/env node

import { program as p } from 'commander'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bundle } from './bundle.js'
import { deploy, undeploy } from './deploy.js'

const nebulaRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '')
const version = JSON.parse(readFileSync(resolve(nebulaRoot, '../package.json'), 'utf8')).version

p.name('nebula')
  .description('Runtime-agnostic build system for Lyra')
  .version(version, '-V, --version', 'Show nebula version')
  .option(
    '-d, --directory <directory>',
    'Directory where generated files are stored. Use "-" to use the same folder of the configuration file.',
    '-'
  )
  .addHelpCommand(true)
  .showSuggestionAfterError(true)
  .allowUnknownOption(false)

p.command('bundle [configuration]').description('Bundles Lyra and a data source').alias('b').action(bundle)

// TODO@PI: cleanup of generate files

p.command('deploy [configuration]')
  .description('Deploys Lyra to the edge')
  .alias('d')
  .option('-B, --no-build', 'Do not run the build step')
  .action(deploy)

p.command('undeploy [configuration]').description('Remove all deployment artifacts of Lyra').alias('u').action(undeploy)

p.parse()
