import type { CourierAdapter } from '../types.js';
import type { Mapped } from '../../lib/trackingIngest.js';

/**
 * An aggregator plugin is everything NEXGO needs to talk to one courier aggregator (Lorrigo, and the ones added after it).
 * To add one: create couriers/aggregators/<id>/index.ts exporting an AggregatorPlugin and add it to couriers/aggregators/index.ts.
 * Nothing else in the codebase names an aggregator: the registry, admin screens, webhook route, health check and credential storage all read this.
 */
export type CredentialField = { key: string; label: string; secret: boolean; required: boolean; hint?: string };

/** What this aggregator can do. A capability that is false is simply hidden or skipped (for example no NDR actions, no tracking poll). */
export type AggregatorCapabilities = { listServices: boolean; serviceability: boolean; track: boolean; ndrAction: boolean; cancel: boolean };

/** One tracking event in NEXGO's own vocabulary, whatever the aggregator called it. */
export type NormalizedEvent = { mapped: Mapped; at: string; location: string | null; description: string; eventId: string };

/** One shipment's update, as the webhook (or a poll) delivered it. */
export type NormalizedUpdate = {
  awb: string;
  /** The history, oldest first. Each event is applied once (idempotent on eventId). */
  events: NormalizedEvent[];
  /** The current status, for payloads whose history is missing or shorter than the status. */
  current?: NormalizedEvent;
  /** A status NEXGO does not know and that is not on the ignore list: recorded on the delivery so support can look at it. */
  unmappedStatus?: string;
  /** The aggregator's own payload for this shipment, kept with the delivery for support and debugging. */
  raw?: unknown;
};

export type AggregatorWebhook = {
  /** True when the credentials needed to check requests are set. Without them the endpoint answers 503, never 200. */
  configured(credentials: Record<string, string>): boolean;
  /** True when the request is genuinely from the aggregator (token / signature check). Never logs or returns the secret. */
  verify(headers: Record<string, unknown>, credentials: Record<string, string>, rawBody: string): boolean;
  /** Turns the payload into updates; an empty list is answered with 200 (it is also how "Test webhook" buttons are acknowledged). */
  parse(body: unknown): NormalizedUpdate[];
};

export type AggregatorPlugin = {
  id: string;
  label: string;
  credentialFields: CredentialField[];
  capabilities: AggregatorCapabilities;
  /** Credentials taken from the server environment: the fallback while none are saved in the database. */
  envCredentials(): Record<string, string>;
  /** Builds the adapter. Throws a readable 503 when the required credentials are missing, so nothing is ever faked. */
  create(credentials: Record<string, string>): CourierAdapter;
  webhook?: AggregatorWebhook;
  /** Pull the newest tracking from the aggregator (used when pushes are missing or late). Only for plugins with capabilities.track. */
  poll?(credentials: Record<string, string>): Promise<NormalizedUpdate[]>;
};
