import { create, load, Lyra, search, SearchParams, SearchResult } from '@lyrasearch/lyra'
import type { Request, Response } from 'express'

function parseNumber(raw: string | undefined, def: number, min: number): number {
  if (typeof raw !== 'string' || !raw.length) {
    return def
  }

  const parsed = parseInt(raw, 10)

  return isNaN(parsed) || parsed < min ? def : parsed
}

function sendResponse(res: Response, statusCode: number, data: unknown | undefined, error?: string): void {
  res
    .status(statusCode)
    .type('json')
    .send(JSON.stringify({ success: statusCode < 400, data, error }))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function restoreCloudStorage(instance: Lyra<any>): Promise<void> {
  try {
    // First of all, refresh the API token
    const { GCP_CLIENT_ID: id, GCP_CLIENT_SECRET: secret, GCP_REFRESH_TOKEN: refreshToken } = process.env
    const authResponse = await fetch('https://www.googleapis.com/oauth2/v4/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: id!,
        client_secret: secret!,
        refresh_token: refreshToken!,
        grant_type: 'refresh_token'
      }).toString()
    })

    if (!authResponse.ok) {
      throw new Error(
        `Authenticating on Google Cloud failed with HTTP error ${authResponse.status}\n\n${await authResponse.text()}`
      )
    }

    const authBody = await authResponse.json()

    // Now download the data
    const url = new URL('https://storage.googleapis.com/storage/v1/b/__BUCKET__/o/data.json?alt=media')
    const response = await fetch(url, { headers: { authorization: `Bearer ${authBody.access_token}` } })

    if (!response.ok) {
      throw new Error(
        `Fetching data from Google Cloud failed with HTTP error ${response.status}\n\n${await response.text()}`
      )
    }

    load(instance, await response.json())
  } catch (e) {
    throw new Error(`Fetching data from Google Cloud failed with error: ${e.message}`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function restoreEmbedded(instance: Lyra<any>): void {
  // @ts-expect-error
  load(instance, __DATA__)
}

export async function lyraHandler(req: Request, res: Response): Promise<void> {
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

    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      params = req.query ?? {}
    } else {
      if (!req.headers['content-type']?.startsWith('application/json')) {
        return sendResponse(res, 400, undefined, 'Malformed JSON request body.')
      }

      params = req.body
    }

    if (!params.term) {
      return sendResponse(res, 400, undefined, 'Missing term parameter.')
    }

    params.limit = parseNumber(params.limit, 10, 1)
    params.offset = parseNumber(params.offset, 0, 0)
    params.tolerance = parseNumber(params.tolerance, 0, 0)
    params.exact = params.exact?.match(/^(?:yes|y|true|t|on|1)$/) ?? false
    params.properties = params.properties || '*'

    const results: Partial<SearchResult<any>> = search(lyra, params as SearchParams<any>)
    results.elapsed = undefined

    return sendResponse(res, 200, results)
  } catch (e) {
    return sendResponse(res, 500, undefined, e.message)
  }
}
