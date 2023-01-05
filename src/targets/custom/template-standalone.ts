import { create, load, search as lyraSearch, SearchParams, SearchResult } from '@lyrasearch/lyra'

function parseNumber(raw: string | undefined, def: number, min: number): number {
  if (typeof raw !== 'string' || !raw.length) {
    return def
  }

  const parsed = parseInt(raw, 10)

  return isNaN(parsed) || parsed < min ? def : parsed
}

export async function search(params: Record<string, any>): Promise<SearchResult<any>> {
  const lyra = create({
    schema: {
      __placeholder: 'string'
    },
    edge: true
  })

  // @ts-expect-error
  await load(lyra, __DATA__)

  if (!params.term) {
    throw new Error('Missing term parameter.')
  }

  params.limit = parseNumber(params.limit, 10, 1)
  params.offset = parseNumber(params.offset, 0, 0)
  params.tolerance = parseNumber(params.tolerance, 0, 0)
  params.exact = params.exact?.match(/^(?:yes|y|true|t|on|1)$/) ?? false
  params.properties = params.properties || '*'

  return lyraSearch(lyra, params as SearchParams<any>)
}
