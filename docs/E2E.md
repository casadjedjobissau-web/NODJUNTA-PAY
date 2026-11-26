# NODJUNTA-PAY: teste de ponta a ponta

## O que é
Um fluxo completo, com a API a sério (`buildApp` com a mesma ligação de serviços do servidor, em `apps/api/src/deps.ts`) a falar
com um **Supabase local** a sério (as 25 migrations aplicadas). Cria três utilizadores com tokens reais e percorre 16 passos:
PIN, depósito, transferência, idempotência, recibos, extrato, notificações, livro-razão, antifraude, KYC, suporte e eliminação de conta.

Está em `apps/api/src/e2e/flow.e2e.ts`. Os ficheiros `*.e2e.ts` **não** correm no `npm run test:api`.

## Correr em local
1. Docker a correr. Na raiz do repositório:
   ```bash
   npx supabase start
   ```
2. Leia as chaves e exporte-as (os nomes podem variar com a versão do CLI):
   ```bash
   npx supabase status -o env
   export E2E_SUPABASE_URL="http://127.0.0.1:54321"      # API_URL
   export E2E_ANON_KEY="..."                              # ANON_KEY
   export E2E_SERVICE_ROLE_KEY="..."                      # SERVICE_ROLE_KEY
   ```
3. Correr:
   ```bash
   cd apps/api
   npm run test:e2e
   ```
Sem as variáveis, o teste falha com uma mensagem a dizer o que falta (nunca fica "verde" por não ter corrido).

## Segurança do teste
- **Só corre contra um Supabase local.** O auxiliar recusa qualquer endereço que não seja `127.0.0.1` ou `localhost`,
  a menos que defina `E2E_ALLOW_REMOTE=yes`. **Nunca contra produção:** o teste cria utilizadores, saldos, pedidos e alterações aos limiares.
- O teste muda o limite de velocidade do antifraude (`velocity_max_ops`) durante um passo e **repõe-no no fim**, mesmo que um passo falhe.
- Os utilizadores criados ficam na base local (telemóveis aleatórios, sem colisões). Para limpar: `npx supabase db reset`.

## Na integração contínua
O job `sql` arranca o Supabase local, corre os testes SQL, lê as chaves com `supabase status -o env` (escondendo-as dos registos) e corre
`npm run test:e2e`. Se um passo falhar, o registo diz qual.

## O que prova, e o que não prova
**Prova:** que as peças funcionam juntas contra uma base de dados real: PIN, idempotência, saldos, recibos, notificações, livro-razão
equilibrado, antifraude, eliminação de conta.

**Não prova:**
- O painel de administração (exige o segundo fator). A resposta do suporte é simulada com a função da base de dados.
- O envio de SMS, o push e o provedor financeiro real.
- O app num telemóvel (as listas de testes manuais continuam necessárias).
- O desempenho ou o comportamento sob carga.

## Se um passo falhar
- **`createUser` ou `signInWithPassword` falha:** o Supabase local não aceita o telefone, ou o login por email e palavra-passe está desligado.
  Cole-me a mensagem. O ponto a ajustar é `apps/api/src/e2e/harness.ts`.
- **Um código de erro diferente do esperado** (por exemplo `pin_not_set`, `weak_pin`, `kyc_level_required`): a mensagem mostra o valor obtido.
  Confirme em `docs/API.md` e diga-me qual é o correto.
- **`admin_report_summary` ou `ledger_integrity_issues` falham:** a migration dos relatórios ou do livro-razão não foi aplicada.
- **O livro-razão não fecha a zero:** é um erro grave de contabilidade. Pare e investigue antes de continuar.
