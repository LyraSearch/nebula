import { exportInstance } from '@lyrasearch/plugin-data-persistence'
import { create, insert, Lyra } from '@nearform/lyra'
import { build, BuildResult } from 'esbuild'
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import ora from 'ora'
import { parseLyraConfiguration, V01Configuration } from './configuration.js'
import { NOT_WRITABLE, UNSUPPORTED_PLATFORM } from './errors.js'

// Create a file in the same folder of the existing file with extensions cjs in order to be able to require it
async function importCJSDataSource(absoluteSourcePath: string): Promise<any> {
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

async function getDataFromSource(sourcePath: string, basePath: string): Promise<any> {
  const absoluteSourcePath = join(basePath, sourcePath)
  let getDynamicData

  try {
    getDynamicData = await import(absoluteSourcePath)
  } catch (e) {
    if (!e.message.includes('module is not defined in ES module scope')) {
      throw e
    }

    getDynamicData = await importCJSDataSource(absoluteSourcePath)
  }

  if (typeof getDynamicData !== 'function' && typeof getDynamicData.default === 'function') {
    getDynamicData = getDynamicData.default
  }

  return getDynamicData()
}

async function createLyraInstance(configuration: V01Configuration, basePath: string): Promise<Lyra<any>> {
  const lyra = create(configuration)
  const data = await getDataFromSource(configuration.data.source, basePath)

  await new Promise<void>(resolve => {
    let i = 0

    function insertBatch(): void {
      const batch = data.slice(i * 1000, (i + 1) * 1000)
      i++

      if (!batch.length) {
        return resolve()
      }

      for (const item of batch) {
        insert(lyra, item)
      }

      setImmediate(insertBatch)
    }

    setImmediate(insertBatch)
  })

  for (const item of data) {
    insert(lyra, item)
  }

  return lyra
}

function bundleCode(source: string, destination: string): Promise<BuildResult> {
  return build({
    entryPoints: [source],
    outfile: destination,
    bundle: true,
    platform: 'node',
    minify: true
  })
}

export async function bundle(ymlPath: string, _args: Record<string, any>): Promise<void> {
  const buildingSpinner = ora('Creating an optimized bundle ...').start()

  try {
    ymlPath = resolve(process.cwd(), ymlPath ?? 'lyra.yml')
    const configuration = await parseLyraConfiguration(ymlPath)

    // Create Lyra and export the data
    const instance = await createLyraInstance(configuration, dirname(ymlPath))
    const serializedLyraInstance = exportInstance(instance, 'json')

    let intermediateCode: string

    switch (configuration.target.platform) {
      case 'cloudflare':
        intermediateCode = await readFile(new URL('./targets/cloudflare-workers/template.js', import.meta.url), 'utf-8')
        intermediateCode = intermediateCode.replace('__DATA__', serializedLyraInstance as string)
        break
      default:
        throw new Error(UNSUPPORTED_PLATFORM(configuration.target.platform))
    }

    const sourcePath = join(process.cwd(), 'nebula-bundle.tmp.js')
    const destinationPath = join(
      process.cwd(),
      configuration.outputDirectory ?? 'dist',
      configuration.outputFile ?? 'index.js'
    )

    await writeFile(sourcePath, intermediateCode)
    await bundleCode(sourcePath, destinationPath)
    await rm(sourcePath)

    buildingSpinner.succeed(`Lyra has been built into \x1b[1m${destinationPath}\x1b[0m`)
  } catch (e) {
    buildingSpinner?.fail(e.message)
    process.exit(1)
  }
}
