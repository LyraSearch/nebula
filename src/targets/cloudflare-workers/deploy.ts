import { readFile } from 'node:fs/promises'
import { IncomingHttpHeaders } from 'node:http'
import { basename } from 'node:path'
import { Ora } from 'ora'
import { V01Configuration } from '../../configuration.js'
import { cloudFlareRequest, DeployPayload } from './common.js'
import { deployWithKV } from './kv.js'
import { deployWithR2 } from './r2.js'

async function createWorker(
  spinner: Ora,
  account: string,
  apiToken: string,
  workerName: string,
  payload: Buffer,
  headers: IncomingHttpHeaders
): Promise<void> {
  spinner.start(`Deploying worker \x1b[1m${workerName}\x1b[0m ...`)

  await cloudFlareRequest(
    'Worker deployment',
    apiToken,
    'PUT',
    `/accounts/${account}/workers/scripts/${workerName}`,
    headers,
    payload
  )

  spinner.succeed(`Worker \x1b[1m${workerName}\x1b[0m successfully deployed.`)
}

async function getWorkersDomain(spinner: Ora, account: string, apiToken: string): Promise<string> {
  spinner.start(`Getting workers domain for account \x1b[1m${account}\x1b[0m ...`)

  const response = await cloudFlareRequest(
    'Querying worker domain',
    apiToken,
    'GET',
    `/accounts/${account}/workers/subdomain`
  )

  spinner.succeed(`Workers domain for account \x1b[1m${account}\x1b[0m successfully retrieved.`)
  return response.result.subdomain
}

async function isWorkersSubdomainEnabled(
  spinner: Ora,
  account: string,
  apiToken: string,
  workerName: string
): Promise<boolean> {
  spinner.start(`Checking if workers subdomain is enabled for worker \x1b[1m${workerName}\x1b[0m ...`)

  const response = await cloudFlareRequest(
    'Querying worker subdomain status',
    apiToken,
    'GET',
    `/accounts/${account}/workers/services/${workerName}/environments/production/subdomain`
  )

  spinner.succeed(`Subdomain status check for worker \x1b[1m${workerName}\x1b[0m successfully completed.`)
  return response.result.enabled === true
}

async function enableWorkersSubdomain(
  spinner: Ora,
  account: string,
  apiToken: string,
  workerName: string
): Promise<void> {
  spinner.start(`Enabling subdomain for worker \x1b[1m${workerName}\x1b[0m ...`)

  await cloudFlareRequest(
    'Enabling subdomain for worker',
    apiToken,
    'POST',
    `/accounts/${account}/workers/services/${workerName}/environments/production/subdomain`,
    {
      'content-type': 'application/json'
    },
    JSON.stringify({ enabled: true })
  )

  spinner.succeed(`Subdomain for worker \x1b[1m${workerName}\x1b[0m successfully enabled.`)
}

export async function deploy(
  spinner: Ora,
  sourcePath: string,
  configuration: V01Configuration,
  rootDirectory: string
): Promise<string> {
  configuration.deploy.configuration = {
    workerName: basename(sourcePath, '.js'),
    useWorkerDomain: true,
    ...configuration.deploy.configuration
  }

  const account = process.env.CLOUDFLARE_ACCOUNT
  const apiToken = process.env.CLOUDFLARE_API_TOKEN

  const { workerName, useWorkerDomain, r2: r2Bucket, kv: kvNamespace } = configuration.deploy.configuration

  if (!account || !apiToken) {
    throw new Error(
      'Please provide CloudFlare credentials in the CLOUDFLARE_ACCOUNT and CLOUDFLARE_API_TOKEN environment variables.'
    )
  }

  let deployPayload: DeployPayload = {
    payload: await readFile(sourcePath),
    headers: { 'content-type': 'application/javascript' }
  }

  if (r2Bucket) {
    deployPayload = await deployWithR2(
      spinner,
      configuration,
      account,
      apiToken,
      r2Bucket,
      deployPayload.payload,
      rootDirectory
    )
  } else if (kvNamespace) {
    deployPayload = await deployWithKV(
      spinner,
      configuration,
      account,
      apiToken,
      kvNamespace,
      deployPayload.payload,
      rootDirectory
    )
  }

  await createWorker(spinner, account, apiToken, workerName, deployPayload.payload, deployPayload.headers)
  const domain = await getWorkersDomain(spinner, account, apiToken)

  if (useWorkerDomain && !(await isWorkersSubdomainEnabled(spinner, account, apiToken, workerName))) {
    await enableWorkersSubdomain(spinner, account, apiToken, workerName)
  }

  return `https://${workerName}.${domain}.workers.dev`
}
