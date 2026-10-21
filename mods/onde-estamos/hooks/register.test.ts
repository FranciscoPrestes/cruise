import { expect, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`mostra pedido e etapa na faixa (${surface})`, async ($, on) => {
    on('clock.now', async () => ({ value: 1_000 }) as never)
    on('prompt.submit', async () => ({ text: 'ok' }) as never)
    on('tool.call', async () => ({ result: {} }) as never)
    await $.prompt.submit({ text: 'integra o módulo de cobrança ao app de planejamento usando a conexão existente' })
    await $.tool.call({
      tool: 'TodoWrite',
      input: { todos: [{ content: 'Ler', activeForm: 'Lendo o back', status: 'in_progress' }] },
    } as never)
    const ui = await $.ui.mount({ plugin: 'onde-estamos', surface, component: 'AbovePrompt', props: { bodyColumns: 120 } as never })
    expect(await ui.findAll({ text: /Pedido/ })).not.toHaveLength(0)
    expect(await ui.findAll({ text: /Etapa 1 de 1: Lendo o back/ })).not.toHaveLength(0)
  })
}

test('lista de tarefas de subagente não sobrescreve o plano principal', async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('tool.call', async () => ({ result: {} }) as never)
  await $.prompt.submit({ text: 'integra o módulo de cobrança ao app de planejamento usando a conexão existente' })
  await $.tool.call({ tool: 'TodoWrite', input: { todos: [{ content: 'Principal', activeForm: 'Fazendo o principal', status: 'in_progress' }] } } as never)
  await $.tool.call({ tool: 'TodoWrite', agentId: 'sub-1', input: { todos: [{ content: 'Do subagente', activeForm: 'Subagente', status: 'in_progress' }] } } as never)
  const ui = await $.ui.mount({ plugin: 'onde-estamos', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 120 } as never })
  expect(await ui.findAll({ text: /Fazendo o principal/ })).not.toHaveLength(0)
  expect(await ui.findAll({ text: /Subagente/ })).toHaveLength(0)
})
