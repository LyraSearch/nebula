import { join } from "path"

export async function getDataFromSource (sourcePath: string) {
  const getDynamicData = require(join(process.cwd(), sourcePath))
  return await getDynamicData()
}
