import { useState } from "react";
import { Layout } from "./components/Layout";
import { Login } from "./components/Login";
import { Card, ErrorBox, Loading } from "./components/ui";
import { hasPermission, visibleTabs, type Tab } from "./lib/access";
import { AuditLogPage } from "./pages/AuditLog";
import { KycPage } from "./pages/Kyc";
import { MerchantsPage } from "./pages/Merchants";
import { OverviewPage } from "./pages/Overview";
import { UsersPage } from "./pages/Users";
import { useAuth } from "./session";

export function App() {
  const { status, me, email, error, signIn, signOut, retry } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  if (status === "loading") {
    return (
      <div className="center">
        <Loading />
      </div>
    );
  }

  if (status === "signedOut") {
    return <Login onSignIn={signIn} />;
  }

  if (status === "denied") {
    return (
      <div className="center">
        <Card title="Sem acesso">
          <p>Esta conta não tem permissão para usar a administração.</p>
          <button type="button" className="btn secondary" onClick={() => void signOut()}>
            Terminar sessão
          </button>
        </Card>
      </div>
    );
  }

  if (status === "error" || !me) {
    return (
      <div className="center">
        <Card title="Não foi possível validar o acesso">
          <ErrorBox message={error ?? "Algo correu mal. Tente novamente."} onRetry={retry} />
          <button type="button" className="btn secondary" onClick={() => void signOut()}>
            Terminar sessão
          </button>
        </Card>
      </div>
    );
  }

  const tabs = visibleTabs(me);
  const current: Tab = tabs.find((item) => item.id === tab)?.id ?? tabs[0]?.id ?? "overview";

  return (
    <Layout
      email={email}
      me={me}
      tabs={tabs}
      current={current}
      onSelect={setTab}
      onSignOut={() => void signOut()}
    >
      {current === "overview" ? <OverviewPage me={me} onOpen={setTab} /> : null}
      {current === "kyc" ? <KycPage canReview={hasPermission(me, "kyc:review")} /> : null}
      {current === "merchants" ? <MerchantsPage canManage={hasPermission(me, "merchant:manage")} /> : null}
      {current === "users" ? <UsersPage canFreeze={hasPermission(me, "account:freeze")} /> : null}
      {current === "audit" ? <AuditLogPage /> : null}
    </Layout>
  );
}
