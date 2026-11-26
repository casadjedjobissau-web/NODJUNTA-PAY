# NODJUNTA-PAY: integração contínua (GitHub Actions)

## O que corre, e quando
A cada push para o `main` e a cada pull request, o ficheiro `.github/workflows/ci.yml` corre seis jobs em paralelo:

| Job | O que verifica | Bloqueia? |
|---|---|---|
| `api` | `typecheck:api`, `test:api`, `build:api` | sim |
| `admin` | `typecheck`, `test` e `build` em `apps/admin` | sim |
| `mobile` | `typecheck` e `test` em `apps/mobile` | sim |
| `sql` | aplica as migrations no Supabase local e corre `supabase/tests/*_smoke.sql` | sim |
| `secrets` | chaves privadas, JWT no código, `service_role` no app/painel, `.env` versionados | sim |
| `dependencies` | `npm audit` (vulnerabilidades altas) | não, só avisa |

O teste `apps/api/src/docs/ci.test.ts` vigia a própria configuração: scripts que não existem, ações sem versão, jobs sem limite de tempo,
`package-lock.json` em falta, Dependabot que não cobre uma pasta.

## Pôr a funcionar (uma vez)
1. Faça commit dos três ficheiros `package-lock.json`: o da raiz, o de `apps/admin` e o de `apps/mobile`. O `npm ci` precisa deles.
2. Faça push de um ramo e abra uma pull request. Em "Actions" aparece a execução.
3. **Proteja o `main`** (Settings, Branches, regra para `main`): exigir que as verificações `API`, `Painel`, `App`, `Base de dados` e
   `Segredos` passem antes de juntar. Sem isto, a integração avisa mas não impede.

## Correr o mesmo em local
```bash
npm run typecheck:api && npm run test:api && npm run build:api
cd apps/admin  && npm run typecheck && npm run test && npm run build
cd apps/mobile && npm run typecheck && npm run test
bash scripts/check-secrets.sh
```
Os testes SQL precisam do Supabase local (Docker): `npx supabase start`, depois `bash scripts/run-sql-tests.sh`.
O script recusa bases que não sejam locais, a menos que confirme que é um projeto de testes:
`ALLOW_SQL_TESTS=yes DATABASE_URL=postgresql://... bash scripts/run-sql-tests.sh`. **Nunca contra produção.**

## Se um job falhar
- **`sql`:** abra o passo "Arrancar o Supabase local" (a falha é de uma migration, e o registo diz qual) ou "Testes SQL" (diz qual ficheiro).
- **`mobile` na instalação:** se o `npm ci` queixar-se de dependências em conflito (peer dependencies), cole-me o registo.
- **`secrets`:** mostra o nome do ficheiro, nunca o conteúdo. Se uma chave real foi para o repositório, **troque-a** no Supabase:
  apagá-la do ficheiro não chega, porque fica no histórico do Git.
- **`dependencies`:** só avisa. Corrija com `npm audit fix` na pasta indicada, ou atualize a dependência.

## O que a integração NÃO prova
- Que a app funciona num telemóvel: as listas de testes de cada guia continuam a ser manuais.
- Que o fluxo completo (SMS, push, provedor financeiro) funciona: isso depende de serviços externos.
- Que não há segredos no repositório: o job `secrets` apanha só os erros mais comuns.

## Dependabot
Propõe atualizações semanais da raiz (API), do painel e das ações do GitHub, em pull requests que passam pela mesma integração.
No app, ignora o Expo, o React e o React Native: têm de subir juntos, com `npx expo install --fix`, quando decidir mudar de SDK.
