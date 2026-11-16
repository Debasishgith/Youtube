export interface SecurityMetadata {
  ipAddress?: string | null;
  browser?: string;
  browserVersion?: string | null;
  os?: string;
  osVersion?: string | null;
  deviceType?: string;
  deviceModel?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface LoginEvent {
  _id: string;
  eventType: string;
  outcome: string;
  createdAt: string;
  metadata?: SecurityMetadata;
}

export interface SecurityRecord {
  _id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  metadata?: SecurityMetadata;
}

export interface SecurityOverview {
  events: LoginEvent[];
  sessions: SecurityRecord[];
  devices: SecurityRecord[];
  currentSessionId: string;
}
