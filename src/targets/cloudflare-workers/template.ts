import { create, load, search, SearchParams, SearchResult } from '@nearform/lyra'

// @ts-expect-error
const data = __DATA__

const lyra = create({
  schema: {
    __placeholder: 'string'
  },
  edge: true
})

load(lyra, data)

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

async function handleSearch(request: Request): Promise<Response> {
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
}

addEventListener('fetch', (event: any) => event.respondWith(handleSearch(event.request)))
