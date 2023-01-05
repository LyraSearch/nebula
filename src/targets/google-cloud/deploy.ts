import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Ora } from 'ora'
import { GoogleCloudDeploymentConfiguration, V01Configuration } from '../../configuration.js'
import { getFunctionInformation, googleRequest, refreshApiToken } from './common.js'

function functionConfiguration(bucket: string): object {
  const { GCP_CLIENT_ID, GCP_CLIENT_SECRET, GCP_REFRESH_TOKEN } = process.env

  return {
    environment: 'GEN_2',
    buildConfig: {
      runtime: 'nodejs18',
      entryPoint: 'lyraHandler',
      source: {
        storageSource: {
          bucket,
          object: 'bundle.js'
        }
      }
    },
    serviceConfig: {
      environmentVariables: { GCP_CLIENT_ID, GCP_CLIENT_SECRET, GCP_REFRESH_TOKEN }
    }
  }
}

async function ensureStorageBucket(
  spinner: Ora,
  apiToken: string,
  name: string,
  project: string,
  region: string
): Promise<void> {
  try {
    spinner.start(`Making sure Cloud Storage bucket \x1b[1m${name}\x1b[0m exists ...`)

    const queryStringRequest = new URLSearchParams({
      project,
      predefinedAcl: 'private',
      predefinedDefaultObjectAcl: 'private'
    })

    await googleRequest(
      'Cloud Storage bucket creation',
      apiToken,
      'POST',
      `https://storage.googleapis.com/storage/v1/b?${queryStringRequest.toString()}`,
      {
        'content-type': 'application/json'
      },
      JSON.stringify({
        name,
        location: region.startsWith('europe') ? 'EU' : 'US'
      })
    )

    spinner.succeed(`Cloud Storage bucket \x1b[1m${name}\x1b[0m successfully created.`)
  } catch (e) {
    if (e.response?.error?.message.includes('you already own it')) {
      spinner.info(`Cloud Storage bucket \x1b[1m${name}\x1b[0m already existed.`)
      return
    }

    throw e
  }
}

async function uploadFunctionCode(spinner: Ora, apiToken: string, bucket: string, sourcePath: string): Promise<void> {
  spinner.start(`Uploading function code on bucket \x1b[1m${bucket}\x1b[0m ...`)

  const queryStringRequest = new URLSearchParams({
    name: 'bundle.js',
    uploadType: 'media'
  })

  const zip = new JSZip()
  zip.file('index.js', readFile(sourcePath))

  await googleRequest(
    'Uploading function code',
    apiToken,
    'POST',
    `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?${queryStringRequest.toString()}`,
    {},
    await zip.generateAsync({ type: 'nodebuffer' })
  )

  spinner.succeed('Function code successfully uploaded.')
}

async function uploadCloudStorageObject(
  spinner: Ora,
  apiToken: string,
  bucket: string,
  object: string,
  dataPath: string
): Promise<void> {
  spinner.start(`Uploading file \x1b[1m${object}\x1b[0m to Google Cloud Storage bucket \x1b[1m${bucket}\x1b[0m ...`)

  const queryStringRequest = new URLSearchParams({
    name: object,
    uploadType: 'media'
  })

  await googleRequest(
    'Uploading file to Google Cloud Storage',
    apiToken,
    'POST',
    `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?${queryStringRequest.toString()}`,
    {},
    await readFile(dataPath)
  )

  spinner.succeed(
    `File \x1b[1m${object}\x1b[0m successfully uploaded to Google Cloud Storage bucket \x1b[1m${bucket}\x1b[0m.`
  )
}

async function createFunction(
  spinner: Ora,
  apiToken: string,
  name: string,
  bucket: string,
  project: string,
  region: string
): Promise<boolean> {
  try {
    spinner.start(`Creating Google Cloud Function \x1b[1m${name}\x1b[0m ...`)

    await googleRequest(
      'Creating Google Cloud Function',
      apiToken,
      'POST',
      `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions?functionId=${name}`,
      {
        'content-type': 'application/json'
      },
      JSON.stringify(functionConfiguration(bucket))
    )

    spinner.succeed(`Google Cloud Function \x1b[1m${name}\x1b[0m successfully created.`)
    return false
  } catch (e) {
    if (e.response?.error?.message.includes('already exists')) {
      spinner.info(`Google Cloud Function \x1b[1m${name}\x1b[0m already existed.`)
      return true
    }

    throw e
  }
}

