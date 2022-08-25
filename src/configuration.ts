import { PropertiesSchema } from '@lyrasearch/lyra'
import yaml from 'js-yaml'
import { readFile } from 'node:fs/promises'
import {
  INVALID_CONFIGURATION_FILE,
  INVALID_CONFIGURATION_VERSION,
  MISSING_INPUT_PATH,
  MISSING_SCHEMA,
  UNREADABLE_CONFIGURATION_FILE
} from './errors.js'

interface YamlVersionPlaceholder {
  version: string
}

export type Version = '0.1'

export type Sharding = 'auto' | number

export type DataType = 'javascript' | 'json'

export type Platform = 'cloudflare'

export interface Input {
  path: string
  type: DataType
  configuration: Record<string, any>
}

export interface Output {
  name: string
  dataName: string
  directory: string
}

export interface Deploy {
  platform: Platform
  configuration: Record<string, any>
}

export interface V01Configuration {
  version: 0.1
  schema: {
    definition: PropertiesSchema
  }
  input: Input
  output: Output
  deploy: Deploy
}

function validateV01Configuration(parsedConfig: YamlVersionPlaceholder): V01Configuration {
  const configuration = parsedConfig as unknown as V01Configuration

  if (typeof configuration.schema !== 'object') {
    throw new Error(MISSING_SCHEMA())
  }

  if (typeof configuration.input?.path !== 'string') {
    throw new Error(MISSING_INPUT_PATH())
  }

  // @ts-expect-error:2783
  configuration.output = { directory: '.', name: 'lyra-bundle.js', dataName: 'data.json', ...configuration.output }

  // @ts-expect-error:2783
  configuration.deploy = { platform: 'cloudflare', ...configuration.deploy }

  return configuration
}

export async function parseLyraConfiguration(ymlPath: string): Promise<V01Configuration> {
  let rawConfiguration: string

  try {
    rawConfiguration = await readFile(ymlPath, 'utf8')
  } catch (e) {
    throw new Error(UNREADABLE_CONFIGURATION_FILE(ymlPath))
  }

  const parsedConfig = yaml.load(rawConfiguration) as YamlVersionPlaceholder

  if (!parsedConfig.version) {
    throw new Error(INVALID_CONFIGURATION_FILE(ymlPath))
  }

  switch (parseFloat(parsedConfig.version)) {
    case 0.1:
      return validateV01Configuration(parsedConfig)
    default:
      throw new Error(INVALID_CONFIGURATION_VERSION(parsedConfig.version))
  }
}
