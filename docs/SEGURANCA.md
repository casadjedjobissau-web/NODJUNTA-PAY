# NODJUNTA-PAY: testes de segurança

## O que correm, e onde
- **API:** `apps/api/src/security/security.test.ts` e `apps/api/src/security/no-store.test.ts`, com o resto dos testes (`npm run test:api`, e a integração contínua).
- **Base de dados:** `supabase/tests/security_smoke.sql`, com os outros testes SQL (`bash scripts/run-sql-tests.sh`, e o job `sql`).

## O que verificam
**API**
- As rotas percorridas são exatamente as 62 documentadas. Uma rota nova esquecida faz o teste falhar.
- Sem token, com token inválido, com o token no endereço, com o esquema `Basic` ou com token vazio: `401` em todas as rotas privadas.
- Administração: sem token `401`, sem o segundo fator `mfa_required` (para administradores e para clientes), com o segundo fator mas sem papel `forbidden`. Em todas as 23 rotas.
- O PIN nunca aparece no corpo nem nos cabeçalhos das respostas (três operações de dinheiro, definir e alterar).
- Webhooks sem assinatura ou com assinatura errada não chegam ao serviço e não revelam o segredo.
- Com o sandbox desligado, a rota de simulação não existe.
- Cabeçalhos do Helmet, CORS fechado por omissão e restrito à lista, erro interno sem detalhes, JSON inválido sem rasto da pilha,
  corpo acima de 1 MiB recusado, limite de 100 pedidos por minuto.
- **Todas as respostas levam `Cache-Control: no-store`** (públicas, autenticadas, operações de dinheiro, `401`, `404` e `500`),
  para saldos, movimentos e dados pessoais nunca ficarem em caches intermédias. Uma rota que defina o seu próprio valor mantém-no.

**Base de dados**
- RLS ligado em todas as tabelas do `public`.
- `anon` sem nenhum acesso. `authenticated` sem escrita em nada.
- PIN, antifraude, trocas de número, eliminações e administradores ilegíveis para `authenticated`.
- Funções `SECURITY DEFINER` com `search_path` fixo e não executáveis por `anon` nem `authenticated`.
- Bucket `kyc-documents` privado e sem políticas de leitura.

## Quando um falha
- **`tabelas sem RLS`, `anon tem acesso a`, `authenticated pode escrever em`:** uma migration deixou um privilégio por revogar.
  Corrija com `alter table ... enable row level security;` ou `revoke all on ... from anon, authenticated;` **numa migration nova**
  (nunca editando uma já aplicada em produção).
- **`funcoes SECURITY DEFINER sem search_path`:** acrescente `set search_path = public, pg_temp` à função, numa migration nova.
- **`executaveis por anon ou authenticated`:** `revoke execute on function ... from public, anon, authenticated;` e `grant ... to service_role;`.
- **Uma rota respondeu algo diferente de 401 sem sessão:** a rota está fora do âmbito autenticado em `apps/api/src/app.ts`. É grave: corrija antes de qualquer outra coisa.
- **`as rotas percorridas são exatamente as documentadas`:** acrescentou ou removeu uma rota sem atualizar os ficheiros `docs/openapi*.yaml`.
- **Uma resposta sem `no-store`:** o gancho `onSend` de `apps/api/src/plugins/no-store.ts` tem de estar registado em `app.ts` antes dos plugins.

## O que NÃO cobrem
- Testes de intrusão: um teste feito por especialistas continua a ser necessário **antes de haver dinheiro real**.
- Negação de serviço além do limite de pedidos por IP.
- Vulnerabilidades das dependências (o job `dependencies` da integração avisa).
- O que é escrito nos logs: a retirada do PIN e do token dos registos não é testada.
- A segurança do código no telemóvel e no painel (por exemplo, o que fica guardado no dispositivo).
- O painel estático no Render: os cabeçalhos dele vêm do `render.yaml`, não da API.
