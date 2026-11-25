// What happened to every row of a bulk upload, kept apart from the screen so it can be tested (spec 4.2: no row disappears, counts add up,
// "booked" only with a courier answer that carries an AWB, "queued" never counted as assigned).
//
// A row's outcome is a plain object:
//   { created, orderId }            order saved
//   { failure }                     could not be created
//   { courier, awb }                booked (the courier answered with an AWB)
//   { unassigned: true, failure }   order saved, the courier network refused it
//   { queued: true }                order saved and sent for booking, but NO answer came back (paused, worker busy or down): it is still waiting
//
// Exactly one of these states applies to a created order. Anything else is a defect.

/**
 * Applies the assignment results to the per-row outcomes. `outcome` is a Map(orderNumber -> outcome), `submittedIds` the order ids that were sent for booking,
 * `results` what the assignment helper returned ([{ orderId, ok, awb, courier, error }]). Returns a NEW Map.
 */
export function applyAssignmentResults(outcome, submittedIds, results) {
  const submitted = new Set(submittedIds);
  const by = new Map((results || []).map((r) => [r.orderId, r]));
  const next = new Map();
  for (const [num, x] of outcome) {
    const a = x.orderId && by.get(x.orderId);
    if (a) next.set(num, a.ok ? { ...x, courier: a.courier, awb: a.awb } : { ...x, unassigned: true, failure: `Order created, but no courier assigned: ${a.error}` });
    else if (x.orderId && submitted.has(x.orderId)) next.set(num, { ...x, queued: true }); // sent, no answer: waiting, NOT booked
    else next.set(num, x);
  }
  return next;
}

/** The counts shown to the seller. They add up: created = booked + queued + created_unassigned(not sent) + refused; nothing is counted twice. */
export function summarizeBulk(rows) {
  const created = rows.filter((o) => o.created && !o.unassigned);
  const booked = created.filter((o) => o.awb).length;
  const queued = created.filter((o) => !o.awb && o.queued).length;
  const waiting = created.filter((o) => !o.awb && !o.queued).length; // saved, not sent for booking (Track > Ready to ship)
  const refused = rows.filter((o) => o.created && o.unassigned).length; // saved, the courier network refused it
  const failed = rows.filter((o) => !o.created && (o.errors?.length || o.failure)).length;
  return { total: rows.length, created: created.length, booked, queued, waiting, refused, failed };
}

/** One honest sentence for the toast after an upload that sent orders for booking. */
export function bookingSentence({ created, booked, queued }) {
  const n = (c) => `${c} order${c === 1 ? '' : 's'}`;
  if (queued > 0) return `${n(created)} created: ${booked} booked, ${queued} saved and waiting for courier booking. They book by themselves when it resumes; check Track.`;
  if (booked === created) return `${n(created)} created and assigned to a courier.`;
  return `${n(created)} created, ${booked} booked.`;
}
