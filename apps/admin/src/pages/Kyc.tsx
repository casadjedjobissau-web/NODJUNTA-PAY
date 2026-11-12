import { useState } from "react";
import { Badge, Card, ErrorBox, Loading, type BadgeTone } from "../components/ui";
import { api } from "../lib/api";
import { userMessage } from "../lib/errors";
import {
  documentTypeLabel,
  formatDateTime,
  formatPhone,
  kindLabel,
  kycStatusLabel,
} from "../lib/format";
import { trimReason, validateReason } from "../lib/reasons";
import { useLoad } from "../lib/use-load";
import type { KycDocument, KycItem, KycStatus } from "../lib/types";

const STATUS_TONE: Record<KycStatus, BadgeTone> = {
  pending: "warn",
  approved: "ok",
  rejected: "bad",
};

interface Props {
  canReview: boolean;
}

export function KycPage({ canReview }: Props) {
  const [status, setStatus] = useState<KycStatus>("pending");
  const list = useLoad(() => api.listKyc(status), `kyc:${status}`);

  const [selected, setSelected] = useState<KycItem | null>(null);
  const [documents, setDocuments] = useState<KycDocument[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function resetDetail() {
    setDocuments(null);
    setDocsError(null);
    setImageFailed(false);
    setReason("");
    setReasonError(null);
    setActionError(null);
  }

  function onChangeStatus(next: KycStatus) {
    setStatus(next);
    setSelected(null);
    resetDetail();
  }

  function onOpen(item: KycItem) {
    setSelected(item);
    resetDetail();
  }

  async function onLoadDocuments() {
    if (!selected) {
      return;
    }
    setDocsLoading(true);
    setDocsError(null);
    setImageFailed(false);
    try {
      const response = await api.kycDocuments(selected.id);
      setDocuments(response.documents);
    } catch (err) {
      setDocsError(userMessage(err));
    } finally {
      setDocsLoading(false);
    }
  }

  async function review(approve: boolean) {
    if (!selected) {
      return;
    }
    if (!approve) {
      const problem = validateReason(reason, true);
      if (problem) {
        setReasonError(problem);
        return;
      }
    }
    const question = approve
      ? `Aprovar o pedido de nível ${selected.targetLevel}?`
      : "Recusar este pedido de verificação?";
    if (!window.confirm(question)) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await api.reviewKyc(selected.id, approve, approve ? undefined : trimReason(reason));
      setSelected(null);
      resetDetail();
      list.reload();
    } catch (err) {
      setActionError(userMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const items = list.data?.items ?? [];

  return (
    <>
      <h1>Verificações de identidade (KYC)</h1>

      <label className="field inline">
        <span>Estado</span>
        <select value={status} onChange={(event) => onChangeStatus(event.target.value as KycStatus)}>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovados</option>
          <option value="rejected">Recusados</option>
        </select>
      </label>

      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}

      {list.data && items.length === 0 ? <p className="muted">Sem pedidos neste estado.</p> : null}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Telemóvel</th>
                <th>Nome</th>
                <th>Nível</th>
                <th>Documento</th>
                <th>Submetido</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={selected?.id === item.id ? "selected" : undefined}>
                  <td>{formatPhone(item.phone)}</td>
                  <td>{item.fullName ?? "—"}</td>
                  <td>
                    {item.currentLevel} → {item.targetLevel}
                  </td>
                  <td>{documentTypeLabel(item.documentType)}</td>
                  <td>{formatDateTime(item.submittedAt)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[item.status]}>{kycStatusLabel(item.status)}</Badge>
                  </td>
                  <td>
                    <button type="button" className="btn secondary" onClick={() => onOpen(item)}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <Card title={`Pedido de nível ${selected.targetLevel}`}>
          <dl className="details">
            <dt>Telemóvel</dt>
            <dd>{formatPhone(selected.phone)}</dd>
            <dt>Nome</dt>
            <dd>{selected.fullName ?? "—"}</dd>
            <dt>Documento</dt>
            <dd>{documentTypeLabel(selected.documentType)}</dd>
            <dt>Submetido em</dt>
            <dd>{formatDateTime(selected.submittedAt)}</dd>
            {selected.status !== "pending" ? (
              <>
                <dt>Decidido em</dt>
                <dd>{formatDateTime(selected.reviewedAt)}</dd>
                <dt>Motivo</dt>
                <dd>{selected.reviewReason ?? "—"}</dd>
              </>
            ) : null}
          </dl>

          <p className="muted small">
            Os documentos são pessoais. Cada consulta fica registada na auditoria e os links expiram em 60
            segundos.
          </p>
          <button type="button" className="btn secondary" onClick={() => void onLoadDocuments()} disabled={docsLoading}>
            {docsLoading ? "A carregar…" : documents ? "Carregar de novo" : "Ver documentos"}
          </button>

          {docsError ? <ErrorBox message={docsError} /> : null}
          {documents && documents.length === 0 ? <p className="muted">Não há documentos enviados.</p> : null}
          {imageFailed ? (
            <ErrorBox message="Não foi possível carregar uma imagem. O link pode ter expirado: carregue de novo." />
          ) : null}

          {documents && documents.length > 0 ? (
            <div className="photos">
              {documents.map((doc) => (
                <figure key={doc.kind}>
                  <img
                    src={doc.url}
                    alt={kindLabel(doc.kind)}
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                  />
                  <figcaption>{kindLabel(doc.kind)}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}

          {canReview && selected.status === "pending" ? (
            <div className="actions">
              <label className="field">
                <span>Motivo (obrigatório para recusar)</span>
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
              <div className="row">
                <button type="button" className="btn" onClick={() => void review(true)} disabled={busy}>
                  Aprovar
                </button>
                <button type="button" className="btn danger" onClick={() => void review(false)} disabled={busy}>
                  Recusar
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
