import { useState } from "react";
import { Badge, ErrorBox, Loading } from "../components/ui";
import { request } from "../lib/api";
import { userMessage } from "../lib/errors";
import { formatDateTime, formatMoney } from "../lib/format";
import {
  decisionLabel,
  detailsText,
  operationLabel,
  reviewBlock,
  ruleHelp,
  ruleLabel,
  validateNote,
  type FraudAlertStatus,
} from "../lib/fraud";
import { createFraudApi } from "../lib/ops-api";
import { useLoad } from "../lib/use-load";

const fraudApi = createFraudApi(request);

type Filter = FraudAlertStatus | "all";

interface Props {
  meId: string;
}

export function FraudPage({ meId }: Props) {
  const [filter, setFilter] = useState<Filter>("open");
  const list = useLoad(() => fraudApi.list(filter === "all" ? undefined : filter), `fraud:${filter}`);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function review(id: string) {
    const answer = window.prompt("Nota (opcional):");
    if (answer === null) {
      return;
    }
    const problem = validateNote(answer);
    if (problem) {
      setActionError(problem);
      return;
    }
    setBusyId(id);
    setActionError(null);
    try {
      await fraudApi.review(id, answer.trim() || undefined);
      list.reload();
    } catch (err) {
      setActionError(userMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const items = list.data?.items ?? [];

  return (
    <>
      <h1>Alertas de fraude</h1>
      <p className="muted small">
        Cada regra que dispara cria um alerta, mesmo quando a operação é bloqueada. Os valores dos limiares são
        provisórios e definem-se com a conformidade (ver o guia do antifraude).
      </p>

      <label className="field inline">
        <span>Estado</span>
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
          <option value="open">Abertos</option>
          <option value="reviewed">Tratados</option>
          <option value="all">Todos</option>
        </select>
      </label>

      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {actionError ? <ErrorBox message={actionError} /> : null}
      {list.data && items.length === 0 ? <p className="muted">Sem alertas neste estado.</p> : null}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Utilizador</th>
                <th>Regra</th>
                <th>Operação</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const block = reviewBlock(item, meId);
                const details = detailsText(item.rule, item.details);
                return (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      {item.fullName ?? "Sem nome"}
                      <br />
                      <span className="muted small">{item.phoneMasked ?? "—"}</span>
                    </td>
                    <td>
                      <Badge tone={item.decision === "block" ? "bad" : "warn"}>{ruleLabel(item.rule)}</Badge>
                      <br />
                      <span className="muted small">{decisionLabel(item.decision)}</span>
                      {details ? (
                        <>
                          <br />
                          <span className="muted small">{details}</span>
                        </>
                      ) : null}
                      <p className="muted small help">{ruleHelp(item.rule)}</p>
                    </td>
                    <td>
                      {operationLabel(item.operation)}
                      <br />
                      <span className="muted small">{formatMoney(item.amount)}</span>
                    </td>
                    <td>
                      <Badge tone={item.status === "open" ? "warn" : "ok"}>
                        {item.status === "open" ? "Aberto" : "Tratado"}
                      </Badge>
                      {item.reviewNote ? (
                        <>
                          <br />
                          <span className="muted small">{item.reviewNote}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {item.status === "open" ? (
                        block ? (
                          <span className="muted small">{block}</span>
                        ) : (
                          <button type="button" className="btn" disabled={busyId === item.id} onClick={() => void review(item.id)}>
                            Marcar como tratado
                          </button>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
