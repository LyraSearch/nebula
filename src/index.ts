import { parseLyraConfiguration } from './configuration/parser'
import { bundle } from './bundler'

export async function run() {
  const configuration = parseLyraConfiguration()
  await bundle(configuration)
}

run()