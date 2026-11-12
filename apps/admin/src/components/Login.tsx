import { useState, type FormEvent } from "react";
import { ErrorBox } from "./ui";

interface Props {
  onSignIn: (email: string, password: string) => Promise<void>;
}

export function Login({ onSignIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim().length === 0 || password.length === 0) {
      setError("Indique o email e a palavra-passe.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSignIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={onSubmit} noValidate>
        <h1>NÔDJUNTA PAY</h1>
        <p className="muted">Administração. Acesso reservado.</p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading}
          />
        </label>

        <label className="field">
          <span>Palavra-passe</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading}
          />
        </label>

        {error ? <ErrorBox message={error} /> : null}

        <button type="submit" className="btn" disabled={loading}>
          {loading ? "A entrar…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
