# NODJUNTA-PAY: guia da API

## Os dois contratos
| Ficheiro | Quem o usa | Rotas |
|---|---|---|
| `docs/openapi.yaml` | App móvel | 39 (`/v1/*`, `/public/support`, `/health`, `/webhooks/{provider}`) |
| `docs/openapi-admin.yaml` | Painel de administração | 23 (`/admin/v1/*`) |

Para os ler de forma navegável, cole o conteúdo num visualizador de OpenAPI (por exemplo, o Swagger Editor).

**Manter a documentação em dia.** Se acrescentar, remover ou mudar uma rota:
1. Altere o YAML correspondente.
2. Corra `npm run test:api -w . -- src/docs` (ou `npm run test:api`).
O teste de paridade falha e diz qual é a rota em falta, ou a que já não existe.
O teste de permissões falha se um papel passar a ter (ou a perder) acesso a uma operação sem a documentação o refletir.

## Convenções
- **Dinheiro:** inteiros em XOF, sem subunidade. Nunca decimais.
- **Datas:** texto ISO 8601 em UTC (`2026-11-14T10:00:00.000Z`). Os relatórios usam dias `AAAA-MM-DD`, em UTC.
- **Autenticação:** `Authorization: Bearer <token>`, o token de sessão do Supabase. Login só por telefone e SMS.
- **Erros:** sempre `{"error": "codigo", "message": "texto em português"}`. A app decide pelo `error`, e mostra o `message`.
- **Paginação:** por cursor. Cada página traz `nextCursor`. Para a seguinte, envie `before=<nextCursor>`. `nextCursor` nulo é o fim.
- **Idempotência:** as operações que movem dinheiro (e os depósitos) exigem `Idempotency-Key` (8 a 128 caracteres).
  Repetir com a mesma chave devolve o resultado já registado, com `replayed: true`, e nunca cobra duas vezes.
  Se a ligação falhar a meio, repita com a MESMA chave. Com dados diferentes, use uma chave nova.
- **PIN:** `POST /v1/transfers`, `/v1/payments/merchant` e `/v1/withdrawals` exigem `X-Pin` (6 dígitos). A eliminação de conta exige-o se o utilizador tiver PIN.
- **Limites de pedidos:** cada rota sensível tem o seu limite por minuto. Passado, a resposta é 429 (`request_error`).

## Fluxo típico de um pagamento
1. Entrar por SMS (Supabase). Obter o token.
2. `GET /v1/pin`. Se `hasPin` for falso, `POST /v1/pin` para definir o PIN. Sem PIN, as operações de dinheiro recebem `pin_not_set`.
3. `GET /v1/wallet` para o saldo. `GET /v1/limits` para o que o nível de verificação permite.
4. A operação (por exemplo, `POST /v1/transfers`) com `Idempotency-Key` e `X-Pin`.
5. `GET /v1/receipts/{transactionId}` para o recibo. O `transactionId` vem na resposta, e em cada linha do extrato.

## Catálogo de erros
| Estado | Código | Quando |
|---|---|---|
| 400 | `invalid_body`, `invalid_query`, `invalid_params` | Validação. O `message` lista os campos |
| 400 | `invalid_idempotency_key` | Cabeçalho em falta ou fora de 8 a 128 caracteres |
| 400 | `pin_required`, `invalid_pin_format` | `X-Pin` em falta, ou sem 6 dígitos |
| 400 | `weak_pin`, `same_pin` | PIN fraco (sequência, repetição), ou igual ao atual |
| 400 | `cannot_transfer_to_self`, `cannot_pay_self`, `invalid_merchant_code` | Regras das operações |
| 401 | `unauthorized`, `invalid_signature` | Sem sessão, ou webhook com assinatura inválida |
| 403 | `pin_not_set`, `invalid_pin` | PIN por definir, ou errado (traz `attemptsLeft`) |
| 403 | `recent_login_required` | Operação sensível sem um login por SMS nos últimos 10 minutos |
| 403 | `kyc_level_required` | O nível de verificação não permite a operação |
| 403 | `withdrawal_cooldown` | Levantamentos em pausa depois de trocar o PIN ou o número |
| 403 | `account_frozen`, `admin_account` | Eliminação de conta recusada |
| 403 | `forbidden`, `mfa_required` | Administração: sem permissão, ou sem segundo fator |
| 403 | `not_allowed_on_self`, `same_person_not_allowed` | Administração: ação sobre a própria conta, ou que exige duas pessoas |
| 404 | `not_found` | Rota ou recurso inexistente |
| 404 | `recipient_not_found`, `merchant_not_found`, `ticket_not_found`, `notification_not_found`, `receipt_not_available`, `submission_not_found`, `request_not_found`, `user_not_found`, `alert_not_found` | O recurso não existe, ou não é do utilizador |
| 409 | `idempotency_conflict` | Chave de idempotência usada com dados diferentes |
| 409 | `pin_already_set` | O PIN já existe: use `/v1/pin/change` |
| 409 | `invalid_state` | O recurso já não está no estado que a operação exige |
| 409 | `submission_open`, `ticket_closed`, `merchant_not_active` | Conflitos de KYC, suporte e comerciantes |
| 409 | `balance_not_zero`, `pending_requests` | Eliminação de conta com saldo ou pedidos pendentes |
| 409 | `phone_unavailable` | Troca de número para um número já em uso |
| 422 | `insufficient_funds` | Saldo (valor mais tarifa) insuficiente |
| 422 | `limit_exceeded` | Limite por operação, diário ou mensal excedido |
| 422 | `account_unavailable`, `currency_mismatch` | Conta fechada ou congelada, ou moeda diferente |
| 422 | `merchant_not_active` | Pagamento a um comerciante que não está ativo |
| 422 | `invalid_target_level`, `missing_documents` | KYC |
| 422 | `user_ineligible` | Conta que não pode mudar de número |
| 429 | `pin_locked` | PIN bloqueado depois de 5 falhas (traz `lockedUntil`) |
| 429 | `too_many_operations` | Demasiadas operações em pouco tempo (antifraude) |
| 429 | `too_many_open_tickets` | Já tem 5 pedidos de suporte abertos |
| 429 | `request_error` | Limite de pedidos por minuto da rota |
| 500 | `internal_error` | Erro do servidor. Sem detalhes técnicos na resposta |
| 502 | `provider_unavailable` | O provedor financeiro não respondeu. O valor retido é devolvido |
| 503 | `auth_unavailable` | O serviço de autenticação não respondeu |
| 503 | `fraud_check_unavailable` | A verificação antifraude falhou. A operação NÃO foi feita |

Nota: `invalid_state` e `merchant_not_active` aparecem com estados diferentes consoante a rota
(por exemplo, `merchant_not_active` é 409 no QR do comerciante e 422 no pagamento).
A tabela mostra o código; o estado exato está em cada operação do YAML.

## O que a app tem de saber já
- **PIN obrigatório:** com `PIN_ENFORCEMENT=on` (sempre, em produção), a app tem de enviar `X-Pin` nas três operações de dinheiro.
  Em desenvolvimento, o servidor corre com `PIN_ENFORCEMENT=off` até o app o enviar.
- **O PIN só se guarda no servidor.** A app nunca o guarda: pede-o ao utilizador em cada operação (a biometria só serve para abrir a app).
- **Operações repetidas:** guarde a chave de idempotência durante uma tentativa. Só gere uma nova quando os dados mudarem, ou depois de um sucesso, ou de um erro definitivo.
- **Contactos de suporte:** `GET /public/support`, sem login.
