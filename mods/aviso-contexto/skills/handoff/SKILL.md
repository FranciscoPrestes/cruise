---
name: handoff
description: Prepara o handoff da sessão (Claude Code, Codex, Cursor, Gemini, OpenCode...) antes do context rot - grava o estado do trabalho para a próxima sessão retomar com /pickup. Use quando o contexto estiver cheio, quando pedirem "prepara o handoff", "prepara a passagem" ou "prompt para continuar em outra sessão".
---

# Handoff

Só prepara e grava. Para retomar, a próxima sessão usa `/pickup`.

## Como fazer

Não continue a tarefa. Só registre o estado.

1. Monte a passagem neste formato, com fatos concretos (IDs, caminhos, valores, comandos), nada genérico:

```markdown
---
agente: <claude-code | codex | cursor | gemini | opencode | ...>
pasta: <diretório de trabalho absoluto>
branch: <branch atual, se for repositório git>
data: <AAAA-MM-DDTHH:MM, horário local>
---

## <título curto da tarefa>

### Objetivo
Uma frase: o que estamos tentando entregar.

### Resumo para quem chega
Duas ou três frases para um agente sem contexto se orientar na hora.

### Intenção do próximo passo
Por que o próximo passo é esse: a hipótese em teste, o que se espera ver.

### Feito
- O que já está pronto e verificado.

### Fatos descobertos
- IDs, valores, estados, caminhos encontrados nesta sessão.

### Descartado
- Caminhos tentados e abandonados, e por quê.

### Próximos passos (desta tarefa)
1. O primeiro passo a executar.
2. ...

### Decisões pendentes
- O que só o usuário pode decidir, com as opções.

### Outras pendências
- Assuntos de fora desta tarefa. A próxima sessão NÃO deve pular para eles.
```

2. Grave o arquivo em `~/.local/state/handoffs/<slug-da-pasta>/<AAAA-MM-DD-HHMM>.md`, onde o slug é o caminho da pasta de trabalho com `/` trocado por `-`. Crie a pasta se não existir.
3. Se a ferramenta `memory_handoff_begin` do ai-memory estiver disponível, registre também a passagem lá, com o mesmo conteúdo.
4. Responda com: o caminho do arquivo, se foi para o ai-memory (sim ou não) e a instrução: limpe a sessão (ou abra uma nova na mesma pasta) e digite `/pickup`.
