# aviso-contexto

Avisa antes que o contexto da sessão encha e a qualidade das respostas caia (o "context rot"), e leva você ao `/handoff`.

## O que acontece

| Contexto usado | Aviso |
| --- | --- |
| 75% | Aviso na tela: "Quando fechar esta etapa, digite /handoff" |
| 90% | Aviso na tela **e** notificação do sistema: "Digite /handoff agora, antes da compactação" |
| Qualquer valor acima de 75% | Na linha de status: `Contexto 82% · digite /handoff` |

Cada faixa avisa **uma vez**. Se o contexto cair abaixo de 50% (por exemplo, depois de uma compactação), os avisos voltam a valer.

## Skills incluídas

O mod instala as skills de que o aviso depende:

- **`/handoff`**: grava o estado do trabalho em `~/.local/state/handoffs/<pasta>/<data>.md`, com objetivo, o que foi feito, fatos descobertos, descartes, próximos passos e decisões pendentes. Se a ferramenta `memory_handoff_begin` do ai-memory estiver conectada, grava lá também; sem ela, só o arquivo.
- **`/pickup`**: numa sessão nova na mesma pasta, lê o último handoff, confere pasta e branch, resume em até 5 linhas e executa o primeiro próximo passo.

## Instalar

```text
/plugin marketplace add https://git.example.invalid/group/claude-code-mods.git
/plugin install aviso-contexto@hub-de-ia-mods
```

## Limites

- Os limites (75%, 90%, 50%) ficam em `hooks/levels.ts`. Para mudar, edite o arquivo e aumente a `version`.
- A conferência acontece quando um turno termina, não durante.
- Textos em português.

## Estrutura

- `hooks/register.ts`: confere o contexto ao fim de cada turno e mostra os avisos.
- `hooks/levels.ts`: regra pura de qual aviso dar.
- `skills/handoff`, `skills/pickup`: as skills.
- `types/index.d.ts`: formato dos dados guardados na sessão.
