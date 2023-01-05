import { readFile, writeFile } from 'node:fs/promises'
import { relative } from 'node:path'

async function afterBuild(spinner, path) {
  const code = await readFile(path, 'utf8')
  const template = `
DROP FUNCTION IF EXISTS searchWithLyra;
DROP TYPE IF EXISTS searchWithLyraReturnType;
CREATE TYPE searchWithLyraReturnType AS (id TEXT, name TEXT) ;
CREATE OR REPLACE 
  FUNCTION searchWithLyra(_term TEXT, _limit INT DEFAULT 10, _offset INT DEFAULT 0, _tolerance INT DEFAULT 0, _exact BOOLEAN DEFAULT FALSE, _properties TEXT DEFAULT '*') 
  RETURNS SETOF searchWithLyraReturnType
  AS $_lyra_nebula_marker_$
\n\n${code}\n\n
  $_lyra_nebula_marker_$
LANGUAGE plv8 IMMUTABLE STRICT;
`

  await writeFile(path + '.sql', template.trim(), 'utf8')
  spinner.info(
    `The SQL function definition for PostgreSQL is now available at \x1b[1m${relative(process.cwd(), path)}.sql\x1b[0m`
  )
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
  spinner.warn('postgresql platform does not support deployment, please loaded the generated SQL manually.')
  return null
}

export function undeploy(spinner) {
  spinner.warn('postgresql platform does not support undeployment, please drop the function manually.')
}
