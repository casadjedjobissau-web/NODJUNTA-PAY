# NÔDJUNTA PAY: guia de publicação

Ordem recomendada: Supabase, depois API no Render, depois app (EAS), depois lojas.
Confirme sempre nomes de menus, preços e requisitos na documentação oficial de cada serviço,
porque mudam com frequência.

## 1. Supabase (base de dados, login, armazenamento)

1. Crie um projeto em supabase.com (anote o URL e as chaves em Project Settings, API).
2. No SQL Editor, corra as migrations **por esta ordem** (pasta `supabase/migrations/`):
   1. `20261110000100_core_schema.sql`
   2. `20261110000200_ledger_functions.sql`
   3. `20261110000300_rls_and_grants.sql`
   4. `20261110000400_seed_system_accounts.sql`
   5. `20261110000500_phone_lookup.sql`
   6. `20261110000600_profiles_devices_audit.sql`
   7. `20261110000700_merchants.sql`
   8. `20261110000800_payment_requests.sql`
   9. `20261110000900_limits_and_fees.sql`
   10. `20261110001000_fee_refund_on_failure.sql`
   11. `20261110001100_kyc.sql`
   12. `20261110001200_webhooks_and_reconciliation.sql`
3. Corra os testes SQL (`supabase/tests/*.sql`) **num projeto de testes**, nunca no de produção
   (cada teste termina em `rollback`, mas por prudência use um projeto separado).
4. Authentication, Providers, Phone: ative o login por telefone e configure um provedor de SMS
   suportado pelo Supabase. Confirme com o provedor que ele entrega SMS para +245.
5. Storage: confirme que o bucket `kyc-documents` existe e é **privado**.
6. Chaves: a `anon` vai para o app; a `service_role` vai **só** para o Render. Nunca para o GitHub nem para o app.
7. Ative backups (Project Settings) e defina o plano adequado ao volume esperado.

## 2. API no Render

1. Em render.com, **New, Blueprint**, ligue o repositório do GitHub. O ficheiro `render.yaml` cria o serviço web e a tarefa diária de reconciliação.
2. Defina as variáveis marcadas como `sync: false`: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Defina `CORS_ORIGINS` com os endereços do painel admin (quando existir). O app mobile não usa CORS.
4. **Não defina** `SANDBOX_ENABLED` nem `WEBHOOK_SECRET_SANDBOX`: a API recusa arrancar em produção se existirem.
5. Verifique `https://SEU-SERVICO.onrender.com/health` (deve devolver `status: ok`).
6. Planos gratuitos adormecem por inatividade; para uma app de pagamentos use um plano sempre ligado.

## 3. Desenvolvimento no Replit

1. Importe o repositório do GitHub para um Repl.
2. Guarde as variáveis em **Secrets** (nunca em ficheiros commitados).
3. `npm install`, depois `npm run typecheck:api` e `npm run test:api`.
4. Para o app, `cd apps/mobile`, `npm install`, `npx expo start --tunnel`.

## 4. App: Expo Go e EAS Build

O Expo Go serve para desenvolvimento. Para publicar é preciso um build de produção com o EAS.

1. Crie uma conta em expo.dev e instale a CLI: `npm install -g eas-cli`, depois `eas login`.
2. Em `apps/mobile`, corra `eas init` (liga o projeto à sua conta) e `eas build:configure`.
3. Defina no painel do EAS (Environment variables) as variáveis públicas do build:
   `EXPO_PUBLIC_API_URL` (URL do Render), `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   O `eas.json` já força `EXPO_PUBLIC_SANDBOX_TOOLS=false` no perfil `production`.
4. Antes do primeiro build, confirme em `app.json` o `bundleIdentifier` e o `package`
   (`com.nodjuntapay.app` é provisório e **não pode ser mudado** depois de publicado) e acrescente
   o ícone (`"icon": "./assets/icon.png"`, 1024x1024, sem transparência).
5. Builds de teste (instalação interna): `eas build --platform android --profile preview`
   (e `ios` se tiver conta Apple; instalação em iPhone exige registo do dispositivo).
6. Builds de produção: `eas build --platform all --profile production`.
7. Envio para as lojas: `eas submit --platform android` e `eas submit --platform ios`.

## 5. Lojas

### Apple (App Store)
- Apple Developer Program (pago, renovação anual). Para apps financeiras a Apple costuma exigir que a conta seja de uma **organização**, não pessoal.
- Teste primeiro no TestFlight.
- Obrigatório: política de privacidade (URL público), formulário "App Privacy", conta de teste para os revisores (um número de telefone com código fixo ou instruções) e **eliminação de conta dentro da app**.

### Google (Play Store)
- Conta de programador Google Play (pagamento único). Contas pessoais novas podem ter de cumprir um período de teste fechado com um número mínimo de testadores antes da produção: confirme os requisitos atuais.
- Obrigatório: política de privacidade (URL público), formulário "Segurança dos dados", declaração de funcionalidades financeiras, classificação de conteúdo e **eliminação de conta** (incluindo um endereço web para o pedido).
- Comece pelo teste interno/fechado, depois produção.

### Ambas
- Antes de enviar uma app de pagamentos, confirme com um advogado que a licença/autorização regulatória está em ordem, porque as lojas podem pedir prova.
- Prepare capturas de ecrã, descrição em português, ícone e contacto de suporte.

## 6. Atualizações

- Correções só de JavaScript: `eas update` (confirme na documentação as regras de EAS Update e de versões de runtime).
- Alterações nativas (novas permissões, bibliotecas nativas): novo build e nova submissão.
- Migrations novas: aplique-as no Supabase **antes** de publicar a versão da API que as usa.
