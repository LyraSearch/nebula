import { readFile } from 'node:fs/promises'
import { IncomingHttpHeaders } from 'node:http'
import { basename } from 'node:path'
import undici, { Dispatcher } from 'undici'
import { V01Configuration } from '../../configuration.js'

async function cloudFlareRequest(
  apiToken: string,
  method: Dispatcher.HttpMethod,
  path: string,
  errorPrefix: string,
  body?: Buffer | string,
  headers?: IncomingHttpHeaders
): Promise<any> {
  const { statusCode, body: responseBody } = await undici.request(
    `https://api.cloudflare.com/client/v4/${path.replace(/^\//, '')}`,
    {
      method,
      headers: {
        authorization: `Bearer ${apiToken}`,
        ...headers
      },
      body
    }
  )

  let data = Buffer.alloc(0)
  for await (const chunk of responseBody) {
    data = Buffer.concat([data, chunk])
  }

  const response = JSON.parse(data.toString('utf-8'))

  if (!response.success) {
    throw new Error(`${errorPrefix} with HTTP error ${statusCode}\n\n${JSON.stringify(response, null, 2)}`)
  }

  return response
}

async function deployWorker(account: string, apiToken: string, workerName: string, sourcePath: string): Promise<void> {
  // Upload the script to CloudFlare
  return cloudFlareRequest(
    apiToken,
    'PUT',
    `/accounts/${account}/workers/scripts/${workerName}`,
    'Deployment failed',
    await readFile(sourcePath),
    {
      'content-type': 'application/javascript'
    }
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
  const account = process.env.CLOUDFLARE_ACCOUNT
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const workerName = configuration.target.configuration?.workerName ?? basename(sourcePath, '.js')
  const useWorkerDomain = configuration.target.configuration?.useWorkerDomain ?? true

  if (!account || !apiToken) {
    throw new Error(
      'Please provide CloudFlare credentials in the CLOUDFLARE_ACCOUNT and CLOUDFLARE_API_TOKEN environment variable.'
    )
  }

  await deployWorker(account, apiToken, workerName, sourcePath)
  const domain = await getWorkersDomain(account, apiToken)

  if (useWorkerDomain && !(await isWorkersSudomainEnabled(account, apiToken, workerName))) {
    await enableWorkersSubdomain(account, apiToken, workerName)
  }

  return `https://${workerName}.${domain}.workers.dev`
}
