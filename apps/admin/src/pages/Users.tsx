import { useState, type FormEvent } from "react";
import { Badge, Card, ErrorBox } from "../components/ui";
import { api } from "../lib/api";
import { userMessage } from "../lib/errors";
import {
  formatDateTime,
  formatMoney,
  formatPhone,
  normalizeLookupPhone,
  walletStatusLabel,
} from "../lib/format";
import { trimReason, validateReason } from "../lib/reasons";
import type { UserView } from "../lib/types";

interface Props {
  canFreeze: boolean;
}

export function UsersPage({ canFreeze }: Props) {
  const [phoneText, setPhoneText] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [user, setUser] = useState<UserView | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = normalizeLookupPhone(phoneText);
    if (!phone) {
      setPhoneError("Número inválido. Use +245 e 9 dígitos.");
      return;
    }
    setPhoneError(null);
    setError(null);
    setUser(null);
    setReason("");
    setReasonError(null);
    setActionError(null);
    setNotice(null);
    setSearching(true);
    try {
      setUser(await api.lookupUser(phone));
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setSearching(false);
    }
  }

  async function setFrozen(frozen: boolean) {
    if (!user) {
      return;
    }
    if (frozen) {
      const problem = validateReason(reason, true);
      if (problem) {
        setReasonError(problem);
        return;
      }
    }
    const question = frozen
      ? "Congelar a carteira deste utilizador? Deixa de poder enviar e pagar."
      : "Descongelar a carteira deste utilizador?";
    if (!window.confirm(question)) {
      return;
    }

    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await api.setFrozen(user.userId, frozen, frozen ? trimReason(reason) : undefined);
      setUser({ ...user, walletStatus: result.status });
      setReason("");
      setNotice(result.status === "frozen" ? "Carteira congelada." : "Carteira descongelada.");
    } catch (err) {
      setActionError(userMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const frozen = user?.walletStatus === "frozen";

  return (
    <>
      <h1>Utilizadores</h1>
      <p className="muted small">Cada procura fica registada na auditoria (sem guardar o número procurado).</p>

      <form className="row" onSubmit={onSearch} noValidate>
        <label className="field grow">
          <span>Número de telemóvel</span>
          <input
            type="tel"
            placeholder="+245 955 000 002"
            value={phoneText}
            onChange={(event) => {
              setPhoneText(event.target.value);
              setPhoneError(null);
            }}
            disabled={searching}
          />
        </label>
        <button type="submit" className="btn" disabled={searching || phoneText.trim().length === 0}>
          {searching ? "A procurar…" : "Procurar"}
        </button>
      </form>
      {phoneError ? <p className="field-error">{phoneError}</p> : null}
      {error ? <ErrorBox message={error} /> : null}

      {user ? (
        <Card title="Utilizador">
          <dl className="details">
            <dt>Telemóvel</dt>
            <dd>{formatPhone(user.phone)}</dd>
            <dt>Nome</dt>
            <dd>{user.fullName ?? "—"}</dd>
            <dt>Nível de verificação</dt>
            <dd>Nível {user.kycLevel}</dd>
            <dt>Saldo</dt>
            <dd>{user.walletBalance === null ? "—" : formatMoney(user.walletBalance)}</dd>
            <dt>Carteira</dt>
            <dd>
              <Badge tone={frozen ? "bad" : "ok"}>{walletStatusLabel(user.walletStatus)}</Badge>
            </dd>
            <dt>Comerciante</dt>
            <dd>{user.merchantCode ?? "—"}</dd>
            <dt>Conta criada</dt>
            <dd>{formatDateTime(user.createdAt)}</dd>
            <dt>Identificador</dt>
            <dd>
              <code>{user.userId}</code>
            </dd>
          </dl>

          {notice ? <p className="ok-text">{notice}</p> : null}

          {canFreeze && user.walletStatus !== null && user.walletStatus !== "closed" ? (
            <div className="actions">
              {frozen ? (
                <>
                  {actionError ? <ErrorBox message={actionError} /> : null}
                  <button type="button" className="btn" onClick={() => void setFrozen(false)} disabled={busy}>
                    Descongelar carteira
                  </button>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Motivo do congelamento (obrigatório)</span>
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={reason}
                      onChange={(event) => {
                        setReason(event.target.value);
                        setReasonError(null);
                      }}
                      disabled={busy}
                    />
                  </label>
                  {reasonError ? <p className="field-error">{reasonError}</p> : null}
                  {actionError ? <ErrorBox message={actionError} /> : null}
                  <button type="button" className="btn danger" onClick={() => void setFrozen(true)} disabled={busy}>
                    Congelar carteira
                  </button>
                </>
              )}
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
