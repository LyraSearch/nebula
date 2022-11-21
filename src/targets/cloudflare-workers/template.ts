import { create, load, Lyra, search, SearchParams, SearchResult } from '@lyrasearch/lyra'

function parseNumber(raw: string | undefined, def: number, min: number): number {
  if (typeof raw !== 'string' || !raw.length) {
    return def
  }

  const parsed = parseInt(raw, 10)

  return isNaN(parsed) || parsed < min ? def : parsed
}

function createResponse(statusCode: number, data: unknown | undefined, error?: string): Response {
  return new Response(JSON.stringify({ success: statusCode < 400, data, error }), {
    status: statusCode,
    headers: { 'content-type': 'application/json' }
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function restoreKV(instance: Lyra<any>): Promise<void> {
  // @ts-expect-error
  load(instance, JSON.parse(await KV.get('data')))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function restoreR2(instance: Lyra<any>): Promise<void> {
  // @ts-expect-error
  const data = await R2.get('data.json')

  load(instance, await data.json())
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function restoreEmbedded(instance: Lyra<any>): void {
  // @ts-expect-error
  load(instance, __DATA__)
}

async function handleSearch(request: Request): Promise<Response> {
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

    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      params = Object.fromEntries(new URL(request.url).searchParams.entries())
    } else {
      try {
        params = await request.json()
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

addEventListener('fetch', (event: any) => event.respondWith(handleSearch(event.request)))
