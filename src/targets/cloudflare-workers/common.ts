import { IncomingHttpHeaders } from 'node:http'
import undici, { Dispatcher } from 'undici'

export async function cloudFlareRequest(
  apiToken: string,
  method: Dispatcher.HttpMethod,
  url: string,
  errorPrefix: string,
  body?: Buffer | string,
  headers?: IncomingHttpHeaders
): Promise<any> {
  // Use a default root URL
  if (!url.startsWith('http')) {
    url = `https://api.cloudflare.com/client/v4/${url.replace(/^\//, '')}`
  }

  // Make the request
  const {
    statusCode,
    headers: responseHeaders,
    body: responseBody
  } = await undici.request(url, {
    method,
    headers: {
      authorization: `Bearer ${apiToken}`,
      ...headers
    },
    body
  })

  // Get the response
  let data = Buffer.alloc(0)
  for await (const chunk of responseBody) {
    data = Buffer.concat([data, chunk])
  }

  if (responseHeaders['content-type']?.startsWith('application/json')) {
    // For JSON responses, look at the success field and ignore the statusCode
    const response = JSON.parse(data.toString('utf-8'))

    if (!response.success) {
      const error = new Error(`${errorPrefix} with HTTP error ${statusCode}\n\n${JSON.stringify(response, null, 2)}`)
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
      const error = new Error(`${errorPrefix} with HTTP error ${statusCode}\n\n${response}`)

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
