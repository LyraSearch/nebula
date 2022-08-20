export async function getDataFromSource (sourcePath: string) {
  const getDynamicData = require(sourcePath)
  return await getDynamicData()
}
