// The dashboard cards: id, label, kind, group. Values come ONLY from the live API (GET /v1/analytics/dashboard); nothing here is a number.
export const CARDS = [
  ['order_volume', 'Orders placed', 'Card', 'Volume & fulfilment'],
  ['in_transit', 'In transit', 'Card', 'Volume & fulfilment'],
  ['delivery_rate', 'Delivery rate', 'Card', 'Volume & fulfilment'],
  ['avg_delivery', 'Avg. delivery time', 'Card', 'Volume & fulfilment'],
  ['pickup_compliance', 'Picked up on time', 'Card', 'Volume & fulfilment'],
  ['rto_rate', 'RTO rate', 'Card', 'Exceptions & risk'],
  ['ndr_rate', 'NDR rate', 'Card', 'Exceptions & risk'],
  ['weight_disc', 'Weight disputes', 'Card', 'Exceptions & risk'],
  ['revenue', 'Shipping spend', 'Card', 'Money'],
  ['courier_perf', 'Courier-wise performance', 'Chart', 'Charts'],
  ['cod_split', 'COD vs. prepaid split', 'Chart', 'Charts'],
];
export const CARD_GROUPS = ['Volume & fulfilment', 'Exceptions & risk', 'Money', 'Charts'];
export const DEFAULT_KPIS = ['order_volume', 'in_transit', 'delivery_rate', 'ndr_rate', 'rto_rate', 'revenue', 'courier_perf', 'cod_split'];

const dash = '—';
const pctText = (v) => (v === null || v === undefined ? dash : `${v}%`);
const n = (v) => Number(v || 0).toLocaleString('en-IN');

/**
 * What a card shows. `tag` says whether it is a live snapshot ("Right now") or covers the chosen dates ("Period").
 * `how` is the plain-language calculation, shown when a card is opened. A figure with nothing to divide by shows a dash, never a made-up 0%.
 */
export function cardView(id, live, money) {
  if (!live) return null;
  const m = live.metrics; const q = live.queue;
  switch (id) {
    case 'order_volume': return { value: n(m.orderVolume), sub: `${n(m.todayVolume)} placed today`, tag: 'Period', how: 'Orders created in the chosen dates (India time), not counting drafts and cancelled orders.' };
    case 'in_transit': return { value: n(m.inTransit), sub: 'on the road or out for delivery', tag: 'Right now', how: 'Parcels that are in transit or out for delivery at this moment. It does not depend on the chosen dates.' };
    case 'delivery_rate': return { value: pctText(m.deliveryRate), sub: m.finished ? `of ${n(m.finished)} finished parcels` : 'no finished parcels yet', tag: 'Period', how: 'Delivered parcels divided by parcels that have finished their journey (delivered + returned + lost), for parcels booked in the chosen dates. Cancelled parcels are left out.' };
    case 'avg_delivery': return { value: m.avgDeliveryDays === null ? dash : `${m.avgDeliveryDays} days`, sub: 'booking to delivery', tag: 'Period', how: 'Average time from booking to delivery for parcels delivered that were booked in the chosen dates.' };
    case 'pickup_compliance': return { value: pctText(m.pickupCompliance), sub: 'collected within 24 hours', tag: 'Period', how: 'Of the parcels booked in the chosen dates whose first 24 hours are over, the share the courier collected within 24 hours of booking.' };
    case 'rto_rate': return { value: pctText(m.rtoRate), sub: `${n(live.rto.count)} returned`, tag: 'Period', how: 'Returned (RTO) parcels divided by parcels that have finished (delivered + returned + lost), for parcels booked in the chosen dates. Cancelled parcels are left out.' };
    case 'ndr_rate': return { value: pctText(m.ndrRate), sub: m.shipped ? `${n(m.ndrParcels)} of ${n(m.shipped)} shipped` : 'no shipments yet', tag: 'Period', how: 'Parcels that had at least one failed delivery attempt (NDR), divided by parcels booked in the chosen dates. Cancelled parcels are left out.' };
    case 'weight_disc': return { value: n(q?.weight.open), sub: `${money(q?.weight.heldPaise)} held`, tag: 'Right now', how: 'Open weight disputes raised by couriers, and the amount held against your wallet until they are settled.' };
    case 'revenue': return { value: money(m.shippingSpendPaise), sub: m.avgShippingPaise === null ? 'no shipments yet' : `${money(m.avgShippingPaise)} per parcel`, tag: 'Period', how: 'Shipping charges (before GST) for parcels booked in the chosen dates, cancelled parcels excluded. Return freight is shown on the RTO page.' };
    default: return null;
  }
}
