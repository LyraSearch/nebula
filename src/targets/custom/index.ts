import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Ora } from 'ora'
import { BundledLyra, CustomDeploymentConfiguration, V01Configuration } from '../../configuration.js'
import {
  CUSTOM_IMPLEMENTATION_NOT_FOUND,
  MISSING_CUSTOM_DEPLOYMENT_IMPLEMENTATION,
  MISSING_CUSTOM_DEPLOYMENT_PATH
} from '../../errors.js'

interface CustomPlatform {
  bundle: (configuration: V01Configuration, serializedLyraInstance: string | Buffer) => Promise<BundledLyra>
  deploy: (spinner: Ora, sourcePath: string, configuration: V01Configuration, rootDirectory: string) => Promise<null>
  undeploy: (spinner: Ora, configuration: V01Configuration) => Promise<void>
}

async function loadImplementation<T extends keyof CustomPlatform>(
  configuration: V01Configuration,
  fn: keyof CustomPlatform
): Promise<CustomPlatform[T]> {
  const path = (configuration.deploy.configuration as CustomDeploymentConfiguration).path

  if (!path) {
    throw new Error(MISSING_CUSTOM_DEPLOYMENT_PATH())
  }

  let implementation: CustomPlatform
  try {
    implementation = await import(resolve(process.cwd(), path))
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(CUSTOM_IMPLEMENTATION_NOT_FOUND(path))
    }

    throw e
  }

  const loaded = implementation[fn] as CustomPlatform[T]
  if (typeof loaded !== 'function') {
    throw new Error(MISSING_CUSTOM_DEPLOYMENT_IMPLEMENTATION(fn))
  }

  return loaded
}

export async function bundle(
  configuration: V01Configuration,
  serializedLyraInstance: string | Buffer
): Promise<BundledLyra> {
  const customBundle = await loadImplementation<'bundle'>(configuration, 'bundle')
  return customBundle(configuration, serializedLyraInstance)
}

export async function bundleStandalone(
  configuration: V01Configuration,
  serializedLyraInstance: string | Buffer
): Promise<BundledLyra> {
  const template = await readFile(new URL('./template-standalone.js', import.meta.url), 'utf-8')

  return {
    template: template.replaceAll('__DATA__', serializedLyraInstance as string),
    hasSeparateData: false
  }
}

export async function deploy(
  spinner: Ora,
  sourcePath: string,
  configuration: V01Configuration,
  rootDirectory: string
): Promise<null> {
  const customDeploy = await loadImplementation<'deploy'>(configuration, 'deploy')
  return customDeploy(spinner, sourcePath, configuration, rootDirectory)
}

export async function undeploy(spinner: Ora, configuration: V01Configuration): Promise<void> {
  const customUndeploy = await loadImplementation<'undeploy'>(configuration, 'undeploy')
  return customUndeploy(spinner, configuration)
}
