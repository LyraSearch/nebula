import { createHash, createHmac } from 'node:crypto'
import { IncomingHttpHeaders } from 'node:http'
import { cloudFlareRequest } from './common.js'

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

export async function ensureR2Bucket(account: string, apiToken: string, name: string): Promise<void> {
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

export async function uploadR2Data(
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
