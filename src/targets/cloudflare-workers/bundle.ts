import { readFile } from 'node:fs/promises'
import { V01Configuration } from '../../configuration.js'

export async function bundle(
  configuration: V01Configuration,
  serializedLyraInstance: string | Buffer
): Promise<string> {
  let template = await readFile(new URL('./template.js', import.meta.url), 'utf-8')

  if (configuration.deploy.configuration.r2) {
    template = template.replaceAll('__DATA_TYPE__', 'R2').replaceAll('__DATA__', '{}')
  } else if (configuration.deploy.configuration.kv) {
    template = template.replaceAll('__DATA_TYPE__', 'KV').replaceAll('__DATA__', '{}')
  } else {
    template = template.replaceAll('__DATA_TYPE__', 'Embedded').replaceAll('__DATA__', serializedLyraInstance as string)
  }
  return template
}
