export function template(data: string | Buffer): string {
  return `
  const { create, search, load } = require('@nearform/lyra')
  
  const data = ${data}
    
  const lyra = create({
    schema: {
      __placeholder: 'string'
    },
    edge: true
  })
  
  load(lyra, data)
  
  async function handleSearch(request) {
    const { term, limit = 10, offset = 0, tolerance = 0, exact = false, properties = "*" } = await request.json();
  
    if (!term) {
      return new Response('Missing term')
    }
  
    const results = search(lyra, { term, limit, offset, tolerance, exact, properties })
  
    delete results.elapsed
  
    return new Response(JSON.stringify(results), { 'content-type': 'application/json', status: 200 })
  }
  
  addEventListener("fetch", event => {
    const { request } = event;
    return event.respondWith(handleSearch(request));
  })
    `
}