import process from "node:process"

import { notarize } from "@electron/notarize"

export default async function afterSign(context) {
  if (process.platform !== "darwin") return

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  if (!appleId || !appleIdPassword || !teamId) {
    console.log(
      "Skipping notarization. Missing APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID.",
    )
    return
  }

  const appName = context.packager.appInfo.productFilename
  await notarize({
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword,
    teamId,
  })
}
