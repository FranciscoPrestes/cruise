import { expect, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`shows request and step in the band (${surface})`, async ($, on) => {
    on('clock.now', async () => ({ value: 1_000 }) as never)
    on('prompt.submit', async () => ({ text: 'ok' }) as never)
    on('tool.call', async () => ({ result: {} }) as never)
    await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [{ content: 'Read', activeForm: 'Reading the backend', status: 'in_progress' }],
    } as never)
    const ui = await $.ui.mount({ plugin: 'onde-estamos', surface, component: 'AbovePrompt', props: { bodyColumns: 120 } as never })
    expect(await ui.findAll({ text: /Request/ })).not.toHaveLength(0)
    expect(await ui.findAll({ text: /Step 1 of 1: Reading the backend/ })).not.toHaveLength(0)
  })
}

test('a subagent task list does not overwrite the main plan', async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('tool.call', async () => ({ result: {} }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Main', activeForm: 'Doing the main work', status: 'in_progress' }] } as never)
  await $.tool.call({ tool: 'TodoWrite', agentId: 'sub-1', todos: [{ content: 'From the subagent', activeForm: 'Subagent', status: 'in_progress' }] } as never)
  const ui = await $.ui.mount({ plugin: 'onde-estamos', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 120 } as never })
  expect(await ui.findAll({ text: /Doing the main work/ })).not.toHaveLength(0)
  expect(await ui.findAll({ text: /Subagent/ })).toHaveLength(0)
})

const mountBand = ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  $.ui.mount({ plugin: 'onde-estamos', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 120 } as never })

test('a shorter request counts when the minimum length is lowered', { options: { minAskChars: 10 } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: 'fix the login bug' })
  expect(await (await mountBand($)).findAll({ text: /fix the login bug/ })).not.toHaveLength(0)
})

test('a short reply does not replace the request', async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  await $.prompt.submit({ text: 'go ahead' })
  expect(await (await mountBand($)).findAll({ text: /integrate billing/ })).not.toHaveLength(0)
})

test('background work from the last Stop is shown', async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('classic.Stop', async () => ({}) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [{ id: '1', type: 'shell', status: 'running', description: 'dev server' }], session_crons: [] } as never)
  expect(await (await mountBand($)).findAll({ text: /Running in background: 1 command/ })).not.toHaveLength(0)
})

test('TaskCreate and TaskUpdate drive the step shown', async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('tool.call', async (_$, e) => ({ result: e.tool === 'TaskCreate' ? { task: { id: '7', subject: 'Write tests' } } : {} }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write tests', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'in_progress', activeForm: 'Writing tests' } as never)
  expect(await (await mountBand($)).findAll({ text: /Step 1 of 1: Writing tests/ })).not.toHaveLength(0)
})
