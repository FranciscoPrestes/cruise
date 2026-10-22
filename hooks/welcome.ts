// The first time Cruise runs after being installed, it says once that /cruise opens the panel.
import type { EngineInterface, PluginOptions } from 'claude-code'

import { judgeMode } from './effort'

const KEY = 'cruise.welcomed'

export const welcomeText = (effortOn: boolean): string =>
  `Cruise is on. Type /cruise any time to see the panel${effortOn ? ' (it also shows the effort it is choosing)' : ''}, and /cruise:configure to change a setting.`

export async function welcome($: EngineInterface, options: PluginOptions): Promise<void> {
  try {
    if (await $.store.get(KEY)) return
    await $.store.set(KEY, true)
    $.ui.toast(welcomeText(judgeMode(options) !== 'off'))
  } catch {
    // A greeting is never worth a failure.
  }
}
