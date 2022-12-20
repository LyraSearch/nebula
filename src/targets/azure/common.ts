import { exec as execSync, ExecOptions } from 'child_process'
import { Ora } from 'ora'
import { promisify } from 'util'

interface ExecResponse {
  stdout: string | Buffer
  stderr: string | Buffer
}
export const execAsync = promisify(execSync)

export async function ensureAuthentication(spinner: Ora): Promise<void> {
  try {
    const result = await execAsync('az account list --only-show-errors')

    const response = JSON.parse(result.stdout)

    if (response?.length === 0) {
      spinner.fail(
        'You need to login on Azure. Please run the following command and then try again ...\n\n\x1b[1m  az login\x1b[0m\n'
      )
      spinner.fail('Aborting ...')
      process.exit(1)
    }
  } catch (e) {
    if (e.stderr.endsWith('command not found\n')) {
      spinner.fail(
        'Azure deployment needs the az CLI to be installed locally. Please follow the instruction at the URL below and try again ...\n\n\x1b[1m  https://learn.microsoft.com/en-us/cli/azure/install-azure-cli\x1b[0m\n'
      )
      spinner.fail('Aborting ...')
      process.exit(1)

      throw new Error('')
    }
  }
}

export async function exec(errorPrefix: string, command: string, options?: ExecOptions): Promise<ExecResponse> {
  try {
    const result = await execAsync(command, options)
    return result
  } catch (e) {
    throw new Error(`${errorPrefix} failed with exit code ${e.code} and  standard error:\n\n${e.stderr.trim()}`)
  }
}
