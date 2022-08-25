import FormData from 'form-data'
import { readFile } from 'node:fs/promises'
import { IncomingHttpHeaders } from 'node:http'
import { basename, join } from 'node:path'
import { V01Configuration } from '../../configuration.js'
import { cloudFlareRequest } from './common.js'
import { ensureR2Bucket, uploadR2Data } from './r2.js'

async function deployWorker(
  account: string,
  apiToken: string,
  workerName: string,
  payload: Buffer,
  headers: IncomingHttpHeaders
): Promise<void> {
  return cloudFlareRequest(
    apiToken,
    'PUT',
    `/accounts/${account}/workers/scripts/${workerName}`,
    'Deployment failed',
    payload,
    headers
  )
}

async function getWorkersDomain(account: string, apiToken: string): Promise<string> {
  const response = await cloudFlareRequest(
    apiToken,
    'GET',
    `/accounts/${account}/workers/subdomain`,
    'Querying worker domain'
  )

  return response.result.subdomain
}

async function isWorkersSudomainEnabled(account: string, apiToken: string, workerName: string): Promise<boolean> {
  const response = await cloudFlareRequest(
    apiToken,
    'GET',
    `/accounts/${account}/workers/services/${workerName}/environments/production/subdomain`,
    'Query worker subdomain status'
  )

  return response.result.enabled === true
}

async function enableWorkersSubdomain(account: string, apiToken: string, workerName: string): Promise<void> {
  return cloudFlareRequest(
    apiToken,
    'POST',
    `/accounts/${account}/workers/services/${workerName}/environments/production/subdomain`,
    'Enabling worker subdomain',
    JSON.stringify({ enabled: true }),
    {
      'content-type': 'application/json'
    }
  )
}

export async function deploy(sourcePath: string, configuration: V01Configuration): Promise<string> {
  configuration.deploy.configuration = {
    workerName: basename(sourcePath, '.js'),
    useWorkerDomain: true,
    ...configuration.deploy.configuration
  }

  const account = process.env.CLOUDFLARE_ACCOUNT
  const apiToken = process.env.CLOUDFLARE_API_TOKEN

  const { workerName, useWorkerDomain } = configuration.deploy.configuration
  const r2Bucket = configuration.deploy.configuration?.r2

  if (!account || !apiToken) {
    throw new Error(
      'Please provide CloudFlare credentials in the CLOUDFLARE_ACCOUNT and CLOUDFLARE_API_TOKEN environment variable.'
    )
  }

  let payload = await readFile(sourcePath)
  let headers: IncomingHttpHeaders = { 'content-type': 'application/javascript' }

  if (r2Bucket) {
    const r2Id = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
    const r2Secret = process.env.CLOUDFLARE_R2_ACCESS_KEY_SECRET

    if (!r2Id || !r2Secret) {
      throw new Error(
        'Please provide R2 credentials in the CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_ACCESS_KEY_SECRET environment variable.'
      )
    }

    // Ensure the bucket and upload data
    await ensureR2Bucket(account, apiToken, r2Bucket)

    const data = await readFile(join(process.cwd(), configuration.output.directory, configuration.output.dataName))

    await uploadR2Data(account, r2Id, r2Secret, r2Bucket, 'data', data)

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

    payload = form.getBuffer()
    headers = form.getHeaders()
  }

  await deployWorker(account, apiToken, workerName, payload, headers)
  const domain = await getWorkersDomain(account, apiToken)

  if (useWorkerDomain && !(await isWorkersSudomainEnabled(account, apiToken, workerName))) {
    await enableWorkersSubdomain(account, apiToken, workerName)
  }

  return `https://${workerName}.${domain}.workers.dev`
}
