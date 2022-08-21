import type { V01Configuration } from 'types/configuration'
import { rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import webpack from 'webpack'
import colors from 'ansi-colors'
import ora from 'ora'
import { create, insert } from '@nearform/lyra/dist/cjs/lyra'
import { exportInstance } from '@lyrasearch/plugin-data-persistence'
import { getDataFromSource } from '../data/source'
import { template as clouflareTemplate } from './targets/cloudflare-workers/template'
import { UNSUPPORTED_PLATFORM } from '../errors'

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

function runWebpack(tmpFilePath: string) {
  webpack({
    mode: 'production',
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
  }, (err) => {
    if (err) {
      console.error(err)
    } else {
      console.log(colors.green('Lyra bundle generated successfully'))
    }
  })
}

export async function bundle(configuration: V01Configuration) {
  const buildingSpinner = ora('Creating an optimized bundle').start()
  const instance = await createLyraInstance(configuration)
  const serializedLyraInstance = exportInstance(instance, 'json')
  let intermediateCode: string

  switch (configuration.target.platform) {
    case 'cloudflare':
      intermediateCode = clouflareTemplate(serializedLyraInstance)
      break
    default:
      throw new Error(UNSUPPORTED_PLATFORM(configuration.target.platform))
  }

  const tmpFilePath = join(process.cwd(), 'tmp.index.js')

  writeFileSync(tmpFilePath, intermediateCode)
  runWebpack(tmpFilePath)
  rmSync(tmpFilePath)
  buildingSpinner.stop()
}