async function updateFunction(
  spinner: Ora,
  apiToken: string,
  name: string,
  bucket: string,
  project: string,
  region: string
): Promise<void> {
  spinner.start(`Updating Google Cloud Function \x1b[1m${name}\x1b[0m ...`)

  await googleRequest(
    'Updating Google Cloud Function',
    apiToken,
    'PATCH',
    `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions/${name}`,
    {
      'content-type': 'application/json'
    },
    JSON.stringify(functionConfiguration(bucket))
  )

  spinner.succeed(`Google Cloud Function \x1b[1m${name}\x1b[0m successfully updated.`)
}

async function enableServicePublicUrlInvocation(
  spinner: Ora,
  apiToken: string,
  name: string,
  project: string,
  region: string
): Promise<void> {
  spinner.start(`Allowing public URL invocation of Google Cloud Run service \x1b[1m${name}\x1b[0m ...`)

  await googleRequest(
    'Allowing public URL invocation of Google Cloud Run service',
    apiToken,
    'POST',
    `https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${name}:setIamPolicy`,
    {
      'content-type': 'application/json'
    },
    JSON.stringify({
      policy: {
        version: 3,
        bindings: [
          {
            role: 'roles/run.invoker',
            members: ['allUsers']
          }
        ]
      },
      updateMask: 'bindings'
    })
  )

  spinner.succeed(
    `Public URL invocation of Google Cloud Run service \x1b[1m${name}\x1b[0m successfully is now allowed.`
  )
}

async function waitDeployment(
  spinner: Ora,
  apiToken: string,
  name: string,
  project: string,
  region: string
): Promise<void> {
  let attempts = 300
  spinner.start(
    `Waiting up to ${attempts / 60} minutes for the Google Cloud Function \x1b[1m${name}\x1b[0m to be deployed ...`
  )

  while (attempts > 0) {
    await sleep(1000)
    attempts--

    const info = await getFunctionInformation(spinner, apiToken, name, project, region, false, true)

    if (info!.state === 'FAILED') {
      const error = new Error('Deployment failed.')
      Object.defineProperty(error, 'stateMessages', {
        value: info!.stateMessages,
        writable: false,
        enumerable: true
      })

      throw error
    } else if (info!.state === 'ACTIVE') {
      spinner.succeed(`Google Cloud Function \x1b[1m${name}\x1b[0m is now active.`)
      return
    }
  }
}

export async function deploy(
  spinner: Ora,
  sourcePath: string,
  configuration: V01Configuration,
  rootDirectory: string
): Promise<string> {
  configuration.deploy.configuration = {
    function: basename(sourcePath, '.js'),
    ...configuration.deploy.configuration
  }

  const apiToken = await refreshApiToken(spinner)

  const {
    function: name,
    project,
    region,
    bucket,
    separateDataObject
  } = configuration.deploy.configuration as GoogleCloudDeploymentConfiguration

  await ensureStorageBucket(spinner, apiToken, bucket, project, region)

  await uploadFunctionCode(spinner, apiToken, bucket, sourcePath)

  if (separateDataObject) {
    await uploadCloudStorageObject(
      spinner,
      apiToken,
      bucket,
      'data.json',
      resolve(rootDirectory, configuration.output.dataName)
    )
  }

  if (await createFunction(spinner, apiToken, name, bucket, project, region)) {
    await updateFunction(spinner, apiToken, name, bucket, project, region)
  }

  await waitDeployment(spinner, apiToken, name, project, region)

  const info = await getFunctionInformation(spinner, apiToken, name, project, region)

  await enableServicePublicUrlInvocation(spinner, apiToken, basename(info!.serviceConfig.service), project, region)

  return info!.serviceConfig.uri
}
