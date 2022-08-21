import argv from 'minimist'
import { parseLyraConfiguration } from './configuration/parser'
import { bundle } from './bundler'

const options = argv(process.argv.slice(2))

export async function run() {
  const path = options.conf
  const configuration = parseLyraConfiguration({ path })
  await bundle(configuration)
}

run()