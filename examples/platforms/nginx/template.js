import 'core-js/actual/array/from'
import 'core-js/actual/map'
import 'core-js/actual/object/has-own'
import 'core-js/actual/set'

import { create, load, search } from '@lyrasearch/lyra'

function parseNumber(raw, def, min) {
  if (typeof raw !== 'string' || !raw.length) {
    return def
  }

  const parsed = parseInt(raw, 10)

  return isNaN(parsed) || parsed < min ? def : parsed
}

function createResponse(request, statusCode, data, error) {
  request.headersOut['content-type'] = 'application/json'

  request.return(200, JSON.stringify({ success: statusCode < 400, data, error }))
}

function restoreEmbedded(instance) {
  load(instance, __DATA__)
}

export default async function (request) {
  try {
    const lyra = create({
      schema: {
        __placeholder: 'string'
      },
      edge: true
    })

    await restore__DATA_TYPE__(lyra)

    let params

    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      params = request.args
    } else {
      if (!request.headersIn['content-type']?.startsWith('application/json')) {
        return createResponse(request, 400, undefined, 'Malformed JSON request body.')
      }

      try {
        params = JSON.parse(request.requestText)
      } catch {
        return createResponse(request, 400, undefined, 'Malformed JSON request body.')
      }
    }

    if (!params.term) {
      return createResponse(request, 400, undefined, 'Missing term parameter.')
    }

    params.limit = parseNumber(params.limit, 10, 1)
    params.offset = parseNumber(params.offset, 0, 0)
    params.tolerance = parseNumber(params.tolerance, 0, 0)
    params.exact = params.exact?.match(/^(?:yes|y|true|t|on|1)$/) ?? false
    params.properties = params.properties || '*'

    const results = search(lyra, params)
    results.elapsed = undefined

    return createResponse(request, 200, results)
  } catch (e) {
    return createResponse(request, 500, undefined, e.message)
  }
}
