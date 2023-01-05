import { Ora } from 'ora'
import { V01Configuration } from '../../configuration.js'
import { ensureAuthentication, exec } from './common.js'

async function deleteStorageContainer(spinner: Ora, name: string, storageAccount: string): Promise<void> {
  spinner.start(`Deleting Azure Azure Storage container \x1b[1m${name}\x1b[0m ...`)

  await exec(
    'Deleting Azure Storage container',
    `az storage container delete --account-name ${storageAccount} --name ${name}`
  )

  spinner.succeed(`Azure Storage container \x1b[1m${name}\x1b[0m successfully deleted.`)
}

async function deleteFunctionApp(spinner: Ora, name: string, resourceGroup: string): Promise<void> {
  spinner.start(`Deleting Azure App Function \x1b[1m${name}\x1b[0m ...`)

  await exec(
    'Deleting Azure App Function',
    `az functionapp delete --only-show-errors --resource-group ${resourceGroup} -n ${name}`
  )

  spinner.succeed(`Azure App Function \x1b[1m${name}\x1b[0m successfully deleted.`)
}

export async function undeploy(spinner: Ora, configuration: V01Configuration): Promise<void> {
  await ensureAuthentication(spinner)

  const { application: name, resourceGroup, storageAccount, container } = configuration.deploy.configuration

  if (container) {
    await deleteStorageContainer(spinner, container, storageAccount)
  }

  await deleteFunctionApp(spinner, name, resourceGroup)
}
