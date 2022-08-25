import FormData from 'form-data'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { V01Configuration } from '../../configuration.js'
import { cloudFlareRequest, DeployPayload } from './common.js'

async function ensureKVNamespace(account: string, apiToken: string, title: string): Promise<void> {
  try {
    await cloudFlareRequest(
      apiToken,
      'POST',
      `/accounts/${account}/storage/kv/namespaces`,
      'KV Namespace creation failed',
      JSON.stringify({ title }),
      {
        'content-type': 'application/json'
      }
    )
  } catch (e) {
    if ('response' in e) {
      if (e.response.errors?.[0]?.code === 10014) {
        return
      }
    }

    throw e
  }
}

async function getKVNamespaceId(account: string, apiToken: string, title: string): Promise<string> {
  const response = await cloudFlareRequest(
    apiToken,
    'GET',
    `/accounts/${account}/storage/kv/namespaces`,
    'KV Namespace ID fetching failed'
  )

  const namespace = response.result.find((r: Record<string, string>) => r.title === title)

  if (!title) {
    throw new Error(`Cannot find KV namespace with title "${title}"`)
  }

  return namespace.id
}

async function uploadKVData(account: string, apiToken: string, namespace: string, data: Buffer): Promise<void> {
  try {
    await cloudFlareRequest(
      apiToken,
      'PUT',
      `/accounts/${account}/storage/kv/namespaces/${namespace}/values/data`,
      'KV Upload failed',
      data
    )
  } catch (e) {
    if ('response' in e) {
      if (e.response.errors?.[0]?.code === 10014) {
        return
      }
    }

    throw e
  }
}

export async function deployWithKV(
  configuration: V01Configuration,
  account: string,
  apiToken: string,
  namespace: string,
  payload: Buffer
): Promise<DeployPayload> {
  // Ensure the namespace and upload data
  await ensureKVNamespace(account, apiToken, namespace)
  const namespaceId = await getKVNamespaceId(account, apiToken, namespace)

  const data = await readFile(join(process.cwd(), configuration.output.directory, configuration.output.dataName))
  await uploadKVData(account, apiToken, namespaceId, data)

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
