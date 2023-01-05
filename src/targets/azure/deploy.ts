import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Ora } from 'ora'
import { AzureDeploymentConfiguration, V01Configuration } from '../../configuration.js'
import { ensureAuthentication, exec } from './common.js'

const functionJsonContents = JSON.stringify({
  entryPoint: 'lyraHandler',
  bindings: [
    {
      authLevel: 'anonymous',
      type: 'httpTrigger',
      direction: 'in',
      name: 'req',
      methods: ['get', 'post']
    },
    {
      type: 'http',
      direction: 'out',
      name: '$return'
    }
  ]
})

const hostJsonContents = JSON.stringify({
  version: '2.0',
  logging: {
    applicationInsights: {
      samplingSettings: {
        isEnabled: true,
        excludedTypes: 'Request'
      }
    }
  },
  extensionBundle: {
    id: 'Microsoft.Azure.Functions.ExtensionBundle',
    version: '[3.*, 4.0.0)'
  }
})

async function ensureStorageContainer(spinner: Ora, name: string, storageAccount: string): Promise<void> {
  try {
    spinner.start(`Making sure Azure Storage container \x1b[1m${name}\x1b[0m exists ...`)

    await exec(
      'Creating Azure Storage container',
      `az storage container create --fail-on-exist --account-name ${storageAccount} -n ${name}`
    )

    spinner.succeed(`Azure Storage container \x1b[1m${name}\x1b[0m successfully created.`)
  } catch (e) {
    if (e.message.includes('The specified container already exists.')) {
      spinner.info(`Azure Storage container \x1b[1m${name}\x1b[0m already existed.`)
      return
    }

    throw e
  }
}

async function uploadData(spinner: Ora, container: string, dataPath: string, storageAccount: string): Promise<void> {
  const name = 'data.json'

  spinner.start(`Uploading blob file \x1b[1m${name}\x1b[0m to Azure Storage container \x1b[1m${container}\x1b[0m ...`)
  await exec(
    'Uploading blob file to Azure Storage container',
    `az storage blob upload --overwrite --account-name ${storageAccount} -c ${container} -f ${dataPath} -n ${name}`
  )

  spinner.succeed(
    `File \x1b[1m${name}\x1b[0m successfully uploaded to Azure Storage container \x1b[1m${container}\x1b[0m.`
  )
}

async function insertDownloadUrl(
  container: string,

  storageAccount: string,
  sourcePath: string
): Promise<void> {
  const url = await exec(
    'Creating Azure Storage blob SAS authorized URL',
    `az storage blob generate-sas --account-name ${storageAccount} --container-name ${container} --name data.json --permissions r --full-uri --https-only --expiry 2038-12-31T23:59Z`
  )

  const contents = await readFile(sourcePath, 'utf-8')
  await writeFile(sourcePath, contents.replace('__URL__', (url.stdout as string).trim().replaceAll('"', '')), 'utf8')
}

async function createFunctionApp(
  spinner: Ora,
  app: string,
  resourceGroup: string,
  storageAccount: string,
  region: string
): Promise<void> {
  spinner.start(`Creating Azure Function App \x1b[1m${app}\x1b[0m ...`)

  try {
    const result = await exec(
      'Creating Azure Function App',
      `az functionapp create --only-show-errors --resource-group ${resourceGroup} --storage-account ${storageAccount} --consumption-plan-location ${region} -n ${app} --functions-version 4 --runtime node --runtime-version 18`
    )

    if (result.stdout === '') {
      spinner.info(`Azure Function App \x1b[1m${app}\x1b[0m already existed.`)
    } else {
      spinner.succeed(`Azure Function App \x1b[1m${app}\x1b[0m successfully created.`)
    }
  } catch (e) {
    if (e.message.includes(`Website with given name ${app} already exists.`)) {
      spinner.info(`Azure Function App \x1b[1m${app}\x1b[0m is already owned by another user.`)
      return
    }

    throw e
  }
}

async function deployFunction(spinner: Ora, app: string, name: string, sourcePath: string): Promise<void> {
  let attempts = 3
  spinner.start(`Deploying Azure Function App function \x1b[1m${app}/${name}\x1b[0m ...`)

  // Sometimes the function is not immediately available, let's retry
  while (attempts > 0) {
    await sleep(30000)

    const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'nebula-azure-'))
    const cwd = process.cwd()

    try {
      process.chdir(temporaryDirectory)
      await mkdir(resolve(temporaryDirectory, 'lyra'))

      await writeFile(resolve(temporaryDirectory, 'host.json'), hostJsonContents, 'utf8')
      await writeFile(resolve(temporaryDirectory, 'lyra', 'function.json'), functionJsonContents, 'utf8')
      await cp(sourcePath, resolve(temporaryDirectory, 'lyra', 'index.js'))

      const result = await exec(
        'Deploying Azure Function App function',
        `func azure functionapp publish ${app} --javascript`
      )

      if (result.stdout === '') {
        spinner.info(`Azure Function App function \x1b[1m${app}/${name}\x1b[0m  already deployed.`)
      } else {
        spinner.succeed(`Azure Function App function \x1b[1m${app}/${name}\x1b[0m successfully deployed.`)
        return
      }
    } catch (e) {
      if (e.message.includes(`Can't find app with name "${app}"`)) {
        attempts--
        continue
      }

      throw e
    } finally {
      process.chdir(cwd)
      await rm(temporaryDirectory, { force: true, recursive: true })
    }
  }
}

async function getFunctionUrl(spinner: Ora, app: string, name: string, resourceGroup: string): Promise<string> {
  spinner.start(`Obtaining URL of Azure Function App function \x1b[1m${app}/${name}\x1b[0m ...`)

  const result = await exec(
    'Obtaining URL of Azure Function App function',
    `az functionapp function show --resource-group ${resourceGroup} --name ${app} --function-name ${name}`
  )

  const info = JSON.parse(result.stdout as string)
  return info.invokeUrlTemplate
}

export async function deploy(
  spinner: Ora,
  sourcePath: string,
  configuration: V01Configuration,
  rootDirectory: string
): Promise<string> {
  await ensureAuthentication(spinner)

  const {
    application: app,
    function: name,
    resourceGroup,
    storageAccount,
    region,
    container
  } = configuration.deploy.configuration as AzureDeploymentConfiguration

  if (container) {
    await ensureStorageContainer(spinner, container, storageAccount)
    await uploadData(spinner, container, resolve(rootDirectory, configuration.output.dataName), storageAccount)

    await insertDownloadUrl(container, storageAccount, sourcePath)
  }

  await createFunctionApp(spinner, app, resourceGroup, storageAccount, region)
  await deployFunction(spinner, app, name, sourcePath)

  return getFunctionUrl(spinner, app, name, resourceGroup)
}
