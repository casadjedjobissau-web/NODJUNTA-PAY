import "./reports.css";
import { useState } from "react";
import { Badge, Card, ErrorBox, Loading } from "../components/ui";
import { config } from "../config";
import { request } from "../lib/api";
import { downloadCsv, saveBlobInBrowser } from "../lib/csv-download";
import { userMessage } from "../lib/errors";
import { formatMoney } from "../lib/format";
import { createReportsApi } from "../lib/ops-api";
import { csvPath, defaultRange, formatDay, ledgerStatus, toIsoDate, validateRange, type DateRange } from "../lib/reports";
import { supabase } from "../lib/supabase";
import { useLoad } from "../lib/use-load";

const reportsApi = createReportsApi(request);

function pair(count: number, volume: number): string {
  return `${count} · ${formatMoney(volume)}`;
}

export function ReportsPage() {
  const today = new Date();
  const [draft, setDraft] = useState<DateRange>(() => defaultRange(new Date()));
  const [applied, setApplied] = useState<DateRange>(draft);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const summary = useLoad(() => reportsApi.summary(), "report:summary");
  const daily = useLoad(() => reportsApi.daily(applied.from, applied.to), `report:daily:${applied.from}:${applied.to}`);
  const merchants = useLoad(
    () => reportsApi.merchants(applied.from, applied.to),
    `report:merchants:${applied.from}:${applied.to}`,
  );

  function onApply() {
    const problem = validateRange(draft.from, draft.to, new Date());
    setRangeError(problem);
    if (problem === null) {
      setApplied(draft);
    }
  }

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadCsv(
        {
          baseUrl: config.apiUrl,
          getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
          save: saveBlobInBrowser,
        },
        csvPath(applied.from, applied.to),
      );
    } catch (err) {
      setExportError(userMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const s = summary.data;
  const ledger = s ? ledgerStatus(s.ledgerGap) : null;

  return (
    <>
      <h1>Relatórios</h1>

      <h2>Situação atual</h2>
      {summary.loading && !s ? <Loading /> : null}
      {summary.error ? <ErrorBox message={summary.error} onRetry={summary.reload} /> : null}

      {s && ledger ? (
        <>
          <div className={ledger.ok ? "card ledger" : "card ledger bad"} role={ledger.ok ? undefined : "alert"}>
            <strong>Livro-razão:</strong>
            <Badge tone={ledger.ok ? "ok" : "bad"}>{ledger.label}</Badge>
            <span className="muted small">A soma de todas as contas tem de dar sempre 0.</span>
          </div>

          <div className="grid">
            <Card>
              <p className="muted">Carteiras de clientes ({s.userWallets})</p>
              <p className="big">{formatMoney(s.userBalance, s.currency)}</p>
            </Card>
            <Card>
              <p className="muted">Carteiras de comerciantes ({s.merchantWallets})</p>
              <p className="big">{formatMoney(s.merchantBalance, s.currency)}</p>
            </Card>
            <Card>
              <p className="muted">Tarifas acumuladas</p>
              <p className="big">{formatMoney(s.feeBalance, s.currency)}</p>
            </Card>
            <Card>
              <p className="muted">Conta de liquidação</p>
              <p className="big">{formatMoney(s.settlementBalance, s.currency)}</p>
              <p className="muted small">Negativa por desenho: representa o dinheiro real guardado no banco.</p>
            </Card>
            <Card>
              <p className="muted">Conta de retenção</p>
              <p className="big">{formatMoney(s.suspenseBalance, s.currency)}</p>
              <p className="muted small">Levantamentos retidos até serem concluídos.</p>
            </Card>
            <Card>
              <p className="muted">Depósitos pendentes</p>
              <p className="big">{pair(s.pendingDepositsCount, s.pendingDepositsAmount)}</p>
            </Card>
            <Card>
              <p className="muted">Levantamentos pendentes</p>
              <p className="big">{pair(s.pendingWithdrawalsCount, s.pendingWithdrawalsAmount)}</p>
            </Card>
          </div>
        </>
      ) : null}

      <h2>Movimento por dia</h2>
      <div className="row">
        <label className="field inline">
          <span>De</span>
          <input
            type="date"
            value={draft.from}
            max={toIsoDate(today)}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </label>
        <label className="field inline">
          <span>Até</span>
          <input
            type="date"
            value={draft.to}
            max={toIsoDate(today)}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </label>
        <button type="button" className="btn" onClick={onApply}>
          Aplicar
        </button>
        <button type="button" className="btn secondary" onClick={() => void onExport()} disabled={exporting}>
          {exporting ? "A exportar…" : "Exportar CSV"}
        </button>
      </div>
      <p className="muted small">Os dias contam em UTC. No máximo 92 dias. Cada exportação fica registada na auditoria.</p>
      {rangeError ? <p className="field-error">{rangeError}</p> : null}
      {exportError ? <ErrorBox message={exportError} /> : null}

      {daily.loading && !daily.data ? <Loading /> : null}
      {daily.error ? <ErrorBox message={daily.error} onRetry={daily.reload} /> : null}

      {daily.data ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th className="num">Transferências</th>
                <th className="num">Pagamentos</th>
                <th className="num">Depósitos</th>
                <th className="num">Levantamentos</th>
                <th className="num">Tarifas líquidas</th>
                <th className="num">Utilizadores novos</th>
              </tr>
            </thead>
            <tbody>
              {daily.data.rows.map((row) => (
                <tr key={row.day}>
                  <td>{formatDay(row.day)}</td>
                  <td className="num">{pair(row.transfersCount, row.transfersVolume)}</td>
                  <td className="num">{pair(row.paymentsCount, row.paymentsVolume)}</td>
                  <td className="num">{pair(row.depositsCount, row.depositsVolume)}</td>
                  <td className="num">{pair(row.withdrawalsCount, row.withdrawalsVolume)}</td>
                  <td className="num">{formatMoney(row.feesNet)}</td>
                  <td className="num">{row.newUsers}</td>
                </tr>
              ))}
              <tr className="totals">
                <td>Total</td>
                <td className="num">{pair(daily.data.totals.transfersCount, daily.data.totals.transfersVolume)}</td>
                <td className="num">{pair(daily.data.totals.paymentsCount, daily.data.totals.paymentsVolume)}</td>
                <td className="num">{pair(daily.data.totals.depositsCount, daily.data.totals.depositsVolume)}</td>
                <td className="num">{pair(daily.data.totals.withdrawalsCount, daily.data.totals.withdrawalsVolume)}</td>
                <td className="num">{formatMoney(daily.data.totals.feesNet)}</td>
                <td className="num">{daily.data.totals.newUsers}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <h2>Comerciantes com mais pagamentos</h2>
      {merchants.loading && !merchants.data ? <Loading /> : null}
      {merchants.error ? <ErrorBox message={merchants.error} onRetry={merchants.reload} /> : null}
      {merchants.data && merchants.data.items.length === 0 ? <p className="muted">Sem pagamentos a comerciantes neste período.</p> : null}
      {merchants.data && merchants.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Negócio</th>
                <th className="num">Pagamentos</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {merchants.data.items.map((item) => (
                <tr key={item.merchantCode}>
                  <td>
                    <code>{item.merchantCode}</code>
                  </td>
                  <td>{item.businessName}</td>
                  <td className="num">{item.paymentsCount}</td>
                  <td className="num">{formatMoney(item.paymentsVolume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <button
        type="button"
        className="btn secondary"
        onClick={() => {
          summary.reload();
          daily.reload();
          merchants.reload();
        }}
      >
        Atualizar
      </button>
    </>
  );
}
