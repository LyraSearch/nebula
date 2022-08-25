import { access, constants } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import ora from 'ora'
import { bundle } from './bundle.js'
import { parseLyraConfiguration } from './configuration.js'
import { UNREADABLE_BUNDLE_FILE, UNSUPPORTED_PLATFORM } from './errors.js'
import { deploy as clouflareDeploy } from './targets/cloudflare-workers/deploy.js'

export async function deploy(ymlPath: string, args: Record<string, any>): Promise<void> {
  if (args.build) {
    await bundle(ymlPath, args)
  }

  const buildingSpinner = ora('Deploying Lyra ...').start()
  let sourcePath: string
  try {
    // Parse the configuration
    ymlPath = resolve(process.cwd(), ymlPath ?? 'lyra.yml')
    const configuration = await parseLyraConfiguration(ymlPath)

    // Check that the built file exists
    sourcePath = join(process.cwd(), configuration.output.directory, configuration.output.name)
    await access(sourcePath, constants.R_OK)

    let url: string
    switch (configuration.deploy.platform) {
      case 'cloudflare':
        url = await clouflareDeploy(sourcePath, configuration)
        break
      default:
        throw new Error(UNSUPPORTED_PLATFORM(configuration.deploy.platform))
    }

    buildingSpinner.succeed(`Lyra has been deployed and it is now available at \x1b[1m${url}\x1b[0m`)
  } catch (e) {
    if (e.code === 'ENOENT') {
      buildingSpinner?.fail(UNREADABLE_BUNDLE_FILE(sourcePath!))
    } else {
      buildingSpinner?.fail(e.message)
    }
    process.exit(1)
  }
}
