import t from 'tap'
import { join } from 'path'
import { parseLyraConfiguration } from '../parser'
import { readFileSync, rmSync, writeFileSync } from 'fs'

const tmpMockFilePath = join(process.cwd(), 'lyra.yml')
const mockPath = join(__dirname, './mocks/lyra.yml')
const mockPathContent = readFileSync(mockPath, 'utf8')

t.test('parse Lyra in-memory configuration', t => {
  t.plan(5)

  writeFileSync(
    tmpMockFilePath,
    mockPathContent
  )

  const c1 = parseLyraConfiguration({ configuration: mockPathContent })
  const c2 = parseLyraConfiguration({ path: mockPath })
  const c3 = parseLyraConfiguration()

  t.matchSnapshot(c1, 'parsed configuration')
  t.matchSnapshot(c2, 'parsed configuration from disk')
  t.matchSnapshot(c3, 'parsed configuration from default path')

  t.same(c1, c2)
  t.same(c1, c3)

  rmSync(tmpMockFilePath)
})
