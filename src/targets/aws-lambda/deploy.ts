import { exec as execCb } from 'node:child_process'
import { basename, dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Ora } from 'ora'
import { V01Configuration } from '../../configuration.js'
import { encodeQueryStringComponent } from '../common/aws-signing.js'
import { awsApiRequest, awsJsonContentType, functionRole, lambdaExecutionRole, queryStringRequest } from './common.js'
import { deployWithS3, enableS3BucketForRole } from './s3.js'

const exec = promisify(execCb)

async function execute(command: string): Promise<void> {
  try {
    await exec(command)
  } catch (e) {
    const { code, stdout, stderr } = e

    e.cause = e
    e.message = `Execution failed with exit code ${code} and following output:\n\n$--- STDOUT ---${stdout}\n\n--- STDERR ---${stderr}:`

    throw e
  }
}

async function buildImage(spinner: Ora, dockerImage: string, dockerFile: string, sourcePath: string): Promise<void> {
  spinner.start(`Building Docker image \x1b[1m${dockerImage}:latest \x1b[0m ...`)
  const entryFile = basename(sourcePath, '.js')

  await execute(
    `docker build --no-cache -f ${dockerFile} -t ${dockerImage}:latest --build-arg NEBULA_LAMBDA_HANDLER=${entryFile} ${dirname(
      sourcePath
    )}`
  )
  spinner.succeed(`Image \x1b[1m${dockerImage}:latest\x1b[0m successfully built.`)
}

async function pushImage(spinner: Ora, dockerImage: string, accountId: string, region: string): Promise<void> {
  try {
    spinner.start(`Uploading Docker image \x1b[1m${dockerImage}:latest\x1b[0m ...`)

    await execute(`docker push ${dockerImage}`)

    spinner.succeed(`Image \x1b[1m${dockerImage}:latest\x1b[0m successfully pushed.`)
  } catch (e) {
    if (!e.stderr?.includes('Your authorization token has expired')) {
      throw e
    }

    const authenticationCommand = `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${accountId}.dkr.ecr.${region}.amazonaws.com`

    spinner.indent -= 4
    spinner.fail(
      `You need to authenticate to Amazon ECR again. Please run the following command and then try again:\n\n  \x1b[1m${authenticationCommand}\x1b[0m\n`
    )

    spinner.fail('Aborting ...')
    process.exit(1)
  }
}

async function createECRRepository(
  spinner: Ora,
  repository: string,
  keyId: string,
  accessKey: string,
  region: string
): Promise<void> {
  try {
    spinner.start(`Creating ECR repository \x1b[1m${repository}\x1b[0m ...`)

    await awsApiRequest(
      'Creating ECR repository failed',
      keyId,
      accessKey,
      region,
      'api.ecr',
      'POST',
      '/',
      {
        'content-type': awsJsonContentType,
        'x-amz-target': 'AmazonEC2ContainerRegistry_V20150921.CreateRepository'
      },
      JSON.stringify({ repositoryName: repository })
    )

    spinner.succeed(`Repository \x1b[1m${repository}\x1b[0m successfully created.`)
  } catch (e) {
    if (e.response?.__type === 'RepositoryAlreadyExistsException') {
      spinner.info(`Repository \x1b[1m${repository}\x1b[0m already existed.`)
      return
    }

    throw e
  }
}

async function createLambdaRole(spinner: Ora, role: string, keyId: string, accessKey: string): Promise<void> {
  spinner.start(`Creating Lambda role \x1b[1m${role}\x1b[0m ...`)

  const executionRolePolicyDocument = encodeQueryStringComponent(
    JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }
      ]
    })
  )

  try {
    await awsApiRequest(
      'Creating lambda role failed',
      keyId,
      accessKey,
      'none',
      'iam',
      'GET',
      queryStringRequest({
        Action: 'CreateRole',
        Version: '2010-05-08',
        RoleName: role,
        AssumeRolePolicyDocument: 'DOCUMENT'
      }).replace('DOCUMENT', executionRolePolicyDocument),
      {},
      ''
    )

    spinner.succeed(`Role \x1b[1m${role}\x1b[0m successfully created.`)
  } catch (e) {
    if (e.response?.includes('<Code>EntityAlreadyExists</Code>')) {
      spinner.info(`Role \x1b[1m${role}\x1b[0m already existed.`)
      return
    }

    throw e
  }
}

