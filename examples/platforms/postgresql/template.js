import { create, load, search } from '@lyrasearch/lyra'

function parseNumber(raw, def, min) {
  if (typeof raw !== 'string' || !raw.length) {
    return def
  }

  const parsed = parseInt(raw, 10)

  return isNaN(parsed) || parsed < min ? def : parsed
}

function restoreEmbedded(instance) {
  load(instance, __DATA__)
}

async function lyraHandler(params) {
  params.limit = parseNumber(params.limit, 10, 1)
  params.offset = parseNumber(params.offset, 0, 0)
  params.tolerance = parseNumber(params.tolerance, 0, 0)
  params.properties = params.properties || '*'

  const lyra = create({
    schema: {
      __placeholder: 'string'
    },
    edge: true
  })

  await restore__DATA_TYPE__(lyra)

  const results = search(lyra, params)
  results.elapsed = undefined
  return results
}

// Note: we cannot use async/await here as the entire file is wrapped in a non-async function
lyraHandler({
  term: _term,
  limit: _limit,
  offset: _offset,
  tolerance: _tolerance,
  exact: _exact,
  properties: _properties
}).then(results => {
  for (const hit of results.hits) {
    plv8.return_next({ id: hit.id, name: hit.document.name })
  }
})
