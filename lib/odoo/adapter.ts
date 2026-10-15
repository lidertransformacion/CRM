export type OdooLead = {
  name: string;
  type: string;
  stage: string;
  team: string;
  salesperson: string;
  customer: string;
  expectedRevenue: number | null;
  probability: number | null;
  createdAt: string | null;
  expectedClose: string | null;
  closedAt: string | null;
  wonStatus: string;
  active: boolean;
  lossReason: string;
  tags: string;
  nextActivityType: string;
  nextActivitySummary: string;
  nextActivityDeadline: string | null;
  odooId: string | null;
};

export type OdooActivity = {
  documentName: string;
  model: string;
  odooLeadId: string | null;
  summary: string;
  activityType: string;
  deadline: string | null;
  state: string;
  createdAt: string | null;
  note: string;
  assignee: string;
};

export type OdooTeam = {
  name: string;
  leader: string;
  active: boolean;
  company: string;
  members: string[];
};

export interface OdooCrmAdapter {
  readonly source: "xlsx" | "odoo";
  pullLeads(): Promise<OdooLead[]>;
  pullActivities(): Promise<OdooActivity[]>;
  pullTeams(): Promise<OdooTeam[]>;
}

/** Phase 2. This class never opens a connection to Odoo. */
export class OdooSyncAdapter implements OdooCrmAdapter {
  readonly source = "odoo" as const;

  async pullLeads(): Promise<OdooLead[]> {
    throw new Error("Odoo sync is not implemented. Import an xlsx export instead.");
  }

  async pullActivities(): Promise<OdooActivity[]> {
    throw new Error("Odoo sync is not implemented. Import an xlsx export instead.");
  }

  async pullTeams(): Promise<OdooTeam[]> {
    throw new Error("Odoo sync is not implemented. Import an xlsx export instead.");
  }
}
