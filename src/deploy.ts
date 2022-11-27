import { Command } from 'commander'
import { access, constants } from 'node:fs/promises'
import { join } from 'node:path'
import ora from 'ora'
import { bundle } from './bundle.js'
import { parseLyraConfiguration } from './configuration.js'
import { UNREADABLE_BUNDLE_FILE, UNSUPPORTED_PLATFORM } from './errors.js'
import * as aws from './targets/aws-lambda/index.js'
import * as cloudflare from './targets/cloudflare-workers/index.js'

export async function deploy(this: Command, rawYmlPath: string, args: Record<string, any>): Promise<void> {
  if (args.build) {
    await bundle.apply(this, [rawYmlPath, args])
  }

  const spinner = ora('Deploying Lyra ...').start()
  let sourcePath: string
  try {
    // Parse the configuration
    const [configuration, rootDirectory] = await parseLyraConfiguration(this, rawYmlPath)

    // Check that the built file exists
    sourcePath = join(rootDirectory, configuration.output.name)
    await access(sourcePath, constants.R_OK)

    let url: string
    switch (configuration.deploy.platform) {
      case 'cloudflare':
        url = await cloudflare.deploy(spinner, sourcePath, configuration, rootDirectory)
        break
      case 'aws-lambda':
        url = await aws.deploy(spinner, sourcePath, configuration, rootDirectory)
        break
      default:
        throw new Error(UNSUPPORTED_PLATFORM(configuration.deploy.platform))
    }

    spinner.info(`Lyra is now available at \x1b[1m${url}\x1b[0m`)
    spinner.succeed('Lyra has been successfully deployed!')
  } catch (e) {
    if (e.code === 'ENOENT') {
      spinner?.fail(UNREADABLE_BUNDLE_FILE(sourcePath!))
    } else {
      spinner?.fail(e.message)
    }
    process.exit(1)
  }
}

export async function undeploy(this: Command, rawYmlPath: string, args: Record<string, any>): Promise<void> {
  const spinner = ora('Undeploying Lyra ...').start()
  let sourcePath: string
  try {
    // Parse the configuration
    const [configuration, rootDirectory] = await parseLyraConfiguration(this, rawYmlPath)

    // Check that the built file exists
    sourcePath = join(rootDirectory, configuration.output.name)
    await access(sourcePath, constants.R_OK)

    switch (configuration.deploy.platform) {
      case 'cloudflare':
        await cloudflare.undeploy(spinner, configuration)
        break
      case 'aws-lambda':
        await aws.undeploy(spinner, configuration)
        break
      default:
        throw new Error(UNSUPPORTED_PLATFORM(configuration.deploy.platform))
    }

    spinner.succeed('Lyra has been successfully undeployed.')
  } catch (e) {
    if (e.code === 'ENOENT') {
      spinner?.fail(UNREADABLE_BUNDLE_FILE(sourcePath!))
    } else {
      spinner?.fail(e.message)
    }
    process.exit(1)
  }
}
