import { createHash, createHmac } from 'node:crypto'
import { IncomingHttpHeaders } from 'node:http'

export const s3UnsignedPayloadHash = 'UNSIGNED-PAYLOAD'

export function sha256(contents: Buffer | string): string {
  return createHash('sha256').update(contents).digest('hex')
}

export function hmacSha256(key: string | Buffer, contents: Buffer | string): Buffer {
  return createHmac('sha256', key).update(contents).digest()
}

export function encodeQueryStringComponent(raw: string): string {
  return encodeURIComponent(raw).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function encodeQueryString(raw: string): string {
  const query = new URLSearchParams(raw)

  return [...query.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${encodeQueryStringComponent(key)}=${encodeQueryStringComponent(value)}`)
    .join('&')
}

// Sign the request using AWS  algorithm - See https://docs.aws.amazon.com/general/latest/gr/signing_aws_api_requests.html
export function signRequest(
  id: string,
  key: string,
  service: string,
  region: string,
  rawUrl: string,
  method: string,
  headers: IncomingHttpHeaders,
  body?: Buffer | string
): IncomingHttpHeaders {
  const url = new URL(rawUrl)
  const noBody = typeof body === 'undefined'

  if (!('x-amz-date' in headers)) {
    headers['x-amz-date'] = new Date()
      .toISOString()
      .replace(/\.\d{0,3}/, '')
      .replace(/[:-]/g, '')
  }

  if (noBody && !('x-amz-content-sha256' in headers)) {
    headers['x-amz-content-sha256'] = s3UnsignedPayloadHash
  }

  if (!('host' in headers)) {
    headers.host = url.host
  }

  // Create the CanonicalRequest
  const path = encodeURIComponent(url.pathname).replaceAll('%2F', '/')

  const canonicalRequestComponents = [method, path, encodeQueryString(url.search)]
  const signedHeadersComponents = []

  const sortedHeaders = Object.entries(headers).sort((a, b) => a[0].localeCompare(b[0]))

  for (const header of sortedHeaders) {
    canonicalRequestComponents.push(`${header[0]}:${header[1]}`)
    signedHeadersComponents.push(header[0])
  }

  const signedHeaders = signedHeadersComponents.join(';')
  canonicalRequestComponents.push(
    '',
    signedHeaders,
    !noBody && headers['x-amz-content-sha256'] !== s3UnsignedPayloadHash ? sha256(body) : s3UnsignedPayloadHash
  )
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

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${id}/${date}/${region}/${service}/aws4_request,SignedHeaders=${signedHeaders},Signature=${signature}`
  return headers
}
