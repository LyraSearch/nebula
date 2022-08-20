import type { V01Configuration } from 'types/configuration'
import { writeFileSync } from 'fs'
import { join } from 'path'
import webpack from 'webpack'
import { create, insert } from '@nearform/lyra/dist/cjs/lyra'
import { exportInstance } from '@lyrasearch/plugin-data-persistence'
import { getDataFromSource } from '../data/source'

function createInstance ({ schema }: V01Configuration) {
  return create({
    schema
  })
}

async function createLyraInstance (configuration: V01Configuration) {
  const lyra = createInstance(configuration)
  const data = await getDataFromSource(configuration.data.source)

  for (const item of data) {
    insert(lyra, item)
  }

  return lyra
}

export async function bundle(configuration: V01Configuration) {
  const instance = await createLyraInstance(configuration)
  const serializedLyraInstance = exportInstance(instance, 'json')

  const intermediateCode = `
const { create, search, load } = require('@nearform/lyra')

const data = ${serializedLyraInstance}
  
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

  return new Response(JSON.stringify(results), { 'content-type': 'application/json', status: 200 })
}

addEventListener("fetch", event => {
  const { request } = event;
  return event.respondWith(handleSearch(request));
})
  `

  const tmpFilePath = join(process.cwd(), 'tmp.index.js')

  writeFileSync(tmpFilePath, intermediateCode)

  webpack({
    mode: 'none',
    entry: [tmpFilePath, join(process.cwd(), 'node_modules/@nearform/lyra/dist/cjs/lyra.js')],
    output: {
      library: 'lyra',
      libraryTarget: 'umd',
      filename: 'bundled.js',
      path: join(process.cwd(), 'dist'),
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: "defaults" }]
              ]
            }
          }
        }
      ]
    }
  }, (err) => console.log(err))
}