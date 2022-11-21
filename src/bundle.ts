import { create, insertBatch, Lyra } from '@lyrasearch/lyra'
import { exportInstance } from '@lyrasearch/plugin-data-persistence'
import { Command } from 'commander'
import { build, BuildResult } from 'esbuild'
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import ora from 'ora'
import { Input, parseLyraConfiguration, V01Configuration } from './configuration.js'
import { NOT_WRITABLE, UNSUPPORTED_PLATFORM, UNSUPPORTED_SOURCE } from './errors.js'
import * as aws from './targets/aws-lambda/index.js'
import * as cloudflare from './targets/cloudflare-workers/index.js'

// Create a file in the same folder of the existing file with extensions cjs in order to be able to require it
async function getDataFromCJS(absoluteSourcePath: string): Promise<any> {
  const cjsSourcePath = absoluteSourcePath + '-nebula-temp.cjs'

  try {
    await copyFile(absoluteSourcePath, cjsSourcePath)
  } catch (e) {
    throw new Error(NOT_WRITABLE(dirname(cjsSourcePath)))
  }

  try {
    // Require the CJS file
    const require = createRequire(import.meta.url)
    return require(cjsSourcePath)
  } finally {
    await rm(cjsSourcePath)
  }
}

async function getData(data: Input, basePath: string): Promise<any> {
  // Parse
  const absoluteSourcePath = join(basePath, data.path)

  switch (data.type ?? 'javascript') {
    case 'json': {
      const parsed = JSON.parse(await readFile(absoluteSourcePath, 'utf-8'))

      return Array.isArray(parsed) ? parsed : parsed[data.configuration?.rootKey ?? 'data']
    }
    case 'javascript': {
      let getter

      try {
        getter = await import(absoluteSourcePath)
      } catch (e) {
        if (!e.message.includes('module is not defined in ES module scope')) {
          throw e
        }

        getter = await getDataFromCJS(absoluteSourcePath)
      }

      if (typeof getter !== 'function' && typeof getter.default === 'function') {
        getter = getter.default
      }

      return getter()
    }
    default:
      throw new Error(UNSUPPORTED_SOURCE(data.path))
  }
}

async function createLyraInstance(configuration: V01Configuration, basePath: string): Promise<Lyra<any>> {
  const lyra = create({ defaultLanguage: 'english', ...configuration })
  const data = await getData(configuration.input, basePath)

  await insertBatch(lyra, data)

  return lyra
}

function bundleCode(source: string, destination: string): Promise<BuildResult> {
  const nebulaRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '')

  return build({
    entryPoints: [source],
    outfile: destination,
    bundle: true,
    platform: 'node',
    minify: true,
    nodePaths: [resolve(nebulaRoot, '../node_modules')]
  })
}

export async function bundle(this: Command, rawYmlPath: string, _args: Record<string, any>): Promise<void> {
  const spinnner = ora('Creating an optimized bundle ...').start()

  try {
    const [configuration, outputDirectory, ymlPath] = await parseLyraConfiguration(this, rawYmlPath)

    // Create Lyra and export the data
    const instance = await createLyraInstance(configuration, dirname(ymlPath))
    const serializedLyraInstance = exportInstance(instance, 'json')

    let template: string

    switch (configuration.deploy.platform) {
      case 'cloudflare':
        template = await cloudflare.bundle(configuration, serializedLyraInstance)
        break
      case 'aws-lambda':
        template = await aws.bundle(configuration, serializedLyraInstance)
        break
      default:
        throw new Error(UNSUPPORTED_PLATFORM(configuration.deploy.platform))
    }

    const sourcePath = join(process.cwd(), 'nebula-bundle.tmp.js')
    const destinationPath = join(outputDirectory, configuration.output.name)

    await writeFile(sourcePath, template)
    await bundleCode(sourcePath, destinationPath)
    await rm(sourcePath)

    if (configuration.deploy.configuration.r2 || configuration.deploy.configuration.kv) {
      await writeFile(join(outputDirectory, configuration.output.dataName), serializedLyraInstance)
    }

    spinnner.info(`Lyra is now bundled into \x1b[1m${relative(process.cwd(), destinationPath)}\x1b[0m`)
    spinnner.succeed('Lyra has been built successfully!')
  } catch (e) {
    spinnner?.fail(e.message)
    process.exit(1)
  }
}
