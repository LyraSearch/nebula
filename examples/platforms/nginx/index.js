import { transformFile } from '@swc/core'
import { readFile, writeFile } from 'node:fs/promises'

async function afterBuild(spinner, path) {
  // Nginx does not support for-of syntax, therefore we have to remove it
  const transformation = await transformFile(path, {
    jsc: { target: 'es5' },
    minify: true,
    swcrc: false
  })

  let code =
    'function BigInt(n) { return n; };' + // No-op polyfill for BigInt
    transformation.code.replace(/export\s*\{\s*(.+) as default\s*\};/, 'export default { lyraHandler: $1 };') // Fix the default export as nginx expects

  return writeFile(path, code, 'utf8')
}

export async function bundle(configuration, serializedLyraInstance) {
  const template = await readFile(new URL('./template.js', import.meta.url), 'utf-8')

  return {
    template: template.replace('__DATA_TYPE__', 'Embedded').replace('__DATA__', serializedLyraInstance),
    hasSeparateData: false,
    afterBuild
  }
}

export function deploy(spinner) {
  spinner.warn('nginx platform does not support deployment, please add configuration to your nginx.conf manually.')
  return null
}

export function undeploy(spinner) {
  spinner.warn(
    'nginx platform does not support undeployment, please remove configuration from your nginx.conf manually.'
  )
}
