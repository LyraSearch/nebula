import { readFile } from 'node:fs/promises'
import { AzureDeploymentConfiguration, BundledLyra, V01Configuration } from '../../configuration.js'

export async function bundle(
  configuration: V01Configuration,
  serializedLyraInstance: string | Buffer
): Promise<BundledLyra> {
  let template = await readFile(new URL('./template.js', import.meta.url), 'utf-8')
  const { container } = configuration.deploy.configuration as AzureDeploymentConfiguration

  if (container) {
    template = template.replaceAll('__DATA_TYPE__', 'AzureStorageBlob').replaceAll('__DATA__', '{}')
  } else {
    template = template.replace('__DATA_TYPE__', 'Embedded').replace('__DATA__', serializedLyraInstance as string)
  }

  return { template, hasSeparateData: Boolean(container) }
}
