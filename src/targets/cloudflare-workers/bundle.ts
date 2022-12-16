import { readFile } from 'node:fs/promises'
import { BundledLyra, V01Configuration } from '../../configuration.js'

export async function bundle(
  configuration: V01Configuration,
  serializedLyraInstance: string | Buffer
): Promise<BundledLyra> {
  const { r2, kv } = configuration.deploy.configuration
  let template = await readFile(new URL('./template.js', import.meta.url), 'utf-8')
  let hasSeparateData = false

  if (r2) {
    template = template.replaceAll('__DATA_TYPE__', 'R2').replaceAll('__DATA__', '{}')
    hasSeparateData = true
  } else if (kv) {
    template = template.replaceAll('__DATA_TYPE__', 'KV').replaceAll('__DATA__', '{}')
    hasSeparateData = true
  } else {
    template = template.replaceAll('__DATA_TYPE__', 'Embedded').replaceAll('__DATA__', serializedLyraInstance as string)
  }
  return { template, hasSeparateData }
}
