# NODJUNTA-PAY: antifraude

## O que é avaliado
Antes de cada **transferência**, **pagamento a comerciante** e **levantamento**, depois de o PIN estar confirmado
e antes de o dinheiro mexer, a API avalia três regras:

| Regra | O que faz | Resposta ao cliente |
|---|---|---|
| Velocidade | Bloqueia quem fizer mais operações do que o limite numa janela de tempo | 429 `too_many_operations` |
| Pausa nos levantamentos | Bloqueia levantamentos durante N horas depois de trocar o PIN ou o número de telefone | 403 `withdrawal_cooldown` |
| Montante elevado | A operação passa, mas fica um alerta para a administração | (não afeta o cliente) |

Os depósitos não são avaliados. Os limites diários, mensais e por operação são um mecanismo à parte (atómico, na base de dados).

## Valores iniciais (PROVISÓRIOS)
| Chave | Valor | Significado |
|---|---|---|
| `fraud_enabled` | 1 | 1 liga tudo, 0 desliga tudo |
| `velocity_window_minutes` | 10 | janela da regra de velocidade |
| `velocity_max_ops` | 10 | operações permitidas na janela (0 desativa a regra) |
| `withdrawal_cooldown_hours` | 24 | pausa dos levantamentos (0 desativa a regra) |
| `large_amount_flag` | 500000 | montante, em XOF, a partir do qual há alerta (0 desativa a regra) |

**Estes valores são meus e não têm base regulatória.** Definam-nos com quem responde pela conformidade e com o banco parceiro antes de abrir ao público.

## Alterar os limiares
Sem alterar código, no SQL Editor do Supabase:
```sql
update public.fraud_settings set value = 20 where key = 'velocity_max_ops';
update public.fraud_settings set value = 12 where key = 'withdrawal_cooldown_hours';
update public.fraud_settings set value = 1000000 where key = 'large_amount_flag';
select key, value, updated_at from public.fraud_settings order by key;
```
A alteração vale de imediato.

## Alertas
- Cada regra que dispara cria um alerta, mesmo quando a operação é bloqueada.
- Para o mesmo utilizador e a mesma regra, só nasce um alerta novo de 10 em 10 minutos.
- O revisor e o administrador veem os alertas em `GET /admin/v1/fraud/alerts` (o separador do painel entra no Bloco A)
  e marcam-nos como tratados com uma nota. Cada tratamento fica na auditoria (`ADMIN_FRAUD_REVIEW`).
- Ninguém trata alertas da própria conta.

## O que fazer com um alerta
1. **Velocidade:** contacte o cliente. Uma conta comprometida costuma fazer muitas operações seguidas.
   Se houver suspeita, congele a carteira (administrador) e peça a verificação de identidade.
2. **Pausa depois de trocar o PIN ou o número:** é o comportamento esperado. Só é suspeito se o cliente disser que não alterou nada.
   Nesse caso, congele a carteira e abra um pedido de suporte.
3. **Montante elevado:** confirme que a origem do dinheiro e o destino fazem sentido para o nível de verificação do cliente.

## Falha fechada
Se a verificação não puder correr (por exemplo, a base de dados não responde), a operação é recusada com 503
`fraud_check_unavailable`. Nunca se deixa passar dinheiro sem avaliar. Para desligar o antifraude de propósito
(por exemplo, numa avaria), use `fraud_enabled = 0`, e volte a ligar o quanto antes.

## Limitações conhecidas
- **A verificação não é atómica com o movimento.** Se alguém disparar muitos pedidos em paralelo, pode passar um ou dois
  acima do limite de velocidade. Os limites diários, mensais e por operação continuam atómicos.
- **Não há a regra do dispositivo novo.** Um utilizador acabado de registar passaria a ter o dispositivo "novo",
  e bloquear-se-ia toda a gente no primeiro dia. Fica para uma versão com mais dados.
- **Só há regras de limiar simples.** Não há pontuação de risco, listas de bloqueio, nem análise de localização.
  Um serviço de antifraude a sério precisa de dados reais de operação para ser calibrado.
- **Os bloqueios não são definitivos:** o cliente pode voltar a tentar quando a janela passar.
  O antifraude atrasa o abuso, não o elimina.
