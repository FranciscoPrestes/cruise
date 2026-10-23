import { expect, mock, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`shows request and step in the band (${surface})`, { options: { progress: true } }, async ($, on) => {
    on('clock.now', async () => ({ value: 1_000 }) as never)
    on('prompt.submit', async () => ({ text: 'ok' }) as never)
    on('tool.call', async () => ({ result: {} }) as never)
    await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [{ content: 'Read', activeForm: 'Reading the backend', status: 'in_progress' }],
    } as never)
    const ui = await $.ui.mount({ plugin: 'cruise', surface, component: 'AbovePrompt', props: { bodyColumns: 120 } as never })
    expect(await ui.findAll({ text: /❯/ })).not.toHaveLength(0)
    expect(await ui.findAll({ text: /Reading the backend/ })).not.toHaveLength(0)
  })
}

test('a subagent task list does not overwrite the main plan', { options: { progress: true } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('tool.call', async () => ({ result: {} }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Main', activeForm: 'Doing the main work', status: 'in_progress' }] } as never)
  await $.tool.call({ tool: 'TodoWrite', agentId: 'sub-1', todos: [{ content: 'From the subagent', activeForm: 'Subagent', status: 'in_progress' }] } as never)
  const ui = await $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 120 } as never })
  expect(await ui.findAll({ text: /Doing the main work/ })).not.toHaveLength(0)
  expect(await ui.findAll({ text: /Subagent/ })).toHaveLength(0)
})

const mountBand = ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 120 } as never })

test('a shorter request counts when the minimum length is lowered', { options: { progress: true, minAskChars: 10 } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: 'fix the login bug' })
  expect(await (await mountBand($)).findAll({ text: /fix the login bug/ })).not.toHaveLength(0)
})

test('a short reply does not replace the request', { options: { progress: true } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  await $.prompt.submit({ text: 'go ahead' })
  expect(await (await mountBand($)).findAll({ text: /integrate billing/ })).not.toHaveLength(0)
})

test('background work from the last Stop is shown', { options: { progress: true } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('classic.Stop', async () => ({}) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [{ id: '1', type: 'shell', status: 'running', description: 'dev server' }], session_crons: [] } as never)
  expect(await (await mountBand($)).findAll({ text: /⚙ 1 command/ })).not.toHaveLength(0)
})

test('TaskCreate and TaskUpdate drive the step shown', { options: { progress: true } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('tool.call', async (_$, e) => ({ result: e.tool === 'TaskCreate' ? { task: { id: '7', subject: 'Write tests' } } : {} }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write tests', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'in_progress', activeForm: 'Writing tests' } as never)
  expect(await (await mountBand($)).findAll({ text: /Writing tests/ })).not.toHaveLength(0)
})

const askAndMount = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
}

test('a background shell appears as soon as it starts', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async () => ({ result: { backgroundTaskId: 'b1', stdout: '', stderr: '', interrupted: false } }) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true } as never)
  expect(await (await mountBand($)).findAll({ text: /⚙ 1 command/ })).not.toHaveLength(0)
})

test('a stopped task leaves the band immediately', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async (_$, e) => ({ result: e.tool === 'Bash' ? { backgroundTaskId: 'b1' } : {} }) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true } as never)
  await $.tool.call({ tool: 'TaskStop', task_id: 'b1' } as never)
  expect(await (await mountBand($)).findAll({ text: /Running in background/ })).toHaveLength(0)
})

test('a monitor and a schedule are counted too', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async (_$, e) => ({ result: e.tool === 'Monitor' ? { taskId: 'm1' } : { id: 'c1' } }) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'Monitor', description: 'd', timeout_ms: 1000, command: 'tail -f x' } as never)
  await $.tool.call({ tool: 'CronCreate', cron: '* * * * *', prompt: 'p' } as never)
  expect(await (await mountBand($)).findAll({ text: /1 monitor, 1 schedule/ })).not.toHaveLength(0)
})

test('a task that ends on its own leaves the band when its notification arrives', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async () => ({ result: { backgroundTaskId: 'b1' } }) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true } as never)
  const text = '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n</task-notification>'
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
  expect(await (await mountBand($)).findAll({ text: /Running in background/ })).toHaveLength(0)
})

