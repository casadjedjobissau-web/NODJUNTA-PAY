-- Substitui fail_payment_request: alem de devolver o valor retido, devolve a tarifa cobrada.
create or replace function public.fail_payment_request(
  p_request_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.payment_requests%rowtype;
  v_wallet uuid;
  v_suspense uuid;
  v_fee bigint;
begin
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'pedido inexistente' using errcode = 'NJ010';
  end if;
  if v_req.status = 'failed' then
    return 'failed';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'estado invalido: %', v_req.status using errcode = 'NJ009';
  end if;

  if v_req.kind = 'withdrawal' then
    v_wallet := public.create_wallet(v_req.user_id, 'user_wallet', v_req.currency);
    v_suspense := public.system_account_id('suspense', v_req.currency);

    perform public.post_ledger_transfer(
      'wd-rev-' || v_req.id::text, 'reversal', v_suspense, v_wallet,
      v_req.amount, v_req.currency, null, null,
      jsonb_build_object('request_id', v_req.id, 'stage', 'reverse')
    );

    -- Devolve a tarifa, se foi cobrada no pedido.
    if v_req.hold_transaction_id is not null then
      select t.amount into v_fee
        from public.transactions t
       where t.initiator_id = v_req.user_id
         and t.idempotency_key = 'fee-' || v_req.hold_transaction_id::text;

      if v_fee is not null then
        perform public.post_ledger_transfer(
          'wd-feerev-' || v_req.id::text, 'reversal',
          public.system_account_id('fee_revenue', v_req.currency), v_wallet,
          v_fee, v_req.currency, null, null,
          jsonb_build_object('request_id', v_req.id, 'stage', 'fee_reverse')
        );
      end if;
    end if;
  end if;

  update public.payment_requests
     set status = 'failed',
         failure_reason = nullif(left(coalesce(p_reason, ''), 200), '')
   where id = v_req.id;

  return 'failed';
end;
$$;
