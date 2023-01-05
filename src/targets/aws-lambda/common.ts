import { IncomingHttpHeaders } from 'node:http'
import undici, { Dispatcher } from 'undici'
import { signRequest } from '../common/aws-signing.js'

export interface DeployPayload {
  payload: Buffer
  headers: IncomingHttpHeaders
}

export const awsJsonContentType = 'application/x-amz-json-1.1'

export function queryStringRequest(args: Record<string, string>, path: string = '/'): string {
  return `${path}?${new URLSearchParams(args).toString()}`
}

export const lambdaExecutionRole = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'

export function functionRole(name: string): string {
  return `${name}-role-execution`
}

export async function awsApiRequest(
  errorPrefix: string,
  id: string,
  key: string,
  region: string,
  service: string,
  method: Dispatcher.HttpMethod,
  path: string,
  headers: IncomingHttpHeaders = {},
  body?: Buffer | string
): Promise<any> {
  const apiService = service
  service = service.split('.').pop()!

  const apiRegion = region === 'none' ? '' : `.${region}`
  if (region === 'none') {
    region = 'us-east-1'
  }

  const url = `https://${apiService}${apiRegion}.amazonaws.com/${path.replace(/^\//, '')}`

  // Authenticate the request
  headers = signRequest(id, key, service, region, url, method, headers, body)

  // Make the request
  const {
    statusCode,
    headers: responseHeaders,
    body: responseBody
  } = await undici.request(url, {
    method,
    headers,
    body
  })

  // Get the response
  let data = Buffer.alloc(0)
  for await (const chunk of responseBody) {
    data = Buffer.concat([data, chunk])
  }

  if (
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    responseHeaders['content-type']?.startsWith('application/json') ||
    responseHeaders['content-type']?.startsWith(awsJsonContentType)
  ) {
    // For JSON responses, look at the success field and ignore the statusCode
    const response = data.length > 0 ? JSON.parse(data.toString('utf-8')) : ''

    if (statusCode >= 400) {
      const error = new Error(
        `${errorPrefix} failed with HTTP error ${statusCode}\n\n${JSON.stringify(response, null, 2)}`
      )

      Object.defineProperty(error, 'response', {
        value: response,
        writable: false,
        enumerable: true
      })

      throw error
    }

    return response
  } else {
    // For non JSON response, use the statusCode to check whether it was a failure
    const response = data.toString('utf-8')

    if (statusCode >= 400) {
      const error = new Error(`${errorPrefix} failed with HTTP error ${statusCode}\n\n${response}`)

      Object.defineProperty(error, 'response', {
        value: response,
        writable: false,
        enumerable: true
      })

      throw error
    }

    return response
  }
}