async function attachExecutionRole(
  spinner: Ora,
  executionRole: string,
  role: string,
  keyId: string,
  accessKey: string
): Promise<void> {
  spinner.start(`Attaching execution role \x1b[${executionRole}\x1b[0m to role \x1b[1m${role}\x1b[0m ...`)

  await awsApiRequest(
    'Attaching execution role failed',
    keyId,
    accessKey,
    'none',
    'iam',
    'GET',
    queryStringRequest({ Action: 'AttachRolePolicy', Version: '2010-05-08', RoleName: role, PolicyArn: executionRole }),
    {},
    ''
  )

  // IAM needs some time before allowing us to continue
  await sleep(2000)

  spinner.succeed(`Execution role \x1b[1m${executionRole}\x1b[0m successfully attached to role \x1b[1m${role}\x1b[0m.`)
}

async function prepareIAM(spinner: Ora, name: string, keyId: string, accessKey: string): Promise<void> {
  const role = functionRole(name)

  spinner.info(`Setting up IAM for the Lambda function \x1b[1m${name}\x1b[0m ...`)
  spinner.indent += 4
  await createLambdaRole(spinner, role, keyId, accessKey)

  await attachExecutionRole(spinner, lambdaExecutionRole, role, keyId, accessKey)

  spinner.indent -= 4
}

async function createFunction(
  spinner: Ora,
  name: string,
  dockerImage: string,
  accountId: string,
  keyId: string,
  accessKey: string,
  region: string
): Promise<boolean> {
  await prepareIAM(spinner, name, keyId, accessKey)

  const role = functionRole(name)
  let existing = false

  try {
    spinner.start(`Creating Lambda function \x1b[1m${name}\x1b[0m ...`)

    await awsApiRequest(
      'Creating Lambda function failed',
      keyId,
      accessKey,
      region,
      'lambda',
      'POST',
      '/2015-03-31/functions',
      {
        'content-type': 'application/json'
      },
      JSON.stringify({
        FunctionName: name,
        PackageType: 'Image',
        Code: { ImageUri: `${dockerImage}:latest` },
        Role: `arn:aws:iam::${accountId}:role/${role}`
      })
    )

    spinner.succeed(`Lambda function \x1b[1m${name}\x1b[0m successfully created.`)
  } catch (e) {
    if (!e.response?.message.startsWith('Function already exist')) {
      throw e
    }

    spinner.info(`Lambda function \x1b[1m${name}\x1b[0m already existed.`)
    existing = true
  }

  return existing
}

async function updateFunction(
  spinner: Ora,
  name: string,
  dockerImage: string,
  keyId: string,
  accessKey: string,
  region: string
): Promise<void> {
  spinner.start(`Updating Lambda function \x1b[1m${name}\x1b[0m ...`)

  await awsApiRequest(
    'Updating Lambda function failed',
    keyId,
    accessKey,
    region,
    'lambda',
    'PUT',
    `/2015-03-31/functions/${name}/code`,
    {
      'content-type': 'application/json'
    },
    JSON.stringify({ ImageUri: `${dockerImage}:latest` })
  )

  spinner.succeed(`Lambda function \x1b[1m${name}\x1b[0m successfully updated.`)
}

