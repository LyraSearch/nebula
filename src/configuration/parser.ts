import type { V01Configuration } from 'types/configuration'
import yaml from 'js-yaml'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ERRORS from '../errors'

export type LyraConfigurationParams = {
  path?: string
  configuration?: string
}

type YamlVersionPlaceholder = {
  version: string
}

function gretDefaultPath(): string {
  return join(process.cwd(), 'lyra.yml')
}

function readLyraConfiguration(path = gretDefaultPath()) {
  return readFileSync(path, 'utf8')
}

export function parseLyraConfiguration({ path, configuration }: LyraConfigurationParams = {}): V01Configuration {
  let conf: string;

  if (!configuration) {
    conf = readLyraConfiguration(path)
  } else {
    conf = configuration
  }
 
  const parsedConfig = yaml.load(conf) as YamlVersionPlaceholder

  if (!parsedConfig.version) {
    throw new Error('Invalid configuration file')
  }

  switch (parseFloat(parsedConfig.version)) {
    case 0.1:
      return parsedConfig as unknown as V01Configuration
    default:
      throw new Error(ERRORS.INVALID_CONFIGURATION_VERSION(parsedConfig.version))
  }
} 