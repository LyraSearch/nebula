import { readFile } from 'node:fs/promises'
import { AwsLambdaDeploymentConfiguration, BundledLyra, V01Configuration } from '../../configuration.js'

export async function bundle(
  configuration: V01Configuration,
  serializedLyraInstance: string | Buffer
): Promise<BundledLyra> {
  const region = process.env.AWS_REGION
  const bucket = (configuration.deploy.configuration as AwsLambdaDeploymentConfiguration).s3

  if (!region) {
    throw new Error('Please provide AWS region in the AWS_REGION environment variable.')
  }

  let template = await readFile(new URL('./template.js', import.meta.url), 'utf-8')

  if (bucket) {
    template = template
      .replaceAll('__DATA_TYPE__', 'S3')
      .replaceAll('__DATA__', '{}')
      .replaceAll('__REGION__', region)
      .replaceAll('__BUCKET__', bucket)
  } else {
    template = template.replace('__DATA_TYPE__', 'Embedded').replace('__DATA__', serializedLyraInstance as string)
  }

  return { template, hasSeparateData: Boolean(bucket) }
}
