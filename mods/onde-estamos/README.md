# onde-estamos

Faixa fixa acima do prompt do Claude Code. Em sessões longas, responde de relance: o que pedi, em que etapa estamos e o que ainda está rodando.

```text
Pedido (há 12 min): integra o módulo de cobrança ao app de planejamento usando a conexão existente
Etapa 3 de 5: Escrevendo os testes de integração
Em segundo plano: 2 agentes, 1 comando
```

## O que cada linha mostra

| Linha | Origem | Quando some |
| --- | --- | --- |
| `Pedido (há X): ...` | Seu último pedido real | Enquanto não houver pedido na sessão |
| `Etapa N de M: ...` | Lista de tarefas do Claude (`TodoWrite`, `TaskCreate`, `TaskUpdate`) | Quando não há plano. Ao terminar, mostra `Plano concluído` |
| `Em segundo plano: ...` | Agentes, comandos, monitores, workflows e agendamentos ativos | Quando nada roda |

## Regras que você deve saber

- Só conta como **pedido** texto com 40 caracteres ou mais, que não comece com `/` nem `<`. Respostas curtas como "pode seguir" não trocam o pedido.
- Um novo pedido zera o plano anterior.
- A lista de tarefas de **subagentes** é ignorada; a etapa mostrada é sempre a da conversa principal.
- A faixa é só informativa: se algo falhar dentro dela, o prompt e as ferramentas seguem normalmente.
- A faixa some quando o Claude Code mostra a pesquisa de satisfação.

## Instalar

```text
/plugin marketplace add https://git.example.invalid/group/claude-code-mods.git
/plugin install onde-estamos@hub-de-ia-mods
```

Não depende de skills nem de outros plugins.

## Estrutura

- `hooks/register.tsx`: liga a faixa aos eventos do Claude Code.
- `hooks/helpers.ts`: funções puras (texto de uma linha, idade, resumo do plano).
- `types/index.d.ts`: formato dos dados guardados na sessão.
