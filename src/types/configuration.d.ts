import { PropertiesSchema } from '@nearform/lyra'

export type Platform =
  | 'cloudflare'

export type Version =
  | '0.1'

export type Sharding =
 | 'auto'
 | number

export interface V01Configuration {
  version: 0.1
  schema: {
    definition: PropertiesSchema
  }
  sharding: Sharding
  target: {
    platform: Platform
    tests: boolean
  }
  data: {
    source: string
  }
}
