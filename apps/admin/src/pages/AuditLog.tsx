import { useCallback, useEffect, useState } from "react";
import { ErrorBox, Loading } from "../components/ui";
import { api } from "../lib/api";
import { actionLabel, shortId, summarizeMetadata } from "../lib/audit";
import { userMessage } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import type { AuditItem } from "../lib/types";

export function AuditLogPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.listAudit();
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  async function onLoadMore() {
    if (cursor === null) {
      return;
    }
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.listAudit(cursor);
      setItems((previous) => [...previous, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <h1>Auditoria</h1>
      <p className="muted small">Registo imutável das operações de utilizadores, administradores e webhooks.</p>

      {loading ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={() => void loadFirst()} /> : null}
      {!loading && items.length === 0 && !error ? <p className="muted">Sem registos.</p> : null}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Data</th>
                <th>Quem</th>
                <th>Ação</th>
                <th>Alvo</th>
                <th>IP</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    {item.actorType} <code>{shortId(item.actorId)}</code>
                  </td>
                  <td>{actionLabel(item.action)}</td>
                  <td>
                    {item.entityType ?? "—"} {item.entityId ? <code>{shortId(item.entityId)}</code> : null}
                  </td>
                  <td>{item.ip ?? "—"}</td>
                  <td className="mono">{summarizeMetadata(item.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {cursor !== null ? (
        <button type="button" className="btn secondary" onClick={() => void onLoadMore()} disabled={loadingMore}>
          {loadingMore ? "A carregar…" : "Carregar mais"}
        </button>
      ) : null}
    </>
  );
}
