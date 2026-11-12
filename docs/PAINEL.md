# NÔDJUNTA PAY: painel de administração

## Quem pode fazer o quê

| Papel | Pode |
|---|---|
| support | Ver o resumo, procurar utilizadores por telefone, listar comerciantes |
| reviewer | Tudo o que o support faz, mais ver documentos de KYC, aprovar/recusar KYC, aprovar/suspender comerciantes |
| admin | Tudo o que o reviewer faz, mais congelar/descongelar carteiras e consultar a auditoria |

A API confirma o papel na tabela `admin_users` **a cada pedido**. O painel só esconde o que o papel não permite;
quem decide é sempre a API. Ninguém pode agir sobre a própria conta nem rever o próprio KYC.

## Criar o primeiro administrador

1. Supabase, Authentication, Users, **Add user**: crie um utilizador com email e palavra-passe forte.
2. No SQL Editor:

```sql
insert into public.admin_users (user_id, role)
select id, 'admin' from auth.users where email = 'o-seu-email@exemplo.com';
```

Para os restantes, use `'reviewer'` ou `'support'`. Para retirar o acesso sem apagar o histórico:

```sql
update public.admin_users set active = false
where user_id = (select id from auth.users where email = 'quem-sai@exemplo.com');
```

Qualquer outra conta (por exemplo, um cliente) que tente entrar no painel recebe "Sem acesso".

## Segurança (obrigatório antes de abrir ao público)

- **MFA:** a API ainda não o exige. Ative a autenticação de dois fatores nas contas de administrador
  (confirme a opção atual no painel do Supabase) e use palavras-passe únicas.
- Use poucas contas `admin`. Dê `reviewer` ou `support` à maioria.
- A sessão do painel fica em `sessionStorage` e termina ao fechar o separador.
- Os documentos de KYC são dados pessoais sensíveis: defina quem os vê, durante quanto tempo se guardam,
  e como se apagam. Cada consulta fica na auditoria (`ADMIN_KYC_DOCUMENTS_VIEW`).
- Reveja a auditoria com regularidade, e procure acessos fora do horário normal.

## Correr em desenvolvimento

```bash
cd apps/admin
cp .env.example .env       # preencha os 3 valores
npm install
npm run test
npm run typecheck
npm run dev                # abre em http://localhost:5173
```

No Replit use o URL público do Repl, e acrescente-o a `CORS_ORIGINS` da API (separado por vírgulas).
Sem isso o navegador bloqueia os pedidos do painel à API.

## Publicar (Render)

O `render.yaml` cria um site estático `nodjunta-pay-admin`.

1. Defina `VITE_API_URL`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (a chave **anon**, nunca a service_role).
2. Depois do primeiro deploy, copie o endereço do painel (por exemplo `https://nodjunta-pay-admin.onrender.com`)
   para `CORS_ORIGINS` do serviço da API, e volte a fazer o deploy da API.
3. Confirme os campos do `render.yaml` (tipos de serviço e cabeçalhos) na documentação do Render.
4. Opcional: restrinja o acesso ao painel por IP ou por VPN, para além do login.

## Tarefas do dia a dia

- **KYC:** separador "Verificações", abrir o pedido, "Ver documentos", decidir. Recusar exige motivo.
- **Comerciantes:** separador "Comerciantes", filtrar por "Pendentes", aprovar.
- **Suspeita de fraude:** separador "Utilizadores", procurar pelo telefone, congelar com motivo.
  Uma carteira congelada não envia nem paga. Devoluções automáticas de levantamentos falhados
  também não a creditam enquanto estiver congelada: descongele e trate o caso manualmente.
- **Resumo:** "Webhooks com falha" acima de zero exige investigação.
