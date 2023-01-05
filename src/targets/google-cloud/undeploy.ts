import { basename } from 'node:path'
import { Ora } from 'ora'
import { GoogleCloudDeploymentConfiguration, V01Configuration } from '../../configuration.js'
import { getFunctionInformation, googleRequest, refreshApiToken } from './common.js'

async function deleteFunction(
  spinner: Ora,
  apiToken: string,
  name: string,
  project: string,
  region: string
): Promise<void> {
  try {
    spinner.start(`Deleting Google Cloud Function \x1b[1m${name}\x1b[0m ...`)

    await googleRequest(
      'Google Cloud Function deletion',
      apiToken,
      'DELETE',
      `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions/${name}`
    )

    spinner.succeed(`Google Cloud Function \x1b[1m${name}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (e.response?.error?.code === 404) {
      spinner.info(`Google Cloud Function \x1b[1m${name}\x1b[0m has been already deleted.`)
      return
    }

    throw e
  }
}

async function deleteService(
  spinner: Ora,
  apiToken: string,
  name: string,
  project: string,
  region: string
): Promise<void> {
  try {
    spinner.start(`Deleting Google Cloud Run service \x1b[1m${name}\x1b[0m ...`)

    await googleRequest(
      'Google Cloud Run service deletion',
      apiToken,
      'DELETE',
      `https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${name}`
    )

    spinner.succeed(`Google Cloud Cloud Run service \x1b[1m${name}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (e.response?.error?.code === 404) {
      spinner.info(`Google Cloud Run service \x1b[1m${name}\x1b[0m has been already deleted.`)
      return
    }

    throw e
  }
}

async function deleteStorageObject(
  spinner: Ora,
  apiToken: string,
  bucket: string,
  object: string,
  region: string
): Promise<void> {
  try {
    spinner.start(`Deleting Cloud Storage object \x1b[1m${object}\x1b[0m from bucket \x1b[1m${bucket}\x1b[0m ...`)

    await googleRequest(
      'Cloud Storage object deletion',
      apiToken,
      'DELETE',
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${object}`
    )

    spinner.succeed(`Cloud Storage \x1b[1m${object}\x1b[0m from bucket \x1b[1m${bucket}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (e.response?.error?.code === 404) {
      spinner.info(`Cloud Storage \x1b[1m${object}\x1b[0m in bucket \x1b[1m${bucket}\x1b[0m has been already deleted.`)
      return
    }

    throw e
  }
}

async function deleteStorageBucket(spinner: Ora, apiToken: string, name: string, region: string): Promise<void> {
  try {
    spinner.start(`Deleting Cloud Storage bucket \x1b[1m${name}\x1b[0m ...`)

    await googleRequest(
      'Cloud Storage bucket deletion',
      apiToken,
      'DELETE',
      `https://storage.googleapis.com/storage/v1/b/${name}`
    )

    spinner.succeed(`Cloud Storage bucket \x1b[1m${name}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (e.response?.error?.code === 404) {
      spinner.info(`Cloud Storage bucket \x1b[1m${name}\x1b[0m has been already deleted.`)
      return
    }

    throw e
  }
}

export async function undeploy(spinner: Ora, configuration: V01Configuration): Promise<void> {
  const apiToken = await refreshApiToken(spinner)

  const {
    function: name,
    project,
    region,
    bucket,
    separateDataObject
  } = configuration.deploy.configuration as GoogleCloudDeploymentConfiguration

  const info = await getFunctionInformation(spinner, apiToken, name, project, region, true)

  if (info) {
    const service = basename(info.serviceConfig.service)

    await deleteFunction(spinner, apiToken, name, project, region)
    await deleteService(spinner, apiToken, service, project, region)
  }

  await deleteStorageObject(spinner, apiToken, bucket, 'bundle.js', region)

  if (separateDataObject) {
    await deleteStorageObject(spinner, apiToken, bucket, 'data.json', region)
  }

  await deleteStorageBucket(spinner, apiToken, bucket, region)
}
