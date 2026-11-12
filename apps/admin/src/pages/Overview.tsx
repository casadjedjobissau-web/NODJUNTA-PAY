import { Badge, Card, ErrorBox, Loading } from "../components/ui";
import { visibleTabs, type Tab } from "../lib/access";
import { api } from "../lib/api";
import { useLoad } from "../lib/use-load";
import type { AdminMe, Overview } from "../lib/types";

interface CardDef {
  key: keyof Overview;
  label: string;
  hint: string;
  tab: Tab | null;
  warnWhenPositive: boolean;
}

const CARDS: readonly CardDef[] = [
  {
    key: "pendingKyc",
    label: "Verificações pendentes",
    hint: "Pedidos de KYC à espera de decisão.",
    tab: "kyc",
    warnWhenPositive: false,
  },
  {
    key: "pendingMerchants",
    label: "Comerciantes por aprovar",
    hint: "Negócios registados que ainda não recebem pagamentos.",
    tab: "merchants",
    warnWhenPositive: false,
  },
  {
    key: "pendingFunding",
    label: "Depósitos e levantamentos pendentes",
    hint: "Pedidos à espera de confirmação do provedor.",
    tab: null,
    warnWhenPositive: false,
  },
  {
    key: "failedWebhooks",
    label: "Webhooks com falha",
    hint: "Eventos do provedor que não foram processados. Exigem atenção.",
    tab: null,
    warnWhenPositive: true,
  },
  {
    key: "frozenWallets",
    label: "Carteiras congeladas",
    hint: "Contas bloqueadas por um administrador.",
    tab: null,
    warnWhenPositive: false,
  },
];

interface Props {
  me: AdminMe;
  onOpen: (tab: Tab) => void;
}

export function OverviewPage({ me, onOpen }: Props) {
  const { data, loading, error, reload } = useLoad(() => api.overview(), "overview");
  const allowed = new Set(visibleTabs(me).map((tab) => tab.id));

  return (
    <>
      <h1>Resumo</h1>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}

      {data ? (
        <div className="grid">
          {CARDS.map((card) => {
            const value = data[card.key];
            const canOpen = card.tab !== null && allowed.has(card.tab);
            return (
              <Card key={card.key}>
                <p className="muted">{card.label}</p>
                <p className="big">
                  {value}{" "}
                  {card.warnWhenPositive && value > 0 ? <Badge tone="bad">atenção</Badge> : null}
                </p>
                <p className="muted small">{card.hint}</p>
                {canOpen && card.tab !== null ? (
                  <button type="button" className="btn secondary" onClick={() => onOpen(card.tab as Tab)}>
                    Abrir
                  </button>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : null}

      {data ? (
        <button type="button" className="btn secondary" onClick={reload} disabled={loading}>
          Atualizar
        </button>
      ) : null}
    </>
  );
}
