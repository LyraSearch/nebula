import { create, load, Lyra, search, SearchParams, SearchResult } from '@lyrasearch/lyra'
import type { Request } from 'express'
import type { IncomingHttpHeaders } from 'node:http'

interface Response {
  status: number
  headers: IncomingHttpHeaders
  body: string
}

function parseNumber(raw: string | undefined, def: number, min: number): number {
  if (typeof raw !== 'string' || !raw.length) {
    return def
  }

  const parsed = parseInt(raw, 10)

  return isNaN(parsed) || parsed < min ? def : parsed
}

function createResponse(status: number, data: unknown | undefined, error?: string): Response {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ success: status < 400, data, error })
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function restoreAzureStorageBlob(instance: Lyra<any>): Promise<void> {
  try {
    const url = new URL('__URL__')

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(
        `Fetching data from Azure Storage failed with HTTP error ${response.status}\n\n${await response.text()}`
      )
    }

    load(instance, await response.json())
  } catch (e) {
    throw new Error(`Fetching blob from Azure Storage failed with error: ${e.message}`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function restoreEmbedded(instance: Lyra<any>): void {
  // @ts-expect-error
  load(instance, __DATA__)
}

export async function lyraHandler(_: unknown, req: Request & { rawBody: string }): Promise<Response> {
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
        return createResponse(400, undefined, 'Malformed JSON request body.')
      }

      try {
        params = JSON.parse(req.rawBody)
      } catch {
        return createResponse(400, undefined, 'Malformed JSON request body.')
      }
    }

    if (!params.term) {
      return createResponse(400, undefined, 'Missing term parameter.')
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
