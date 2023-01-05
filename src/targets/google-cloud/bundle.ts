import { readFile } from 'node:fs/promises'
import { BundledLyra, GoogleCloudDeploymentConfiguration, V01Configuration } from '../../configuration.js'

export async function bundle(
  configuration: V01Configuration,
  serializedLyraInstance: string | Buffer
): Promise<BundledLyra> {
  let template = await readFile(new URL('./template.js', import.meta.url), 'utf-8')
  const { separateDataObject, bucket } = configuration.deploy.configuration as GoogleCloudDeploymentConfiguration

  if (separateDataObject) {
    template = template
      .replaceAll('__DATA_TYPE__', 'CloudStorage')
      .replaceAll('__DATA__', '{}')
      .replaceAll('__BUCKET__', bucket)
  } else {
    template = template.replace('__DATA_TYPE__', 'Embedded').replace('__DATA__', serializedLyraInstance as string)
  }

  return { template, hasSeparateData: Boolean(separateDataObject) }
}