async function makeFunctionURLPublic(
  spinner: Ora,
  name: string,
  keyId: string,
  accessKey: string,
  region: string
): Promise<void> {
  spinner.start(`Making URL for Lambda function \x1b[1m${name}\x1b[0m public.`)

  try {
    await awsApiRequest(
      'Make Lambda function URL public failed',
      keyId,
      accessKey,
      region,
      'lambda',
      'POST',
      `/2015-03-31/functions/${name}/policy`,
      {
        'content-type': 'application/json'
      },
      JSON.stringify({
        StatementId: `${name}-invoke-url`,
        Action: 'lambda:InvokeFunctionUrl',
        Principal: '*',
        FunctionUrlAuthType: 'NONE'
      })
    )

    spinner.succeed(`URL for Lambda function \x1b[1m${name}\x1b[0m is now public.`)
  } catch (e) {
    if (e.response?.message.includes('provided already exists')) {
      spinner.info(`URL for Lambda function \x1b[1m${name}\x1b[0m was already public.`)
      return
    }

    throw e
  }
}

async function createFunctionURL(
  spinner: Ora,
  name: string,
  keyId: string,
  accessKey: string,
  region: string,
  cors: Record<string, boolean | number | string[]>
): Promise<void> {
  spinner.info(`Setting up URL invocation for Lambda function \x1b[1m${name}\x1b[0m ...`)
  spinner.indent += 4
  spinner.start(`Creating URL Lambda function \x1b[1m${name}\x1b[0m ...`)

  try {
    await awsApiRequest(
      'Creating URL for Lambda function failed',
      keyId,
      accessKey,
      region,
      'lambda',
      'POST',
      `/2021-10-31/functions/${name}/url`,
      {
        'content-type': 'application/json'
      },
      JSON.stringify({ AuthType: 'NONE', Cors: cors })
    )
  } catch (e) {
    if (!e.message.includes('FunctionUrlConfig exists')) {
      throw e
    }

    spinner.info(`URL for Lambda function \x1b[1m${name}\x1b[0m already existed.`)
  }

  spinner.succeed(`URL for Lambda function \x1b[1m${name}\x1b[0m successfully created.`)

  await makeFunctionURLPublic(spinner, name, keyId, accessKey, region)

  spinner.indent -= 4
}

async function getFunctionURL(
  spinner: Ora,
  name: string,
  keyId: string,
  accessKey: string,
  region: string
): Promise<string> {
  spinner.start(`Obtaining URL of Lambda function \x1b[1m${name}\x1b[0m ...`)

  const response = await awsApiRequest(
    'Obtaining URL of Lambda function failed',
    keyId,
    accessKey,
    region,
    'lambda',
    'GET',
    `/2021-10-31/functions/${name}/url`,
    {},
    ''
  )

  spinner.succeed(`URL for Lambda function \x1b[1m${name}\x1b[0m successfully retrieved.`)

  return response.FunctionUrl
}

export async function deploy(
  spinner: Ora,
  sourcePath: string,
  configuration: V01Configuration,
  rootDirectory: string
): Promise<string> {
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

  const { function: name, repository, cors } = configuration.deploy.configuration
  const s3Bucket = configuration.deploy.configuration.s3
  const dockerImage = `${accountId}.dkr.ecr.${region}.amazonaws.com/${repository}`
  const dockerFile = fileURLToPath(new URL('../../resources/targets/aws-lambda/Dockerfile', import.meta.url))

  spinner.info(`Updating and pushing image \x1b[1m${dockerImage}:latest\x1b[0m. Note that this might take a while.`)

  spinner.indent += 4
  await buildImage(spinner, dockerImage, dockerFile, sourcePath)
  await createECRRepository(spinner, dockerImage, keyId, accessKey, region)
  await pushImage(spinner, dockerImage, accountId, region)
  spinner.indent -= 4

  if (s3Bucket) {
    await deployWithS3(spinner, configuration, s3Bucket, keyId, accessKey, region, rootDirectory)
  }

  if (await createFunction(spinner, name, dockerImage, accountId, keyId, accessKey, region)) {
    await updateFunction(spinner, name, dockerImage, keyId, accessKey, region)
  } else {
    await createFunctionURL(spinner, name, keyId, accessKey, region, cors)
  }

  if (s3Bucket) {
    await enableS3BucketForRole(spinner, s3Bucket, functionRole(name), accountId, keyId, accessKey, region)
  }

  return getFunctionURL(spinner, name, keyId, accessKey, region)
}
