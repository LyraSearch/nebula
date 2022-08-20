import t from 'tap'
import { join } from 'path'
import { getDataFromSource } from '../source'

const mockFilePath = join(__dirname, 'mocks/source.js')

t.test('getDataFromSource', async t => {
  t.plan(1)

  const data = await getDataFromSource(mockFilePath)
  t.matchSnapshot(data, 'data from source')
})
