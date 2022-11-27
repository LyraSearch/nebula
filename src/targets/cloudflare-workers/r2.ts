import FormData from 'form-data'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Ora } from 'ora'
import { V01Configuration } from '../../configuration.js'
import { signRequest } from '../common/aws-signing.js'
import { cloudFlareRequest, DeployPayload } from './common.js'

async function ensureR2Bucket(spinner: Ora, account: string, apiToken: string, name: string): Promise<void> {
  try {
    spinner.start(`Making sure R2 bucket \x1b[1m${name}\x1b[0m exists ...`)

    await cloudFlareRequest(
      'R2 bucket creation failed',
      apiToken,
      'POST',
      `/accounts/${account}/r2/buckets`,
      {
        'content-type': 'application/json'
      },
      JSON.stringify({ name })
    )

    spinner.succeed(`R2 bucket \x1b[1m${name}\x1b[0m successfully created ...`)
  } catch (e) {
    if (e.response?.errors?.[0]?.code === 10004) {
      spinner.info(`R2 bucket \x1b[1m${name}\x1b[0m already existed ...`)
      return
    }

    throw e
  }
}

async function uploadR2Data(
  spinner: Ora,
  account: string,
  id: string,
  key: string,
  bucket: string,
  name: string,
  data: Buffer
): Promise<void> {
  // Sign the request using AWS S3 algorithm
  const service = 's3'
  const region = 'auto'
  const host = `${bucket}.${account}.r2.cloudflarestorage.com`
  const rawUrl = `https://${host}/${name}`

  const headers = signRequest(id, key, service, region, rawUrl, 'PUT', {
    'content-type': 'application/json'
  })

  // Perform the request
  spinner.start(`Uploading file \x1b[1m${name}\x1b[0m to R2 bucket \x1b[1m${bucket}\x1b[0m.`)
  await cloudFlareRequest('Data upload to R2 failed', '', 'PUT', rawUrl, headers, data)
  spinner.succeed(`File \x1b[1m${name}\x1b[0m successfully uploaded to R2 bucket \x1b[1m${bucket}\x1b[0m.`)
}

export async function deleteR2Bucket(spinner: Ora, account: string, apiToken: string, name: string): Promise<void> {
  const r2Id = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const r2Secret = process.env.CLOUDFLARE_R2_ACCESS_KEY_SECRET

  if (!r2Id || !r2Secret) {
    throw new Error(
      'Please provide R2 credentials in the CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_ACCESS_KEY_SECRET environment variable.'
    )
  }

  try {
    spinner.start(`Deleting R2 bucket \x1b[1m${name}\x1b[0m ...`)

    // Delete data from R2 first
    const service = 's3'
    const region = 'auto'
    const host = `${name}.${account}.r2.cloudflarestorage.com`
    const rawUrl = `https://${host}/data.json`

    const headers = signRequest(r2Id, r2Secret, service, region, rawUrl, 'DELETE', {})

    await cloudFlareRequest('Deleting data from R2 failed', '', 'DELETE', rawUrl, headers)

    await cloudFlareRequest(
      'R2 bucket deletion failed',
      apiToken,
      'DELETE',
      `/accounts/${account}/r2/buckets/${name}`,
      {},
      ''
    )

    spinner.succeed(`R2 bucket \x1b[1m${name}\x1b[0m successfully deleted ...`)
  } catch (e) {
    if (
      (typeof e.response === 'string' && e.response?.includes('<Code>NoSuchBucket</Code>')) ||
      e.response?.errors?.[0]?.code === 10006
    ) {
      spinner.info(`R2 bucket \x1b[1m${name}\x1b[0m has been already deleted.`)
      return
    }

    throw e
  }
}

export async function deployWithR2(
  spinner: Ora,
  configuration: V01Configuration,
  account: string,
  apiToken: string,
  bucket: string,
  payload: Buffer,
  rootDirectory: string
): Promise<DeployPayload> {
  const r2Id = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const r2Secret = process.env.CLOUDFLARE_R2_ACCESS_KEY_SECRET

  if (!r2Id || !r2Secret) {
    throw new Error(
      'Please provide R2 credentials in the CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_ACCESS_KEY_SECRET environment variable.'
    )
  }

  // Ensure the bucket and upload data
  await ensureR2Bucket(spinner, account, apiToken, bucket)

  const data = await readFile(join(rootDirectory, configuration.output.dataName))
  await uploadR2Data(spinner, account, r2Id, r2Secret, bucket, 'data.json', data)

  const form = new FormData()
  form.append('worker.js', payload, { filename: 'worker.js', contentType: 'application/javascript' })
  form.append(
    'metadata',
    JSON.stringify({
      body_part: 'worker.js',
      bindings: [
        {
          type: 'r2_bucket',
          name: 'R2',
          bucket_name: configuration.deploy.configuration.r2
        }
      ]
    })
  )

  return { payload: form.getBuffer(), headers: form.getHeaders() }
}
