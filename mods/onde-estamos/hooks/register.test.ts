import { expect, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`mostra pedido e etapa na faixa (${surface})`, async ($, on) => {
    on('clock.now', async () => ({ value: 1_000 }) as never)
    on('prompt.submit', async () => ({ text: 'ok' }) as never)
    on('tool.call', async () => ({ result: {} }) as never)
    await $.prompt.submit({ text: 'integra o ledger ao app de planejamento usando a conexão do AXIS' })
    await $.tool.call({
      tool: 'TodoWrite',
      input: { todos: [{ content: 'Ler', activeForm: 'Lendo o back', status: 'in_progress' }] },
    } as never)
    const ui = await $.ui.mount({ plugin: 'onde-estamos', surface, component: 'AbovePrompt', props: { bodyColumns: 120 } as never })
    expect(await ui.findAll({ text: /Pedido/ })).not.toHaveLength(0)
    expect(await ui.findAll({ text: /Etapa 1 de 1: Lendo o back/ })).not.toHaveLength(0)
  })
}
