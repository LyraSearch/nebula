export const INVALID_CONFIGURATION_VERSION = (v: string) => `Invalid configuration version: ${v}`
export const UNSUPPORTED_PLATFORM = (platform: string) => `Unsupported platform: ${platform}`
export const UNKNOWN_COMMAND = (cmd: string) => `Unknown command: ${cmd}`
export const COMMAND_IS_UNDEFINED = () => `\n\nPlease specify a command.\n\nExample: nebula run\n\n`