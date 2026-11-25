import "./support.css";
import { useState, type FormEvent } from "react";
import { Badge, Card, ErrorBox, Loading } from "../components/ui";
import { request } from "../lib/api";
import { userMessage } from "../lib/errors";
import { formatDateTime, formatPhone } from "../lib/format";
import {
  MESSAGE_MAX,
  SUPPORT_STATUSES,
  canAct,
  categoryLabel,
  statusLabel,
  statusTone,
  validateReply,
  waitingFor,
} from "../lib/support";
import { createSupportApi } from "../lib/support-api";
import type { SupportStatus } from "../lib/support-types";
import { useLoad } from "../lib/use-load";

const supportApi = createSupportApi(request);

type Filter = SupportStatus | "all";

interface PanelProps {
  id: string;
  canReply: boolean;
  meId: string;
  onChanged: () => void;
  onClose: () => void;
}

function TicketPanel({ id, canReply, meId, onChanged, onClose }: PanelProps) {
  const detail = useLoad(() => supportApi.get(id), `ticket:${id}`);
  const [text, setText] = useState("");
  const [resolve, setResolve] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ticket = detail.data;
  const own = ticket !== null && ticket.userId === meId;
  const open = ticket !== null && canAct(ticket.status);

  async function onReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateReply(text);
    if (problem) {
      setReplyError(problem);
      return;
    }
    setReplyError(null);
    setBusy(true);
    try {
      await supportApi.reply(id, text.trim(), resolve);
      setText("");
      setResolve(false);
      detail.reload();
      onChanged();
    } catch (err) {
      setReplyError(userMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(next: "open" | "resolved" | "closed", question: string | null) {
    if (question !== null && !window.confirm(question)) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await supportApi.setStatus(id, next);
      detail.reload();
      onChanged();
    } catch (err) {
      setActionError(userMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={ticket ? ticket.subject : "Pedido de suporte"}>
      {detail.loading && !ticket ? <Loading /> : null}
      {detail.error ? <ErrorBox message={detail.error} onRetry={detail.reload} /> : null}

      {ticket ? (
        <>
          <dl className="details">
            <dt>Cliente</dt>
            <dd>
              {ticket.fullName ?? "Sem nome"} · {formatPhone(ticket.phone)}
            </dd>
            <dt>Assunto</dt>
            <dd>{categoryLabel(ticket.category)}</dd>
            <dt>Estado</dt>
            <dd>
              <Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge>
            </dd>
            <dt>Aberto em</dt>
            <dd>{formatDateTime(ticket.createdAt)}</dd>
          </dl>

          <div className="thread">
            {ticket.messages.map((message) => (
              <div key={message.id} className={message.author === "support" ? "msg support" : "msg"}>
                <div className="msg-head">
                  <span>{message.author === "support" ? "Suporte" : "Cliente"}</span>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                <p className="msg-body">{message.body}</p>
              </div>
            ))}
          </div>

          {actionError ? <ErrorBox message={actionError} /> : null}

          {own ? <p className="muted">Este pedido é da sua própria conta. Não o pode tratar: peça a outro colega.</p> : null}
          {!open ? <p className="muted">Este pedido está fechado.</p> : null}

          {open && canReply && !own ? (
            <>
              <form className="reply" onSubmit={(event) => void onReply(event)} noValidate>
                <label className="field">
                  <span>A sua resposta</span>
                  <textarea
                    value={text}
                    maxLength={MESSAGE_MAX}
                    onChange={(event) => {
                      setText(event.target.value);
                      setReplyError(null);
                    }}
                    disabled={busy}
                  />
                </label>
                {replyError ? <p className="field-error">{replyError}</p> : null}
                <label className="check">
                  <input type="checkbox" checked={resolve} onChange={(event) => setResolve(event.target.checked)} disabled={busy} />
                  Marcar como resolvido
                </label>
                <p className="muted small">
                  A resposta é mostrada ao cliente como "Suporte", sem o seu nome. Nunca peça o PIN nem o código SMS.
                </p>
                <div className="row">
                  <button type="submit" className="btn" disabled={busy}>
                    {busy ? "A enviar…" : "Enviar resposta"}
                  </button>
                </div>
              </form>

              <div className="actions">
                <div className="row">
                  {ticket.status !== "resolved" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void onStatus("resolved", null)}>
                      Marcar como resolvido
                    </button>
                  ) : (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void onStatus("open", null)}>
                      Reabrir
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => void onStatus("closed", "Fechar este pedido? O cliente deixa de poder responder.")}
                  >
                    Fechar pedido
                  </button>
                </div>
              </div>
            </>
          ) : null}

          <p className="muted small">Abrir um pedido fica registado na auditoria.</p>
        </>
      ) : null}

      <div className="row">
        <button type="button" className="btn secondary" onClick={onClose}>
          Fechar detalhe
        </button>
      </div>
    </Card>
  );
}

interface Props {
  canReply: boolean;
  meId: string;
}

export function SupportPage({ canReply, meId }: Props) {
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useLoad(() => supportApi.list(filter === "all" ? undefined : filter), `support:${filter}`);

  const items = list.data?.items ?? [];
  const now = new Date();

  return (
    <>
      <h1>Suporte</h1>

      <label className="field inline">
        <span>Estado</span>
        <select
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value as Filter);
            setSelected(null);
          }}
        >
          <option value="open">Aguardam resposta</option>
          <option value="pending_user">Aguardam o cliente</option>
          <option value="resolved">Resolvidos</option>
          <option value="closed">Fechados</option>
          <option value="all">Todos</option>
        </select>
      </label>

      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {list.data && items.length === 0 ? <p className="muted">Sem pedidos neste estado.</p> : null}
      {list.data && items.length > 0 && filter === "open" ? (
        <p className="muted">
          {items.length} {items.length === 1 ? "pedido a aguardar" : "pedidos a aguardar"} resposta.
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N.º</th>
                <th>Cliente</th>
                <th>Assunto</th>
                <th>Estado</th>
                <th>À espera há</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={item.id === selected ? "selected" : undefined}>
                  <td>{item.seq}</td>
                  <td>
                    {item.fullName ?? "Sem nome"}
                    <br />
                    <span className="muted small">{formatPhone(item.phone)}</span>
                  </td>
                  <td>
                    {item.subject}
                    <br />
                    <span className="muted small">{categoryLabel(item.category)}</span>
                  </td>
                  <td>
                    <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  </td>
                  <td>{waitingFor(item, now)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setSelected(item.id === selected ? null : item.id)}
                    >
                      {item.id === selected ? "Fechar" : "Abrir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <TicketPanel
          key={selected}
          id={selected}
          canReply={canReply}
          meId={meId}
          onChanged={list.reload}
          onClose={() => setSelected(null)}
        />
      ) : null}

      <button type="button" className="btn secondary" onClick={list.reload} disabled={list.loading}>
        Atualizar
      </button>
    </>
  );
}

// Mantém a lista de estados conhecida junto da página, para o filtro nunca ficar atrás dos estados da API.
export const KNOWN_STATUSES = SUPPORT_STATUSES;
