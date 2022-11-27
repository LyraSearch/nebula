import { Ora } from 'ora'
import { V01Configuration } from '../../configuration.js'
import { awsApiRequest, functionRole, lambdaExecutionRole, queryStringRequest } from './common.js'
import { deleteS3Bucket } from './s3.js'

async function deleteFunctionURL(
  spinner: Ora,
  name: string,
  keyId: string,
  accessKey: string,
  region: string
): Promise<void> {
  spinner.start(`Delete URL of Lambda function \x1b[1m${name}\x1b[0m ...`)

  try {
    await awsApiRequest(
      'Delete URL of Lambda function failed',
      keyId,
      accessKey,
      region,
      'lambda',
      'DELETE',
      `/2021-10-31/functions/${name}/url`,
      {},
      ''
    )

    spinner.succeed(`URL for Lambda function \x1b[1m${name}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (!e.message.includes('The resource you requested does not exist.')) {
      throw e
    }

    spinner.info(`URL for Lambda function \x1b[1m${name}\x1b[0m has been already deleted.`)
  }
}

async function deleteFunction(
  spinner: Ora,
  name: string,
  keyId: string,
  accessKey: string,
  region: string
): Promise<void> {
  try {
    spinner.start(`Deleting Lambda function \x1b[1m${name}\x1b[0m ...`)

    await awsApiRequest(
      'Deleting Lambda function failed',
      keyId,
      accessKey,
      region,
      'lambda',
      'DELETE',
      `/2015-03-31/functions/${name}`,
      {},
      ''
    )

    spinner.succeed(`Lambda function \x1b[1m${name}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (e.response?.Message.startsWith('Function not found')) {
      spinner.info(`Lambda function \x1b[1m${name}\x1b[0m has been already deleted.`)
      return
    }

    throw e
  }
}

async function deleteFunctionExecutionRole(
  spinner: Ora,
  role: string,
  keyId: string,
  accessKey: string
): Promise<void> {
  try {
    spinner.start(`Deleting Lambda role \x1b[1m${role}\x1b[0m ...`)

    await awsApiRequest(
      'Detaching execution role failed',
      keyId,
      accessKey,
      'none',
      'iam',
      'GET',
      queryStringRequest({
        Action: 'DetachRolePolicy',
        Version: '2010-05-08',
        RoleName: role,
        PolicyArn: lambdaExecutionRole
      }),
      {},
      ''
    )

    await awsApiRequest(
      'Deleting lambda role failed',
      keyId,
      accessKey,
      'none',
      'iam',
      'GET',
      queryStringRequest({
        Action: 'DeleteRole',
        Version: '2010-05-08',
        RoleName: role
      }),
      {},
      ''
    )

    spinner.succeed(`Lambda role \x1b[1m${role}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (e.response.includes(`The role with name ${role} cannot be found.`)) {
      spinner.info(`Lambda role \x1b[1m${role}\x1b[0m has been already deleted.`)
      return
    }

    throw e
  }
}

export async function undeploy(spinner: Ora, configuration: V01Configuration): Promise<void> {
  const {
    AWS_ACCOUNT_ID: accountId,
    AWS_ACCESS_KEY_ID: keyId,
    AWS_SECRET_ACCESS_KEY: accessKey,
    AWS_REGION: region
  } = process.env

  if (!accountId || !keyId || !accessKey) {
    throw new Error(
      'Please provide AWS credentials in the AWS_ACCOUNT_ID, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
    )
  }

  if (!region) {
    throw new Error('Please provide AWS region in the AWS_REGION environment variable.')
  }

  const { function: name, repository } = configuration.deploy.configuration
  const s3Bucket = configuration.deploy.configuration.s3
  const dockerImage = `${accountId}.dkr.ecr.${region}.amazonaws.com/${repository}`

  // Delete the function URL
  await deleteFunctionURL(spinner, name, keyId, accessKey, region)

  // Delete the Lambda
  await deleteFunction(spinner, name, keyId, accessKey, region)

  // Delete the execution role
  await deleteFunctionExecutionRole(spinner, functionRole(name), keyId, accessKey)

  if (s3Bucket) {
    // Delete the S3 bucket
    await deleteS3Bucket(spinner, keyId, accessKey, region, s3Bucket)
  }

  spinner.info(
    `To enable faster future deployments, the ECR repository at \x1b[1m${dockerImage}\x1b[0m has NOT been deleted.`
  )
}
