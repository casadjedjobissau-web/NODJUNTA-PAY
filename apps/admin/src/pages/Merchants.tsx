import { useState } from "react";
import { Badge, ErrorBox, Loading, type BadgeTone } from "../components/ui";
import { api } from "../lib/api";
import { userMessage } from "../lib/errors";
import { formatDateTime, formatPhone, merchantStatusLabel } from "../lib/format";
import { useLoad } from "../lib/use-load";
import type { MerchantItem, MerchantStatus } from "../lib/types";

const STATUS_TONE: Record<MerchantStatus, BadgeTone> = {
  pending: "warn",
  active: "ok",
  suspended: "bad",
};

type Filter = MerchantStatus | "all";

interface Props {
  canManage: boolean;
}

export function MerchantsPage({ canManage }: Props) {
  const [filter, setFilter] = useState<Filter>("pending");
  const list = useLoad(() => api.listMerchants(filter === "all" ? undefined : filter), `merchants:${filter}`);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function change(item: MerchantItem, next: "active" | "suspended", question: string) {
    if (!window.confirm(question)) {
      return;
    }
    setBusyCode(item.merchantCode);
    setActionError(null);
    try {
      await api.setMerchantStatus(item.merchantCode, next);
      list.reload();
    } catch (err) {
      setActionError(userMessage(err));
    } finally {
      setBusyCode(null);
    }
  }

  const items = list.data?.items ?? [];

  return (
    <>
      <h1>Comerciantes</h1>

      <label className="field inline">
        <span>Estado</span>
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
          <option value="pending">Pendentes</option>
          <option value="active">Ativos</option>
          <option value="suspended">Suspensos</option>
          <option value="all">Todos</option>
        </select>
      </label>

      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {actionError ? <ErrorBox message={actionError} /> : null}
      {list.data && items.length === 0 ? <p className="muted">Sem comerciantes neste estado.</p> : null}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Negócio</th>
                <th>Telemóvel do titular</th>
                <th>Registado</th>
                <th>Estado</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.merchantCode}>
                  <td>
                    <code>{item.merchantCode}</code>
                  </td>
                  <td>{item.businessName}</td>
                  <td>{formatPhone(item.ownerPhone)}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[item.status]}>{merchantStatusLabel(item.status)}</Badge>
                  </td>
                  {canManage ? (
                    <td>
                      {item.status === "pending" ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={busyCode === item.merchantCode}
                          onClick={() =>
                            void change(item, "active", `Aprovar o comerciante "${item.businessName}"?`)
                          }
                        >
                          Aprovar
                        </button>
                      ) : null}
                      {item.status === "active" ? (
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busyCode === item.merchantCode}
                          onClick={() =>
                            void change(item, "suspended", `Suspender o comerciante "${item.businessName}"?`)
                          }
                        >
                          Suspender
                        </button>
                      ) : null}
                      {item.status === "suspended" ? (
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={busyCode === item.merchantCode}
                          onClick={() =>
                            void change(item, "active", `Reativar o comerciante "${item.businessName}"?`)
                          }
                        >
                          Reativar
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