test('a workflow is counted and leaves when its notification arrives', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async () => ({ result: { status: 'async_launched', taskId: 'w1' } }) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'Workflow', name: 'review' } as never)
  expect(await (await mountBand($)).findAll({ text: /1 workflow/ })).not.toHaveLength(0)
  const text = '<task-notification>\n<task-id>w1</task-id>\n<status>completed</status>\n</task-notification>'
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
  expect(await (await mountBand($)).findAll({ text: /Running in background/ })).toHaveLength(0)
})

test('a command sent to the background with Ctrl+B is followed too', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async () => ({ result: { backgroundTaskId: 'b9', backgroundedByUser: true, stdout: '', stderr: '', interrupted: false } }) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'Bash', command: 'sleep 600' } as never)
  expect(await (await mountBand($)).findAll({ text: /⚙ 1 command/ })).not.toHaveLength(0)
})

test('a background shell started by another tool is followed too', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async () => ({ result: { backgroundTaskId: 'p1' } }) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'PowerShell', command: 'Start-Sleep 600' } as never)
  expect(await (await mountBand($)).findAll({ text: /⚙ 1 command/ })).not.toHaveLength(0)
})

test('the engine\'s own list at Stop corrects anything the band missed', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async () => ({ result: { backgroundTaskId: 'gone' } }) as never)
  on('classic.Stop', async () => ({}) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'Bash', command: 'x', run_in_background: true } as never)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [{ id: 'real', type: 'monitor', status: 'running', description: 'd' }], session_crons: [] } as never)
  const band = await mountBand($)
  expect(await band.findAll({ text: /1 monitor/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /command/ })).toHaveLength(0)
})

test('the "x min ago" label moves on by itself as the minutes pass', { options: { progress: true } }, async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('session.start', async () => ({ cwd: '/tmp' }) as never)
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  const band = await mountBand($) // stays mounted: nothing remounts it, so only the tick can redraw it
  expect(await band.findAll({ text: /^now|│  now|now$/ })).not.toHaveLength(0)
  await clock.advance(5 * 60_000)
  expect(await band.findAll({ text: /5 min ago/ })).not.toHaveLength(0)
})

test('a task created but not started shows its subject as the step', { options: { progress: true } }, async ($, on) => {
  on('tool.call', async (_$, e) => ({ result: e.tool === 'TaskCreate' ? { task: { id: '3', subject: 'Draft the report' } } : {} }) as never)
  await askAndMount($, on)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Draft the report', description: 'd' } as never)
  expect(await (await mountBand($)).findAll({ text: /Draft the report/ })).not.toHaveLength(0)
})

test('the progress band can be switched off in the settings', { options: { progress: false } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  // With the band off nothing draws it: the mount finds nothing to render, or renders without the request line.
  let drawn = false
  try {
    drawn = (await (await mountBand($)).findAll({ text: /❯/ })).length > 0
  } catch {
    drawn = false
  }
  expect(drawn).toBe(false)
})

const HUGE = Array.from({ length: 5 }, (_, i) => `Review the billing module and list every place where currency conversion could drift (part ${i + 1}). `.repeat(6)).join('\n\n')

test('a huge request is collapsed to two rows with a control; the control opens it and a new prompt closes it again', { options: { progress: true } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: HUGE })
  const band = await $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 80, maxRows: 40 } as never })
  expect(await band.findAll({ text: /\+ more/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /…$/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /part 5/ })).toHaveLength(0)

  await $.ui.press({ plugin: 'cruise', key: 'ask-more' })
  expect(await band.findAll({ text: /- less/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /part 5/ })).not.toHaveLength(0)

  await $.prompt.submit({ text: 'now fix the login redirect after the session expires' })
  expect(await band.findAll({ text: /\+ more/ })).toHaveLength(0)
  expect(await band.findAll({ text: /login redirect/ })).not.toHaveLength(0)
})

test('a pasted request (wrapped in <pasted_content>) still becomes the request', { options: { progress: true } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: `<pasted_content id="c665">\n${HUGE}\n</pasted_content id="c665">` })
  const band = await mountBand($)
  expect(await band.findAll({ text: /Review the billing module/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /pasted_content/ })).toHaveLength(0)
})

test('a short request has no control',{ options: { progress: true } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  expect(await (await mountBand($)).findAll({ text: /more|less/ })).toHaveLength(0)
})
