import type { V01Configuration } from 'types/configuration'
import { create } from '@nearform/lyra'

export function createLyraInstance ({ schema }: V01Configuration) {
  return create({
    schema
  })
}
