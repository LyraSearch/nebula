export function UNREADABLE_CONFIGURATION_FILE(v: string): string {
  return `Cannot read configuration file: \x1b[1m${v}\x1b[0m`
}

export function UNREADABLE_BUNDLE_FILE(v: string): string {
  return `Cannot read bundle file: \x1b[1m${v}\x1b[0m`
}

export function INVALID_CONFIGURATION_FILE(v: string): string {
  return `Invalid configuration file: \x1b[1m${v}\x1b[0m`
}

export function INVALID_CONFIGURATION_VERSION(v: string): string {
  return `Invalid configuration version: \x1b[1m${v}\x1b[0m`
}

export function MISSING_SCHEMA(): string {
  return 'Missing schema key in the configuration file'
}

export function MISSING_INPUT_PATH(): string {
  return 'Missing input.path key in the configuration file'
}

export function UNSUPPORTED_SOURCE(source: string): string {
  return `Unsupported data source: \x1b[1m${source}\x1b[0m`
}

export function UNSUPPORTED_PLATFORM(platform: string): string {
  return `Unsupported platform: \x1b[1m${platform}\x1b[0m`
}

export function NOT_WRITABLE(path: string): string {
  return `Cannot write temporary files to folder: \x1b[1m${path}\x1b[0m`
}
