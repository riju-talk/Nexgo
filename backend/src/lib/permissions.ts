// Employee permission keys (Teams & Roles). Members with an explicit list may only use what it grants;
// owners and members without a list keep their role's normal access.
export const PERMISSION_GROUPS = [
  { group: 'Dashboard', items: [['dashboard', 'Dashboard']] },
  { group: 'Orders', items: [['orders.manage', 'Manage Orders'], ['orders.cancel', 'Cancel Orders'], ['orders.export', 'Export Orders'], ['orders.export_customer', 'Export Customer Details'], ['orders.view_customer', 'View Customer Details'], ['orders.change_payment', 'Change Payment Mode']] },
  { group: 'Shipments', items: [['shipments.manage', 'Manage Shipments'], ['shipments.cancel', 'Cancel Shipments'], ['shipments.export', 'Export Shipment'], ['shipments.export_customer', 'Export Customer Details'], ['shipments.view_customer', 'View Customer Details']] },
  { group: 'Weight', items: [['weight.discrepancy', 'Weight Discrepancy']] },
] as const;
export const PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i[0]));

// The permission a request needs, from the matched route pattern. null = not permission-gated.
export function requiredPermission(method: string, route: string, body: unknown): string | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (route.startsWith('/v1/analytics/dashboard')) return 'dashboard';
  if (route.startsWith('/v1/weight-disputes')) return 'weight.discrepancy';
  if (route === '/v1/shipments/:shipmentId/cancel') return 'shipments.cancel';
  if (route.startsWith('/v1/shipments')) return 'shipments.manage';
  if (route.startsWith('/v1/orders')) {
    if (route === '/v1/orders/:orderId/state' && b.state === 'cancelled') return 'orders.cancel';
    if (method !== 'GET' && b.paymentMode !== undefined && route.endsWith('/details')) return 'orders.change_payment';
    return 'orders.manage';
  }
  return null;
}
