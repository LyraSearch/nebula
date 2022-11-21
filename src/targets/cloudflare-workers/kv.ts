import FormData from 'form-data'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Ora } from 'ora'
import { V01Configuration } from '../../configuration.js'
import { cloudFlareRequest, DeployPayload } from './common.js'

async function ensureKVNamespace(spinner: Ora, account: string, apiToken: string, title: string): Promise<void> {
  try {
    spinner.start(`Making sure KV namespace \x1b[1m${title}\x1b[0m exists ...`)

    await cloudFlareRequest(
      'KV namespace creation failed',
      apiToken,
      'POST',
      `/accounts/${account}/storage/kv/namespaces`,
      {
        'content-type': 'application/json'
      },
      JSON.stringify({ title })
    )

    spinner.succeed(`KV namespace \x1b[1m${title}\x1b[0m successfully created ...`)
  } catch (e) {
    if (e.response?.errors?.[0]?.code !== 10014) {
      throw e
    }

    spinner.info(`KV namespace \x1b[1m${title}\x1b[0m already existed ...`)
  }
}

async function getKVNamespaceId(spinner: Ora, account: string, apiToken: string, title: string): Promise<string> {
  spinner.start(`Getting ID of KV namespace \x1b[1m${title}\x1b[0m ...`)

  const response = await cloudFlareRequest(
    'KV namespace ID fetching failed',
    apiToken,
    'GET',
    `/accounts/${account}/storage/kv/namespaces`
  )

  const namespace = response.result.find((r: Record<string, string>) => r.title === title)

  if (!title) {
    throw new Error(`Cannot find KV namespace with title "${title}"`)
  }

  if (namespace) {
    spinner.succeed(`ID of KV namespace \x1b[1m${title}\x1b[0m successfully retrieved.`)
  }

  return namespace?.id
}

async function uploadKVData(
  spinner: Ora,
  account: string,
  apiToken: string,
  namespace: string,
  data: Buffer
): Promise<void> {
  spinner.start(`Uploading data to KV namespace \x1b[1m${namespace}\x1b[0m.`)

  await cloudFlareRequest(
    'Data upload to KV failed',
    apiToken,
    'PUT',
    `/accounts/${account}/storage/kv/namespaces/${namespace}/values/data`,
    {},
    data
  )

  spinner.succeed(`Uploading data to KV namespace \x1b[1m${namespace}\x1b[0m successfully completed.`)
}

export async function deleteKVNamespace(spinner: Ora, account: string, apiToken: string, name: string): Promise<void> {
  const namespaceId = await getKVNamespaceId(spinner, account, apiToken, name)

  if (!namespaceId) {
    spinner.info(`KV namespace \x1b[1m${name}\x1b[0m has been already deleted.`)
    return
  }

  spinner.start(`Deleting KV namespace \x1b[1m${name}\x1b[0m ...`)

  await cloudFlareRequest(
    'KV namespace deletion failed',
    apiToken,
    'DELETE',
    `/accounts/${account}/storage/kv/namespaces/${namespaceId}`,
    {},
    ''
  )

  spinner.succeed(`KV namespace \x1b[1m${name}\x1b[0m successfully deleted ...`)
}

export async function deployWithKV(
  spinner: Ora,
  configuration: V01Configuration,
  account: string,
  apiToken: string,
  namespace: string,
  payload: Buffer,
  rootDirectory: string
): Promise<DeployPayload> {
  // Ensure the namespace and upload data
  await ensureKVNamespace(spinner, account, apiToken, namespace)
  const namespaceId = await getKVNamespaceId(spinner, account, apiToken, namespace)

  const data = await readFile(join(rootDirectory, configuration.output.dataName))
  await uploadKVData(spinner, account, apiToken, namespaceId, data)

  const form = new FormData()
  form.append('worker.js', payload, { filename: 'worker.js', contentType: 'application/javascript' })
  form.append(
    'metadata',
    JSON.stringify({
      body_part: 'worker.js',
      bindings: [{ type: 'kv_namespace', name: 'KV', namespace_id: namespaceId }]
    })
  )

  return { payload: form.getBuffer(), headers: form.getHeaders() }
}
