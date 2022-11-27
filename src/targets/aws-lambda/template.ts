import { create, load, Lyra, search, SearchParams, SearchResult } from '@lyrasearch/lyra'
import { createHash, createHmac } from 'node:crypto'

interface LambdaEvent {
  requestContext: {
    http: {
      method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'OPTIONS' | 'TRACE' | 'PATCH'
      path: string
    }
  }
  queryStringParameters: Record<string, string>
  body: string
}

interface LambdaResponse {
  statusCode: number
  headers: Record<string, string>
  isBase64Encoded: boolean
  body: string
}

function sha256(contents: Buffer | string): string {
  return createHash('sha256').update(contents).digest('hex')
}

function hmacSha256(key: string | Buffer, contents: Buffer | string): Buffer {
  return createHmac('sha256', key).update(contents).digest()
}

function parseNumber(raw: string | undefined, def: number, min: number): number {
  if (typeof raw !== 'string' || !raw.length) {
    return def
  }

  const parsed = parseInt(raw, 10)

  return isNaN(parsed) || parsed < min ? def : parsed
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function restoreEmbedded(instance: Lyra<any>): void {
  // @ts-expect-error
  load(instance, __DATA__)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function restoreS3(instance: Lyra<any>): Promise<void> {
  try {
    const { AWS_ACCESS_KEY_ID: id, AWS_SECRET_ACCESS_KEY: key, AWS_SESSION_TOKEN: sessionToken } = process.env

    const url = new URL('https://__BUCKET__.s3.__REGION__.amazonaws.com/data.json')

    const headers: Record<string, string> = {
      'x-amz-date': new Date()
        .toISOString()
        .replace(/\.\d{0,3}/, '')
        .replace(/[:-]/g, ''),
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-security-token': sessionToken!,
      host: url.hostname
    }

    // Sign the request using AWS  algorithm - See https://docs.aws.amazon.com/general/latest/gr/signing_aws_api_requests.html
    // Create the CanonicalRequest
    const canonicalRequestComponents = ['GET', url.pathname, '']
    const signedHeadersComponents = []
    const sortedHeaders = Object.entries(headers).sort((a, b) => a[0].localeCompare(b[0]))

    for (const header of sortedHeaders) {
      canonicalRequestComponents.push(`${header[0]}:${header[1]}`)
      signedHeadersComponents.push(header[0])
    }

    const signedHeaders = signedHeadersComponents.join(';')
    canonicalRequestComponents.push('', signedHeaders, 'UNSIGNED-PAYLOAD')
    const canonicalRequest = canonicalRequestComponents.join('\n')

    // Create the StringToSign
    const timestamp = headers['x-amz-date']
    const date = timestamp.slice(0, 8)
    const scope = `${date}/__REGION__/s3/aws4_request`
    const stringToSign = ['AWS4-HMAC-SHA256', timestamp, scope, sha256(canonicalRequest)].join('\n')

    // Calculate signature
    const dateKey = hmacSha256(`AWS4${key}`, date)
    const dateRegionKey = hmacSha256(dateKey, '__REGION__')
    const dateRegionServiceKey = hmacSha256(dateRegionKey, 's3')
    const signingKey = hmacSha256(dateRegionServiceKey, 'aws4_request')
    const signature = hmacSha256(signingKey, stringToSign).toString('hex')

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${id}/${date}/__REGION__/s3/aws4_request,SignedHeaders=${signedHeaders},Signature=${signature}`

    const response = await fetch(url, {
      headers
    })

    if (!response.ok) {
      throw new Error(`Fetching data from S3 failed with HTTP error ${response.status}\n\n${await response.text()}`)
    }

    load(instance, await response.json())
  } catch (e) {
    throw new Error(`Fetching data from S3 failed with error: ${e.message}`)
  }
}

function createResponse(statusCode: number, data: unknown | undefined, error?: string): LambdaResponse {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json'
    },
    isBase64Encoded: false,
    body: JSON.stringify({ success: statusCode < 400, data, error })
  }
}

export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  try {
    const lyra = create({
      schema: {
        __placeholder: 'string'
      },
      edge: true
    })

    // @ts-expect-error
    await restore__DATA_TYPE__(lyra)

    let params: Record<string, any>

    if (['GET', 'HEAD', 'OPTIONS'].includes(event.requestContext.http.method)) {
      params = event.queryStringParameters ?? {}
    } else {
      try {
        params = JSON.parse(event.body)
      } catch {
        return createResponse(400, undefined, 'Malformed JSON request body')
      }
    }

    if (!params.term) {
      return createResponse(400, undefined, 'Missing term parameter')
    }

    params.limit = parseNumber(params.limit, 10, 1)
    params.offset = parseNumber(params.offset, 0, 0)
    params.tolerance = parseNumber(params.tolerance, 0, 0)
    params.exact = params.exact?.match(/^(?:yes|y|true|t|on|1)$/) ?? false
    params.properties = params.properties || '*'

    const results: Partial<SearchResult<any>> = search(lyra, params as SearchParams<any>)
    results.elapsed = undefined

    return createResponse(200, results)
  } catch (e) {
    return createResponse(500, undefined, e.message)
  }
}
