import { useEffect, useState, type FormEvent } from "react";
import { TOTP_LENGTH, sanitizeTotp } from "../lib/mfa";
import type { EnrollInfo, MfaApi } from "../lib/mfa-api";
import { Card, ErrorBox, Loading } from "./ui";

interface Props {
  mfa: MfaApi;
  email: string | null;
  onDone: () => void;
  onSignOut: () => void;
}

type View =
  | { kind: "loading" }
  | { kind: "challenge"; factorId: string }
  | { kind: "enroll-intro" }
  | { kind: "enroll"; info: EnrollInfo }
  | { kind: "failed"; message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Algo correu mal. Tente novamente.";
}

export function MfaGate({ mfa, email, onDone, onSignOut }: Props) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setView({ kind: "loading" });
    mfa
      .status()
      .then((status) => {
        if (!active) {
          return;
        }
        if (status.step === "done") {
          onDone();
        } else if (status.step === "challenge") {
          setView({ kind: "challenge", factorId: status.factorId });
        } else {
          setView({ kind: "enroll-intro" });
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setView({ kind: "failed", message: messageOf(err) });
        }
      });
    return () => {
      active = false;
    };
    // onDone muda de identidade a cada render do pai; só queremos reler o estado a pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mfa, attempt]);

  // A inscrição só arranca a pedido: abrir o ecrã duas vezes não pode criar dois autenticadores.
  async function onStartEnroll() {
    setBusy(true);
    setError(null);
    try {
      setView({ kind: "enroll", info: await mfa.startEnroll() });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>, factorId: string) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await mfa.verify(factorId, code);
      onDone();
    } catch (err) {
      setError(messageOf(err));
      setCode("");
      setBusy(false);
    }
  }

  const signOut = (
    <button type="button" className="btn secondary" onClick={onSignOut} disabled={busy}>
      Terminar sessão
    </button>
  );

  if (view.kind === "loading") {
    return (
      <div className="center">
        <Loading text="A verificar o acesso…" />
      </div>
    );
  }

  if (view.kind === "failed") {
    return (
      <div className="center">
        <Card title="Não foi possível verificar o segundo fator">
          <ErrorBox message={view.message} onRetry={() => setAttempt((value) => value + 1)} />
          {signOut}
        </Card>
      </div>
    );
  }

  if (view.kind === "enroll-intro") {
    return (
      <div className="center">
        <Card title="Ative a verificação em dois passos">
          <p>
            A administração exige um segundo fator. Vai precisar de uma aplicação de autenticação no telemóvel, como o
            Google Authenticator ou o Authy.
          </p>
          <p className="muted small">
            Esta conta ({email ?? "—"}) ainda não tem autenticador. Se perder o telemóvel, outro administrador tem de
            remover o seu autenticador antes de poder configurar um novo.
          </p>
          {error ? <ErrorBox message={error} /> : null}
          <div className="row">
            <button type="button" className="btn" onClick={() => void onStartEnroll()} disabled={busy}>
              {busy ? "A preparar…" : "Configurar o autenticador"}
            </button>
            {signOut}
          </div>
        </Card>
      </div>
    );
  }

  const factorId = view.kind === "enroll" ? view.info.factorId : view.factorId;

  return (
    <div className="center">
      <form className="card login" onSubmit={(event) => void onSubmit(event, factorId)} noValidate>
        <h1>{view.kind === "enroll" ? "Leia o QR Code" : "Código de verificação"}</h1>

        {view.kind === "enroll" ? (
          <>
            <p className="muted">
              Na aplicação de autenticação, escolha adicionar uma conta e leia este QR Code. Depois escreva o código de 6
              dígitos que ela mostrar.
            </p>
            <img className="qr" src={view.info.qrCode} alt="QR Code para a aplicação de autenticação" />
            <p className="muted small">Se não conseguir ler o QR Code, escreva esta chave na aplicação:</p>
            <code className="secret">{view.info.secret}</code>
          </>
        ) : (
          <p className="muted">Escreva o código de 6 dígitos da sua aplicação de autenticação.</p>
        )}

        <label className="field">
          <span>Código</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={TOTP_LENGTH}
            value={code}
            onChange={(event) => {
              setCode(sanitizeTotp(event.target.value));
              setError(null);
            }}
            disabled={busy}
            autoFocus
          />
        </label>

        {error ? <ErrorBox message={error} /> : null}

        <button type="submit" className="btn" disabled={busy || code.length !== TOTP_LENGTH}>
          {busy ? "A confirmar…" : view.kind === "enroll" ? "Confirmar e ativar" : "Confirmar"}
        </button>
        {signOut}
      </form>
    </div>
  );
}
