import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Ora } from 'ora'
import { V01Configuration } from '../../configuration.js'
import { s3UnsignedPayloadHash } from '../common/aws-signing.js'
import { awsApiRequest } from './common.js'

async function ensureS3Bucket(
  spinner: Ora,
  keyId: string,
  accessKey: string,
  region: string,
  bucket: string
): Promise<void> {
  try {
    spinner.start(`Making sure S3 bucket \x1b[1m${bucket}\x1b[0m exists ...`)

    await awsApiRequest(
      'S3 bucket creation failed',
      keyId,
      accessKey,
      region,
      `${bucket}.s3`,
      'PUT',
      '/',
      {
        'x-amz-content-sha256': s3UnsignedPayloadHash,
        'x-amz-acl': 'private',
        'x-amz-object-ownership': 'BucketOwnerEnforced'
      },
      `<?xml version="1.0" encoding="UTF-8"?>
        <CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
          <LocationConstraint>${region}</LocationConstraint>
        </CreateBucketConfiguration>`
    )

    spinner.succeed(`S3 bucket \x1b[1m${bucket}\x1b[0m successfully created ...`)
  } catch (e) {
    if (e.response?.includes('<Code>BucketAlreadyOwnedByYou</Code>')) {
      spinner.info(`S3 bucket \x1b[1m${bucket}\x1b[0m already existed ...`)
      return
    }

    throw e
  }
}

async function makeS3BucketNotPublic(
  spinner: Ora,
  keyId: string,
  accessKey: string,
  region: string,
  bucket: string
): Promise<void> {
  spinner.start(`Making sure S3 bucket \x1b[1m${bucket}\x1b[0m is not public ...`)

  await awsApiRequest(
    'Setting S3 bucket to not public failed',
    keyId,
    accessKey,
    region,
    `${bucket}.s3`,
    'PUT',
    '/?publicAccessBlock',
    { 'x-amz-content-sha256': s3UnsignedPayloadHash },
    `<?xml version="1.0" encoding="UTF-8"?>
    <PublicAccessBlockConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <BlockPublicAcls>TRUE</BlockPublicAcls>
      <IgnorePublicAcls>TRUE</IgnorePublicAcls>
      <BlockPublicPolicy>TRUE</BlockPublicPolicy>
      <RestrictPublicBuckets>TRUE</RestrictPublicBuckets>
    </PublicAccessBlockConfiguration>`
  )

  spinner.succeed(`S3 bucket \x1b[1m${bucket}\x1b[0m was successfully set to not public.`)
}

async function uploadS3Data(
  spinner: Ora,
  keyId: string,
  accessKey: string,
  region: string,
  bucket: string,
  name: string,
  data: Buffer
): Promise<void> {
  // Perform the request
  spinner.start(`Uploading file \x1b[1m${name}\x1b[0m to S3 bucket \x1b[1m${bucket}\x1b[0m.`)

  await awsApiRequest(
    'Data upload to S3 failed',
    keyId,
    accessKey,
    region,
    `${bucket}.s3`,
    'PUT',
    `/${name}`,
    {
      'x-amz-content-sha256': s3UnsignedPayloadHash
    },
    data
  )

  spinner.succeed(`File \x1b[1m${name}\x1b[0m successfully uploaded to S3 bucket \x1b[1m${bucket}\x1b[0m.`)
}

export async function enableS3BucketForRole(
  spinner: Ora,
  bucket: string,
  role: string,
  accountId: string,
  keyId: string,
  accessKey: string,
  region: string
): Promise<void> {
  spinner.start(`Enable access to S3 bucket \x1b[1m${bucket}\x1b[0m to role \x1b[1m${role}\x1b[0m ...`)

  const bucketPolicyDocument = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Principal: {
          AWS: [`arn:aws:iam::${accountId}:role/${role}`]
        },
        Resource: [`arn:aws:s3:::${bucket}/data.json`]
      }
    ]
  })

  await awsApiRequest(
    'Enabling S3 bucket access to role failed (bucket policy)',
    keyId,
    accessKey,
    region,
    `${bucket}.s3`,
    'PUT',
    '/?policy',
    { 'x-amz-content-sha256': s3UnsignedPayloadHash },
    bucketPolicyDocument
  )

  spinner.succeed(`Access to S3 bucket \x1b[1m${bucket}\x1b[0m to role \x1b[1m${role}\x1b[0m successfully enabled.`)
}

export async function deleteS3Bucket(
  spinner: Ora,
  keyId: string,
  accessKey: string,
  region: string,
  bucket: string
): Promise<void> {
  try {
    spinner.start(`Deleting S3 bucket \x1b[1m${bucket}\x1b[0m ...`)

    await awsApiRequest(
      'S3 file deletion failed',
      keyId,
      accessKey,
      region,
      `${bucket}.s3`,
      'DELETE',
      '/data.json',
      {
        'x-amz-content-sha256': s3UnsignedPayloadHash
      },
      ''
    )

    await awsApiRequest(
      'S3 bucket deletion failed',
      keyId,
      accessKey,
      region,
      `${bucket}.s3`,
      'DELETE',
      '/',
      {
        'x-amz-content-sha256': s3UnsignedPayloadHash
      },
      ''
    )

    spinner.succeed(`S3 bucket \x1b[1m${bucket}\x1b[0m successfully deleted.`)
  } catch (e) {
    if (e.response?.includes('<Code>NoSuchBucket</Code>')) {
      spinner.info(`S3 bucket \x1b[1m${bucket}\x1b[0m has been already deleted.`)
      return
    }

    throw e
  }
}

export async function deployWithS3(
  spinner: Ora,
  configuration: V01Configuration,
  bucket: string,
  keyId: string,
  accessKey: string,
  region: string,
  rootDirectory: string
): Promise<void> {
  await ensureS3Bucket(spinner, keyId, accessKey, region, bucket)
  await makeS3BucketNotPublic(spinner, keyId, accessKey, region, bucket)

  const data = await readFile(join(rootDirectory, configuration.output.dataName))
  await uploadS3Data(spinner, keyId, accessKey, region, bucket, 'data.json', data)
}
