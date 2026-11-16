import 'dotenv/config'
import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { s3Bucket, s3Internal } from '../server/utils/storage'

async function initStorage() {
  try {
    await s3Internal.send(new HeadBucketCommand({ Bucket: s3Bucket }))
    console.log(`Bucket ${s3Bucket} sudah ada.`)
  }
  catch {
    await s3Internal.send(new CreateBucketCommand({ Bucket: s3Bucket }))
    console.log(`Bucket ${s3Bucket} dibuat.`)
  }
}

initStorage()
  .catch((error) => {
    console.error('Inisialisasi storage gagal:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => {
    s3Internal.destroy()
  })
