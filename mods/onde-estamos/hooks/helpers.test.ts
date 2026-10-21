import { expect, test } from 'claude-code/testing'

import { age, backgroundSummary, isRealAsk, oneLine, planFromTodos, planSummary } from './helpers'

test('respostas curtas e comandos não viram pedido', () => {
  expect(isRealAsk('pode seguir')).toBe(false)
  expect(isRealAsk('/model opus')).toBe(false)
  expect(isRealAsk('<task-notification> qualquer coisa bem longa aqui dentro do aviso')).toBe(false)
  expect(isRealAsk('integra o ledger ao app de planejamento usando a conexão do AXIS')).toBe(true)
})

test('etapa atual e total do plano', () => {
  const plan = planFromTodos([
    { content: 'Ler código', activeForm: 'Lendo código', status: 'completed' },
    { content: 'Escrever mod', activeForm: 'Escrevendo mod', status: 'in_progress' },
    { content: 'Testar', activeForm: 'Testando', status: 'pending' },
  ])
  expect(planSummary(plan)).toBe('Etapa 2 de 3: Escrevendo mod')
  expect(planSummary({})).toBe(null)
})

test('plano concluído', () => {
  const plan = planFromTodos([{ content: 'A', activeForm: 'A', status: 'completed' }])
  expect(planSummary(plan)).toBe('Plano concluído: 1 de 1')
})

test('segundo plano em português, agrupado', () => {
  expect(backgroundSummary(['subagent', 'subagent', 'shell'])).toBe('2 agentes, 1 comando')
  expect(backgroundSummary([])).toBe(null)
})

test('tempo e corte de linha', () => {
  expect(age(30_000)).toBe('agora')
  expect(age(12 * 60_000)).toBe('há 12 min')
  expect(oneLine('abc  def', 5)).toBe('abc …')
})
