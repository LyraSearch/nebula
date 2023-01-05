import { create, insertBatch, Lyra } from '@lyrasearch/lyra'
import { exportInstance } from '@lyrasearch/plugin-data-persistence'
import rollupCommonJs from '@rollup/plugin-commonjs'
import rollupNodeResolve from '@rollup/plugin-node-resolve'
import { transform, transformFile } from '@swc/core'
import { Command } from 'commander'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ora from 'ora'
import { rollup } from 'rollup'
import { BundledLyra, Input, parseLyraConfiguration, V01Configuration } from './configuration.js'
import { fatal, NOT_WRITABLE, UNSUPPORTED_PLATFORM, UNSUPPORTED_SOURCE } from './errors.js'
import * as aws from './targets/aws-lambda/index.js'
import * as azure from './targets/azure/index.js'
import * as cloudflare from './targets/cloudflare-workers/index.js'
import * as custom from './targets/custom/index.js'
import * as gcp from './targets/google-cloud/index.js'

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
  const absoluteSourcePath = resolve(basePath, data.path)

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

async function bundleCode(source: string, destinationPath: string): Promise<void> {
  // Transpile Typescript to Javascript
  const transpiled = await transform(source, {
    jsc: {
      target: 'es2022',
      parser: {
        syntax: 'typescript',
        tsx: false,
        dynamicImport: true
      }
    }
  })

  await writeFile(destinationPath, transpiled.code, 'utf8')

  // Now bundle everything using rollup
  const bundled = await rollup({
    input: destinationPath,
    plugins: [
      rollupNodeResolve({
        modulePaths: [fileURLToPath(new URL('../node_modules', import.meta.url))]
      }),
      rollupCommonJs()
    ],
    onwarn() {}
  })

  await bundled.write({
    file: destinationPath,
    format: 'es'
  })

  // Finally, transpile again with swc to minify
  const minified = await transformFile(destinationPath, { jsc: { target: 'es2022' }, minify: true })

  await writeFile(destinationPath, minified.code, 'utf8')
}

export async function clean(this: Command, rawYmlPath: string, _args: Record<string, any>): Promise<void> {
  const spinner = ora('Removing all Nebula artifacts ...').start()

  try {
    const [configuration, outputDirectory] = await parseLyraConfiguration(this, rawYmlPath)

    // Create Lyra and export the data
    const destinationPath = resolve(outputDirectory, configuration.output.name)
    const dataDestinationPath = resolve(outputDirectory, configuration.output.dataName)

    await rm(destinationPath, { force: true })
    spinner.info(`Deleted file \x1b[1m${relative(process.cwd(), destinationPath)}\x1b[0m.`)

    await rm(dataDestinationPath, { force: true })
    spinner.info(`Deleted file \x1b[1m${relative(process.cwd(), dataDestinationPath)}\x1b[0m.`)

    spinner.succeed('All artifacts have been successfully deleted.')
  } catch (e) {
    fatal(spinner, e.message)
  }
}

export async function bundle(this: Command, rawYmlPath: string, _args: Record<string, any>): Promise<void> {
  const spinner = ora('Creating an optimized bundle ...').start()

  try {
    const [configuration, outputDirectory, ymlPath] = await parseLyraConfiguration(this, rawYmlPath)

    // Create Lyra and export the data
    const instance = await createLyraInstance(configuration, dirname(ymlPath))
    const serializedLyraInstance = exportInstance(instance, 'json')

    let bundle: BundledLyra

    if (configuration.deploy.platform) {
      switch (configuration.deploy.platform) {
        case 'cloudflare':
          bundle = await cloudflare.bundle(configuration, serializedLyraInstance)
          break
        case 'aws-lambda':
          bundle = await aws.bundle(configuration, serializedLyraInstance)
          break
        case 'google-cloud':
          bundle = await gcp.bundle(configuration, serializedLyraInstance)
          break
        case 'azure':
          bundle = await azure.bundle(configuration, serializedLyraInstance)
          break
        case 'custom':
          bundle = await custom.bundle(configuration, serializedLyraInstance)
          break
        default:
          throw new Error(UNSUPPORTED_PLATFORM(configuration.deploy.platform))
      }
    } else {
      bundle = await custom.bundleStandalone(configuration, serializedLyraInstance)
    }

    const destinationPath = resolve(outputDirectory, configuration.output.name)

    await mkdir(dirname(destinationPath), { recursive: true })
    await bundleCode(bundle.template, destinationPath)

    if (bundle.afterBuild) {
      await bundle.afterBuild(spinner, destinationPath)
    }

    if (bundle.hasSeparateData) {
      await writeFile(resolve(outputDirectory, configuration.output.dataName), serializedLyraInstance)
    }

    spinner.info(`Lyra is now bundled into \x1b[1m${relative(process.cwd(), destinationPath)}\x1b[0m`)
    spinner.succeed('Lyra has been successfully built.')
  } catch (e) {
    fatal(spinner, e.message)
  }
}
