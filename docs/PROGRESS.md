# NÔDJUNTA PAY: progresso

Mercado: Guiné-Bissau (XOF, sem subunidade). Identificador: telefone +245.

## Concluído (backend)
- Lote 1-2: base da API (Fastify/TS), ledger de partidas dobradas, idempotência, RLS
- Lote 3: auth (JWT Supabase), carteira, extrato
- Lote 4: transferências por telefone
- Lote 5: perfil, dispositivos, auditoria (hook em escritas)

## Testes
- API (vitest): 36 testes esperados
- SQL: supabase/tests/ledger_smoke.sql, phone_lookup.sql, audit_smoke.sql

## Por fazer
- Lote 6: depósitos/levantamentos (sandbox), QR, comerciantes
- Lote 7: webhooks assinados
- Lote 8: KYC, limites, tarifas, antifraude
- Painel admin, app Expo, testes finais, deploy (Render/Supabase/EAS)

## Estado de verificação
Código escrito sem rede: npm install, typecheck e testes ainda NÃO foram executados.
