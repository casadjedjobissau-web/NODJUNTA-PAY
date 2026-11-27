# NODJUNTA-PAY: publicar a API e o painel

Faça isto **depois** de a integração contínua estar verde (ver `docs/CI.md`) e de ter percorrido `docs/CHECKLIST_PRODUCAO.md`.
Esta é a ordem. A publicação das lojas está em `docs/LOJAS.md`.

**Antes de tudo:** crie **dois** projetos no Supabase: um de **testes** (onde corre o que for experimental) e um de **produção**.
Os testes SQL (`scripts/run-sql-tests.sh`) só correm no de testes. Nunca em produção.

## 1. Supabase (projeto de produção)

1. **Criar o projeto** e guardar a palavra-passe da base de dados num gestor de palavras-passe. Escolha a região mais próxima dos utilizadores
   (confirme as regiões disponíveis e a latência).
2. **Aplicar as migrations**, na raiz do repositório:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_REF
   npx supabase db push
   npx supabase migration list
   ```
   Devem aparecer as 25 migrations aplicadas. Se uma falhar, o erro diz qual: pare, não force.
3. **Autenticação por telefone** (Authentication, Providers, Phone):
   - Ligue o fornecedor e escolha um serviço de SMS que **tenha cobertura para +245** (decisão sua, ver `docs/DECISOES.md`).
   - Reveja o tempo de validade do código e os limites de envio por hora.
   - **Números de teste para os revisores das lojas:** os revisores da Apple e da Google não podem receber um SMS. O Supabase permite
     definir números de teste com um código fixo (confirme onde, na documentação). Use um número que **só** exista para isto.
4. **MFA** (Authentication, definições de MFA): ligar o **TOTP**. Sem isto o painel não deixa ninguém entrar em produção.
5. **Contas de administração:** crie-as em Authentication, Users, "Add user", com email e palavra-passe fortes.
   Depois dê-lhes o papel (no SQL Editor):
   ```sql
   select id, email from auth.users where email = 'pessoa@exemplo.com';
   insert into public.admin_users (user_id, role) values ('UUID-DA-CONTA', 'admin');
   ```
   Papéis: `support`, `reviewer`, `admin`. **Tenha pelo menos duas contas `admin`**, cada uma com o seu autenticador:
   a troca de número exige duas pessoas diferentes, e quem perder o telemóvel precisa que outro o desbloqueie.
   Confirme também nas definições se quer impedir registos novos por email (os clientes entram por telefone).
6. **Armazenamento:** confirme em Storage que o bucket `kyc-documents` existe e é **privado**. O teste `security_smoke.sql` também o verifica.
7. **Cópias de segurança:** ative-as e **teste um restauro** num projeto à parte antes de abrir ao público.
8. **Chaves** (Project Settings, API): copie `URL`, `anon` e `service_role`.
   **A `service_role` só vai para o Render.** Nunca para o app, para o painel ou para o GitHub.

## 2. Render

1. **Blueprint:** New, Blueprint, ligue o repositório do GitHub. O Render lê o `render.yaml` e cria três serviços:
   `nodjunta-pay-api`, `nodjunta-pay-reconcile` (todos os dias às 03:00 UTC) e `nodjunta-pay-admin` (painel estático).
2. **Preencher os segredos** que o Render pede (os marcados `sync: false`):

   | Serviço | Variável | Valor |
   |---|---|---|
   | API e reconciliação | `SUPABASE_URL` | URL do projeto de produção |
   | API e reconciliação | `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` |
   | API e reconciliação | `PIN_PEPPER` | `openssl rand -hex 32`. **Guarde-o num cofre.** Se o perder ou o trocar, todos os PIN deixam de funcionar |
   | API | `CORS_ORIGINS` | o endereço do painel (preencha depois do passo 4) |
   | API | `EXPO_ACCESS_TOKEN` | deixe vazio, a menos que ative a segurança reforçada do push no Expo |
   | Painel | `VITE_API_URL` | o endereço da API (preencha depois do passo 3) |
   | Painel | `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` | URL e chave `anon` (a pública) |

3. **Ordem:** publique primeiro a API. Copie o endereço dela e use-o em `VITE_API_URL` do painel.
4. Publique o painel. Copie o endereço dele para `CORS_ORIGINS` da API e **volte a publicar a API**.
5. **A API recusa arrancar** em produção se o sandbox estiver ligado, ou se `PIN_ENFORCEMENT` ou `ADMIN_MFA` estiverem desligados.
   Se o serviço não arrancar, leia o registo: a mensagem diz qual variável está errada.

### Verificar depois de publicar
```bash
curl -s https://SUA-API.onrender.com/health
curl -s https://SUA-API.onrender.com/public/support
```
O primeiro deve devolver `"status":"ok"`, o segundo os dois números de suporte.
Depois, no painel: entre com uma conta `admin`, configure o autenticador, e confirme que o Resumo carrega e que Relatórios mostra
o livro-razão "Equilibrado (0)".

### Domínio e monitorização
- Ligue um domínio próprio à API e ao painel (HTTPS é automático no Render). Atualize `CORS_ORIGINS`, `VITE_API_URL` e o `EXPO_PUBLIC_API_URL` da app.
- O plano `starter` fica sempre ligado. Ponha um monitor externo a chamar `/health` a cada minuto e a avisar por mensagem ou email.
- **Não há integração com um serviço de alertas de erros** (Sentry ou semelhante). Está na lista de decisões.
- A reconciliação diária compara o livro-razão. Se aparecerem diferenças no registo do `nodjunta-pay-reconcile`, é um alerta grave:
  pare e investigue (ver `docs/CHECKLIST_PRODUCAO.md`).

## 3. Provedor financeiro
**Ainda não existe.** Em produção só há o provedor "não configurado": depósitos e levantamentos reais **não funcionam**,
e é assim de propósito. Só se integra um provedor real depois de ter o contrato e a documentação oficial da API dele.

## 4. Primeira abertura (ensaio geral)
Antes de convidar alguém: percorra `docs/PIN_NO_APP.md`, `docs/NOTIFICACOES.md`, `docs/RECIBOS_NO_APP.md`,
`docs/SUPORTE_E_ELIMINACAO_NO_APP.md` e `docs/PAINEL_OPERACOES.md` num telemóvel real, contra a **produção**, com duas contas suas.
