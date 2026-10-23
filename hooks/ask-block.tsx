// The collapsed request, drawn the same way in the band above the prompt and in the /cruise dashboard.
import type { EngineInterface } from 'claude-code'

import { LESS, MORE } from './ask'
import type { AskView } from './ask'
import { cells } from './dash'

type Ui = ReturnType<EngineInterface['ui']['resolve']>

export const ASK_HOTKEY = 'e'

// ❯ the request rows (two when collapsed), and, only when the request is longer than that, a control to open or close it.
export function AskBlock({ Box, Text, Button }: Ui, view: AskView, onToggle: () => void, key: string) {
  const width = Math.max(0, ...view.rows.map(cells)) + 2
  return (
    <Box flexDirection="row">
      <Box flexDirection="column" width={width}>
        {view.rows.map((row, i) => (
          <Text>
            {i === 0 ? <Text color="cyan" bold>{'❯ '}</Text> : '  '}
            {row}
          </Text>
        ))}
      </Box>
      {view.control ? (
        <Box marginLeft={2}>
          <Button key={key} label={view.control === 'more' ? MORE : LESS} hotkey={ASK_HOTKEY} plain onPress={onToggle} />
        </Box>
      ) : null}
    </Box>
  )
}
