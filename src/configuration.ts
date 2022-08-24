import { PropertiesSchema } from '@lyrasearch/lyra'
import yaml from 'js-yaml'
import { readFile } from 'node:fs/promises'
import { INVALID_CONFIGURATION_FILE, INVALID_CONFIGURATION_VERSION, UNREADABLE_CONFIGURATION_FILE } from './errors.js'

interface YamlVersionPlaceholder {
  version: string
}

export type Version = '0.1'

export type Sharding = 'auto' | number

export type DataType = 'javascript' | 'json'

export type Platform = 'cloudflare'

export interface Data {
  type: DataType
  source: string
  configuration: Record<string, any>
}

export interface Target {
  platform: Platform
  configuration: Record<string, any>
}

export interface LyraConfigurationParams {
  path?: string
  configuration?: string
}

export interface V01Configuration {
  version: 0.1
  schema: {
    definition: PropertiesSchema
  }
  outputFile: string
  outputDirectory: string
  data: Data
  target: Target
  sharding: Sharding
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
      return parsedConfig as unknown as V01Configuration
    default:
      throw new Error(INVALID_CONFIGURATION_VERSION(parsedConfig.version))
  }
}
