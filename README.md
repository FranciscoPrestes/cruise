# Mods do Claude Code — the company

Dois mods para quem usa o Claude Code todo dia e quer sempre saber **o que está sendo feito** e **quando a sessão está ficando cheia demais**.

| Mod | Para que serve | Precisa de mais alguma coisa? |
| --- | --- | --- |
| [`onde-estamos`](mods/onde-estamos/README.md) | Faixa fixa acima do prompt com o pedido atual, a etapa do plano e o que roda em segundo plano | Não |
| [`aviso-contexto`](mods/aviso-contexto/README.md) | Avisa quando o contexto passa de 75% e 90% e leva você ao handoff | Já traz as skills `/handoff` e `/pickup` |

## Requisitos

- Claude Code com suporte a mods (plugins com hooks em TypeScript). Confira com `claude --version` e atualize se `/plugin` não existir.
- Acesso de leitura a este projeto no GitLab da the company (peça convite ao dono do grupo **Hub de IA Experimentação**).
- Git configurado no seu computador para clonar do `git.example.invalid` (chave SSH ou credencial HTTPS).

## Instalar

No prompt do Claude Code:

```text
/plugin marketplace add https://git.example.invalid/group/claude-code-mods.git
/plugin install onde-estamos@hub-de-ia-mods
/plugin install aviso-contexto@hub-de-ia-mods
```

Você pode instalar só um dos dois. Depois de instalar, rode `/reload-plugins` ou abra uma nova sessão.

Fora do Claude Code, no terminal, os comandos são os mesmos com `claude plugin` no lugar de `/plugin`.

## Como conferir que funcionou

1. `/plugin` deve listar `onde-estamos` e `aviso-contexto` como instalados.
2. Mande um pedido longo (40 caracteres ou mais). A faixa `Pedido (agora): ...` aparece acima do prompt.
3. O aviso de contexto só aparece quando o uso passa de 75%. Para ver sem esperar, use uma sessão longa ou peça a um colega que já tenha visto.

## Skills que acompanham

O `aviso-contexto` instala duas skills. Elas existem porque o aviso diz "digite `/handoff`": sem a skill, o comando não existe.

| Skill | O que faz |
| --- | --- |
| `/handoff` | Grava o estado do trabalho (objetivo, o que foi feito, próximos passos, decisões pendentes) em `~/.local/state/handoffs/<pasta>/` para uma próxima sessão retomar. Não continua a tarefa. |
| `/pickup` | Numa sessão nova, lê o último handoff daquela pasta, confere pasta e branch e retoma do primeiro próximo passo. |

Fluxo recomendado ao receber o aviso:

1. Termine a etapa em andamento.
2. Digite `/handoff`.
3. Limpe a sessão (`/clear`) ou abra uma nova **na mesma pasta**.
4. Digite `/pickup`.

Se você já tem uma skill sua chamada `handoff` ou `pickup`, os nomes vão coincidir. Nesse caso use a do plugin pelo nome completo (`/aviso-contexto:handoff`) ou remova a sua.

## Atualizar e remover

```text
/plugin marketplace update hub-de-ia-mods
/plugin uninstall onde-estamos@hub-de-ia-mods
/plugin uninstall aviso-contexto@hub-de-ia-mods
```

## Limitações conhecidas

- Todos os textos estão em português. Trocar o idioma exige editar o código do mod.
- Os limites de 75% e 90% são fixos no código (`mods/aviso-contexto/hooks/levels.ts`).
- O `aviso-contexto` só confere o contexto quando um turno termina. Numa execução autônoma muito longa, o aviso pode chegar tarde.
- O `onde-estamos` mostra o que roda em segundo plano apenas depois que um turno termina, então o número pode ficar desatualizado entre um turno e outro.

## Desenvolver e testar

```bash
claude plugin validate .                    # marketplace e manifestos
claude plugin test mods/onde-estamos        # testes do mod
claude plugin test mods/aviso-contexto
claude --plugin-dir mods/onde-estamos       # roda o mod direto da pasta, sem instalar
```

Mudanças entram por merge request. Ao mudar um mod, aumente a `version` no `plugin.json` dele, para a atualização chegar aos colegas.
