import { readFile } from 'node:fs/promises'
import { IncomingHttpHeaders } from 'node:http'
import { basename } from 'node:path'
import { V01Configuration } from '../../configuration.js'
import { cloudFlareRequest, DeployPayload } from './common.js'
import { deployWithKV } from './kv.js'
import { deployWithR2 } from './r2.js'

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
  const r2Bucket = configuration.deploy.configuration.r2
  const kvNamespace = configuration.deploy.configuration.kv

  if (!account || !apiToken) {
    throw new Error(
      'Please provide CloudFlare credentials in the CLOUDFLARE_ACCOUNT and CLOUDFLARE_API_TOKEN environment variable.'
    )
  }

  let deployPayload: DeployPayload = {
    payload: await readFile(sourcePath),
    headers: { 'content-type': 'application/javascript' }
  }

  if (r2Bucket) {
    deployPayload = await deployWithR2(configuration, account, apiToken, r2Bucket, deployPayload.payload)
  } else if (kvNamespace) {
    deployPayload = await deployWithKV(configuration, account, apiToken, kvNamespace, deployPayload.payload)
  }

  await deployWorker(account, apiToken, workerName, deployPayload.payload, deployPayload.headers)
  const domain = await getWorkersDomain(account, apiToken)

  if (useWorkerDomain && !(await isWorkersSudomainEnabled(account, apiToken, workerName))) {
    await enableWorkersSubdomain(account, apiToken, workerName)
  }

  return `https://${workerName}.${domain}.workers.dev`
}
