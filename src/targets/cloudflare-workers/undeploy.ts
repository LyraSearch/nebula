import { Ora } from 'ora'
import { V01Configuration } from '../../configuration.js'
import { cloudFlareRequest } from './common.js'
import { deleteKVNamespace } from './kv.js'
import { deleteR2Bucket } from './r2.js'

async function deleteWorker(spinner: Ora, account: string, apiToken: string, workerName: string): Promise<void> {
  spinner.start(`Deleting worker \x1b[1m${workerName}\x1b[0m ...`)

  try {
    await cloudFlareRequest(
      'Deleting worker',
      apiToken,
      'DELETE',
      `/accounts/${account}/workers/scripts/${workerName}`,
      {}
    )

    spinner.succeed(`Worker \x1b[1m${workerName}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (e.response?.errors?.[0].code !== 10007) {
      throw e
    }

    spinner.info(`Worker \x1b[1m${workerName}\x1b[0m has been already deleted.`)
  }
}

export async function undeploy(spinner: Ora, configuration: V01Configuration): Promise<void> {
  const account = process.env.CLOUDFLARE_ACCOUNT
  const apiToken = process.env.CLOUDFLARE_API_TOKEN

  const { workerName, r2: r2Bucket, kv: kvNamespace } = configuration.deploy.configuration

  if (!account || !apiToken) {
    throw new Error(
      'Please provide CloudFlare credentials in the CLOUDFLARE_ACCOUNT and CLOUDFLARE_API_TOKEN environment variables.'
    )
  }

  await deleteWorker(spinner, account, apiToken, workerName)

  if (r2Bucket) {
    await deleteR2Bucket(spinner, account, apiToken, r2Bucket)
  }

  if (kvNamespace) {
    await deleteKVNamespace(spinner, account, apiToken, kvNamespace)
  }
}
