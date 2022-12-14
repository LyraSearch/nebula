import { PropertiesSchema } from '@lyrasearch/lyra'
import { Language } from '@lyrasearch/lyra/dist/esm/src/tokenizer/languages.js'
import { Command } from 'commander'
import yaml from 'js-yaml'
import { readFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { Ora } from 'ora'
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

export type Platform = 'cloudflare' | 'aws-lambda' | 'google-cloud' | 'azure' | 'custom'

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

export interface AwsLambdaDeploymentConfiguration {
  function: string
  repository: string
  s3?: string
  cors?: Record<string, boolean | number | string[]>
}

export interface GoogleCloudDeploymentConfiguration {
  function: string
  bucket: string
  project: string
  region: string
  separateDataObject?: boolean
}

export interface AzureDeploymentConfiguration {
  application: string
  function: string
  resourceGroup: string
  storageAccount: string
  region: string
  container?: string
}

export interface CloudflareDeploymentConfiguration {
  workerName: string
  useWorkerDomain?: boolean
  r2?: string
  kv?: string
}

export interface CustomDeploymentConfiguration {
  path: string
}

export type DeploymentConfiguration =
  | AwsLambdaDeploymentConfiguration
  | GoogleCloudDeploymentConfiguration
  | AzureDeploymentConfiguration
  | CloudflareDeploymentConfiguration
  | CustomDeploymentConfiguration

export interface Deploy {
  platform: Platform
  configuration: DeploymentConfiguration
}

export interface V01Configuration {
  version: 0.1
  language: Language
  schema: {
    definition: PropertiesSchema
  }
  input: Input
  output: Output
  deploy: Deploy
}

export interface BundledLyra {
  template: string
  hasSeparateData: boolean
  afterBuild?: (spinner: Ora, path: string) => void | Promise<void>
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
  configuration.deploy = { platform: '', ...configuration.deploy }

  return configuration
}

export async function parseLyraConfiguration(
  command: Command,
  ymlPath: string
): Promise<[V01Configuration, string, string]> {
  if (!ymlPath) {
    ymlPath = 'lyra.yml'
  }

  let outputDirectory = command.optsWithGlobals().directory

  if (outputDirectory === '-') {
    outputDirectory = ymlPath.includes(sep) ? dirname(ymlPath) : ''
  }

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
    case 0.1: {
      const configuration = validateV01Configuration(parsedConfig)

      return [
        configuration,
        (outputDirectory = resolve(...[process.cwd(), outputDirectory, configuration.output.directory].filter(s => s))),
        resolve(process.cwd(), ymlPath)
      ]
    }
    default:
      throw new Error(INVALID_CONFIGURATION_VERSION(parsedConfig.version))
  }
}
