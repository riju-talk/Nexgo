import { lorrigo } from './lorrigo/index.js';
import type { AggregatorPlugin } from './types.js';

/**
 * Every aggregator NEXGO can book through. To add one: create couriers/aggregators/<id>/index.ts (see docs/ADD_AN_AGGREGATOR.md) and list it here.
 * Its id is also what couriers/services point at (courier_providers.aggregator), so it must never change once couriers use it.
 */
export const PLUGINS: AggregatorPlugin[] = [lorrigo];

export const AGGREGATOR_IDS = PLUGINS.map((p) => p.id) as [string, ...string[]];
export const pluginById = (id: string | null | undefined): AggregatorPlugin | undefined => PLUGINS.find((p) => p.id === id);
