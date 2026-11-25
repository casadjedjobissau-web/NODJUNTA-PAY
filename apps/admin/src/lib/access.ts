import type { AdminMe, AdminPermission } from "./types";

export type Tab = "overview" | "support" | "kyc" | "merchants" | "users" | "phones" | "fraud" | "reports" | "audit";

export interface TabDef {
  id: Tab;
  label: string;
  permission: AdminPermission;
}

export const TABS: readonly TabDef[] = [
  { id: "overview", label: "Resumo", permission: "overview:read" },
  { id: "support", label: "Suporte", permission: "support:read" },
  { id: "kyc", label: "Verificações (KYC)", permission: "kyc:read" },
  { id: "merchants", label: "Comerciantes", permission: "merchant:read" },
  { id: "users", label: "Utilizadores", permission: "user:read" },
  { id: "phones", label: "Troca de número", permission: "phone_change:request" },
  { id: "fraud", label: "Fraude", permission: "fraud:review" },
  { id: "reports", label: "Relatórios", permission: "reports:read" },
  { id: "audit", label: "Auditoria", permission: "audit:read" },
];

// Só serve para esconder botões e secções. Quem decide é sempre a API.
export function hasPermission(me: AdminMe | null, permission: AdminPermission): boolean {
  return me !== null && me.permissions.includes(permission);
}

export function visibleTabs(me: AdminMe | null): TabDef[] {
  return TABS.filter((tab) => hasPermission(me, tab.permission));
}
