# Mods do Claude Code — the company

Mods para o Claude Code usados no dia a dia do time.

| Mod | O que faz |
| --- | --- |
| `onde-estamos` | Faixa acima do prompt: pedido atual, etapa do plano e o que roda em segundo plano |
| `aviso-contexto` | Avisa quando o contexto passa de 75% e 90% e lembra de rodar a skill `/handoff` |

`aviso-contexto` sugere a skill `/handoff`; sem ela instalada, o aviso aparece do mesmo jeito, mas o comando não existe.

## Instalar

Pré-requisito: acesso a este projeto no GitLab da the company e Git configurado no computador (chave SSH ou credencial HTTPS).

No prompt do Claude Code:

```
/plugin marketplace add https://git.example.invalid/group/claude-code-mods.git
/plugin install onde-estamos@hub-de-ia-mods
/plugin install aviso-contexto@hub-de-ia-mods
```

Ou, num terminal:

```
claude plugin marketplace add https://git.example.invalid/group/claude-code-mods.git
claude plugin install onde-estamos@hub-de-ia-mods
claude plugin install aviso-contexto@hub-de-ia-mods
```

## Atualizar

```
/plugin marketplace update hub-de-ia-mods
```
