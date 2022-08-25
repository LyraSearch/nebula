import FormData from 'form-data'
import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { IncomingHttpHeaders } from 'node:http'
import { join } from 'node:path'
import { V01Configuration } from '../../configuration.js'
import { cloudFlareRequest, DeployPayload } from './common.js'

function sha256(contents: Buffer | string): string {
  return createHash('sha256').update(contents).digest('hex')
}

function hmacSha256(key: string | Buffer, contents: Buffer | string): Buffer {
  return createHmac('sha256', key).update(contents).digest()
}

function encodeQueryString(raw: string): string {
  const query = new URLSearchParams(raw)

  return [...query.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

async function ensureR2Bucket(account: string, apiToken: string, name: string): Promise<void> {
  try {
    await cloudFlareRequest(
      apiToken,
      'POST',
      `/accounts/${account}/r2/buckets`,
      'Bucket creation failed',
      JSON.stringify({ name }),
      {
        'content-type': 'application/json'
      }
    )
  } catch (e) {
    if ('response' in e) {
      if (e.response.errors?.[0]?.code === 10004) {
        return
      }
    }

    throw e
  }
}

async function uploadR2Data(
  account: string,
  id: string,
  key: string,
  bucket: string,
  name: string,
  data: Buffer
): Promise<void> {
  // // Sign the request using AWS S3 algorithm
  const service = 's3'
  const region = 'auto'
  const payloadHash = 'UNSIGNED-PAYLOAD'
  const host = `${bucket}.${account}.r2.cloudflarestorage.com`
  const rawUrl = `https://${host}/${name}`

  const headers: IncomingHttpHeaders = {
    'content-type': 'application/json',
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': new Date()
      .toISOString()
      .replace(/\.\d{0,3}/, '')
      .replace(/[:-]/g, ''),
    host
  }

  // Create the CanonicalRequest
  const url = new URL(rawUrl)
  const path = encodeURIComponent(url.pathname).replaceAll('%2F', '/')
  const canonicalRequestComponents = ['PUT', path, encodeQueryString(url.search)]
  const signedHeadersComponents = []

  const sortedHeaders = Object.entries(headers).sort((a, b) => a[0].localeCompare(b[0]))

  for (const header of sortedHeaders) {
    canonicalRequestComponents.push(`${header[0]}:${header[1]}`)
    signedHeadersComponents.push(header[0])
  }

  const signedHeaders = signedHeadersComponents.join(';')

  canonicalRequestComponents.push('', signedHeaders, payloadHash as string)
  const canonicalRequest = canonicalRequestComponents.join('\n')

  // Create the StringToSign
  const timestamp = headers['x-amz-date'] as string
  const date = timestamp.slice(0, 8)
  const scope = `${date}/${region}/${service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', timestamp, scope, sha256(canonicalRequest)].join('\n')

  // Calculate signature
  const dateKey = hmacSha256(`AWS4${key}`, date)
  const dateRegionKey = hmacSha256(dateKey, region)
  const dateRegionServiceKey = hmacSha256(dateRegionKey, service)
  const signingKey = hmacSha256(dateRegionServiceKey, 'aws4_request')
  const signature = hmacSha256(signingKey, stringToSign).toString('hex')

  // Perform the request
  return cloudFlareRequest('', 'PUT', rawUrl, 'Bucket upload failed', data, {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${id}/${date}/${region}/${service}/aws4_request,SignedHeaders=${signedHeaders},Signature=${signature}`
  })
}

export async function deployWithR2(
  configuration: V01Configuration,
  account: string,
  apiToken: string,
  bucket: string,
  payload: Buffer
): Promise<DeployPayload> {
  const r2Id = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const r2Secret = process.env.CLOUDFLARE_R2_ACCESS_KEY_SECRET

  if (!r2Id || !r2Secret) {
    throw new Error(
      'Please provide R2 credentials in the CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_ACCESS_KEY_SECRET environment variable.'
    )
  }

  // Ensure the bucket and upload data
  await ensureR2Bucket(account, apiToken, bucket)

  const data = await readFile(join(process.cwd(), configuration.output.directory, configuration.output.dataName))
  await uploadR2Data(account, r2Id, r2Secret, bucket, 'data', data)

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
