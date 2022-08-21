import argv from 'minimist'
import { parseLyraConfiguration } from './configuration/parser'
import { bundle } from './bundler'
import { UNKNOWN_COMMAND, COMMAND_IS_UNDEFINED } from './errors'

const options = argv(process.argv.slice(2))

export async function run() {
  const [ cmd ] = options._

  if (cmd === 'run') {
    const configuration = parseLyraConfiguration()
    return await bundle(configuration)
  }

  if (typeof cmd === 'undefined') {
    console.log(COMMAND_IS_UNDEFINED())
    process.exit(1)
  }

  throw new Error(UNKNOWN_COMMAND(cmd))
}

run()