import { useState, type FormEvent } from "react";
import { Badge, Card, ErrorBox, Loading } from "../components/ui";
import { api, request } from "../lib/api";
import { userMessage } from "../lib/errors";
import { formatDateTime, formatPhone, normalizeLookupPhone } from "../lib/format";
import { createPhoneChangeApi } from "../lib/ops-api";
import {
  decideBlock,
  statusLabel,
  statusTone,
  validateCreate,
  validateDecision,
  type CreateErrors,
  type PhoneChangeItem,
  type PhoneChangeStatus,
} from "../lib/phone-change";
import { useLoad } from "../lib/use-load";
import type { UserView } from "../lib/types";

const phoneApi = createPhoneChangeApi(request);

type Filter = PhoneChangeStatus | "all";

interface Props {
  canDecide: boolean;
  meId: string;
}

export function PhoneChangesPage({ canDecide, meId }: Props) {
  const [filter, setFilter] = useState<Filter>("pending");
  const list = useLoad(() => phoneApi.list(filter === "all" ? undefined : filter), `phones:${filter}`);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [oldPhoneText, setOldPhoneText] = useState("");
  const [user, setUser] = useState<UserView | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [newPhoneText, setNewPhoneText] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [errors, setErrors] = useState<CreateErrors>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [creating, setCreating] = useState(false);

  async function onLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = normalizeLookupPhone(oldPhoneText);
    if (phone === null) {
      setLookupError("Número inválido. Use +245 e 9 dígitos.");
      return;
    }
    setLooking(true);
    setLookupError(null);
    setUser(null);
    try {
      // A procura fica registada na auditoria, tal como no separador Utilizadores.
      setUser(await api.lookupUser(phone));
    } catch (err) {
      setLookupError(userMessage(err));
    } finally {
      setLooking(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }
    const result = validateCreate({ newPhoneText, reason, evidence });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setCreateError(null);
    setCreating(true);
    try {
      await phoneApi.create({ userId: user.userId, ...result.value });
      setCreated(true);
      setUser(null);
      setOldPhoneText("");
      setNewPhoneText("");
      setReason("");
      setEvidence("");
      list.reload();
    } catch (err) {
      setCreateError(userMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function decide(item: PhoneChangeItem, approve: boolean) {
    let text = "";
    if (approve) {
      const question = `Aprovar a troca para ${formatPhone(item.newPhone)}? O utilizador terá de entrar de novo com o número novo, as sessões antigas terminam e os levantamentos ficam em pausa durante algumas horas.`;
      if (!window.confirm(question)) {
        return;
      }
    } else {
      const answer = window.prompt("Motivo da recusa:");
      if (answer === null) {
        return;
      }
      text = answer;
    }
    const problem = validateDecision(approve, text);
    if (problem) {
      setActionError(problem);
      return;
    }
    setBusyId(item.id);
    setActionError(null);
    try {
      await phoneApi.decide(item.id, approve, text.trim() || undefined);
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
      <h1>Troca de número</h1>

      <Card title="Novo pedido">
        <p className="muted small">
          Para quem perdeu o número ou o cartão SIM. Verifique a identidade do titular <strong>fora da app</strong> (por
          exemplo, em videochamada ou presencialmente) antes de abrir o pedido. Outro administrador decide: quem abre o
          pedido não o pode decidir.
        </p>

        <form className="row" onSubmit={(event) => void onLookup(event)} noValidate>
          <label className="field grow">
            <span>Telemóvel atual do utilizador</span>
            <input
              type="text"
              inputMode="tel"
              value={oldPhoneText}
              onChange={(event) => {
                setOldPhoneText(event.target.value);
                setLookupError(null);
                setCreated(false);
              }}
              placeholder="+245 9XX XXX XXX"
              disabled={looking}
            />
          </label>
          <button type="submit" className="btn secondary" disabled={looking || oldPhoneText.trim().length === 0}>
            {looking ? "A procurar…" : "Procurar"}
          </button>
        </form>
        {lookupError ? <p className="field-error">{lookupError}</p> : null}
        {created ? <p className="ok-text">Pedido criado. Aguarda a decisão de outro administrador.</p> : null}

        {user ? (
          <form className="actions" onSubmit={(event) => void onCreate(event)} noValidate>
            <dl className="details">
              <dt>Utilizador</dt>
              <dd>{user.fullName ?? "Sem nome"}</dd>
              <dt>Telemóvel atual</dt>
              <dd>{formatPhone(user.phone)}</dd>
              <dt>Nível de verificação</dt>
              <dd>{user.kycLevel}</dd>
            </dl>

            <label className="field inline">
              <span>Número novo</span>
              <input
                type="text"
                inputMode="tel"
                value={newPhoneText}
                onChange={(event) => {
                  setNewPhoneText(event.target.value);
                  setErrors((current) => ({ ...current, newPhone: undefined }));
                }}
                placeholder="+245 9XX XXX XXX"
                disabled={creating}
              />
            </label>
            {errors.newPhone ? <p className="field-error">{errors.newPhone}</p> : null}

            <label className="field">
              <span>Motivo</span>
              <input
                type="text"
                value={reason}
                maxLength={300}
                onChange={(event) => {
                  setReason(event.target.value);
                  setErrors((current) => ({ ...current, reason: undefined }));
                }}
                placeholder="Ex.: Perdeu o cartão SIM"
                disabled={creating}
              />
            </label>
            {errors.reason ? <p className="field-error">{errors.reason}</p> : null}

            <label className="field">
              <span>Nota de prova</span>
              <textarea
                value={evidence}
                maxLength={500}
                onChange={(event) => {
                  setEvidence(event.target.value);
                  setErrors((current) => ({ ...current, evidence: undefined }));
                }}
                placeholder="Ex.: Identidade verificada em videochamada de 14/11/2026, com o titular a mostrar o documento original."
                disabled={creating}
              />
            </label>
            <p className="muted small">Descreva só o método e a data. Nunca escreva números de documentos.</p>
            {errors.evidence ? <p className="field-error">{errors.evidence}</p> : null}

            {createError ? <ErrorBox message={createError} /> : null}
            <div className="row">
              <button type="submit" className="btn" disabled={creating}>
                {creating ? "A enviar…" : "Abrir pedido"}
              </button>
            </div>
          </form>
        ) : null}
      </Card>

      <h2>Pedidos</h2>
      <label className="field inline">
        <span>Estado</span>
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovados</option>
          <option value="rejected">Recusados</option>
          <option value="all">Todos</option>
        </select>
      </label>

      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {actionError ? <ErrorBox message={actionError} /> : null}
      {list.data && items.length === 0 ? <p className="muted">Sem pedidos neste estado.</p> : null}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N.º</th>
                <th>Utilizador</th>
                <th>Número antigo</th>
                <th>Número novo</th>
                <th>Motivo e prova</th>
                <th>Estado</th>
                {canDecide ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const block = decideBlock(item, meId);
                return (
                  <tr key={item.id}>
                    <td>{item.seq}</td>
                    <td>{item.fullName ?? "Sem nome"}</td>
                    <td>{item.oldPhoneMasked ?? "—"}</td>
                    <td>{formatPhone(item.newPhone)}</td>
                    <td>
                      {item.reason}
                      <br />
                      <span className="muted small">{item.evidenceNote}</span>
                      <br />
                      <span className="muted small">Aberto em {formatDateTime(item.createdAt)}</span>
                      {item.decisionReason ? (
                        <>
                          <br />
                          <span className="muted small">Decisão: {item.decisionReason}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                    </td>
                    {canDecide ? (
                      <td>
                        {item.status === "pending" ? (
                          block ? (
                            <span className="muted small">{block}</span>
                          ) : (
                            <div className="row">
                              <button type="button" className="btn" disabled={busyId === item.id} onClick={() => void decide(item, true)}>
                                Aprovar
                              </button>
                              <button
                                type="button"
                                className="btn danger"
                                disabled={busyId === item.id}
                                onClick={() => void decide(item, false)}
                              >
                                Recusar
                              </button>
                            </div>
                          )
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!canDecide ? <p className="muted small">Só um administrador pode aprovar ou recusar um pedido.</p> : null}
    </>
  );
}
