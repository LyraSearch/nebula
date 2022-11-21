import { readFile } from 'node:fs/promises'
import { V01Configuration } from '../../configuration.js'

export async function bundle(
  configuration: V01Configuration,
  serializedLyraInstance: string | Buffer
): Promise<string> {
  const region = process.env.AWS_REGION

  if (!region) {
    throw new Error('Please provide AWS region in the AWS_REGION environment variable.')
  }

  let template = await readFile(new URL('./template.js', import.meta.url), 'utf-8')

  if (configuration.deploy.configuration.s3) {
    template = template
      .replaceAll('__DATA_TYPE__', 'S3')
      .replaceAll('__DATA__', '{}')
      .replaceAll('__REGION__', region)
      .replaceAll('__BUCKET__', configuration.deploy.configuration.s3)
  } else {
    template = template.replace('__DATA_TYPE__', 'Embedded').replace('__DATA__', serializedLyraInstance as string)
  }
  return template
}
