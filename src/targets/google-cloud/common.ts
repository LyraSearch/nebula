import { IncomingHttpHeaders } from 'node:http'
import { Ora } from 'ora'
import undici, { Dispatcher } from 'undici'

interface StateMessage {
  severity: string
  message: string
}

interface FunctionInformation {
  state: string
  stateMessages: StateMessage[]
  buildConfig: {
    source: {
      storageSource: {
        bucket: string
        object: string
      }
    }
  }
  serviceConfig: {
    service: string
    uri: string
  }
}

export async function googleRequest(
  errorPrefix: string,
  apiToken: string | null,
  method: Dispatcher.HttpMethod,
  url: string,
  headers: IncomingHttpHeaders = {},
  body?: Buffer | string
): Promise<any> {
  // Use a default root URL
  if (!url.startsWith('http')) {
    url = ''
  }

  // Make the request
  const {
    statusCode,
    headers: responseHeaders,
    body: responseBody
  } = await undici.request(url, {
    method,
    headers: {
      authorization: apiToken ? `Bearer ${apiToken}` : undefined,
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

export async function refreshApiToken(spinner: Ora): Promise<string> {
  const { GCP_CLIENT_ID: id, GCP_CLIENT_SECRET: secret, GCP_REFRESH_TOKEN: refreshToken } = process.env

  if (!id || !secret || !refreshToken) {
    throw new Error(
      'Please provide Google Cloud credentials in the GCP_CLIENT_ID, GCP_CLIENT_SECRET and GCP_REFRESH_TOKEN environment variables.'
    )
  }

  spinner.start('Authenticating on Google Cloud ...')

  const body = await googleRequest(
    'Google Cloud Authentication',
    null,
    'POST',
    'https://www.googleapis.com/oauth2/v4/token',
    {
      'content-type': 'application/x-www-form-urlencoded'
    },
    new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  )

  spinner.succeed('Authenticated successfully on Google Gloud.')
  return body.access_token
}

export async function getFunctionInformation(
  spinner: Ora,
  apiToken: string,
  name: string,
  project: string,
  region: string,
  isDeleting: boolean = false,
  skipProgress: boolean = false
): Promise<FunctionInformation | null> {
  try {
    if (!skipProgress) {
      spinner.start(`Obtaining information of Google Cloud Function \x1b[1m${name}\x1b[0m ...`)
    }

    const data = await googleRequest(
      'Information of Google Cloud Function',
      apiToken,
      'GET',
      `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions/${name}`
    )

    if (!skipProgress) {
      spinner.succeed(`Information of Google Cloud function \x1b[1m${name}\x1b[0m successfully retrieved.`)
    }

    return data
  } catch (e) {
    if (e.response?.error?.code === 404 && isDeleting) {
      spinner.info(`Google Cloud Function \x1b[1m${name}\x1b[0m has been already deleted.`)
      return null
    }

    throw e
  }
}
