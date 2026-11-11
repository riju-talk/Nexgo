// How each kind of notification looks and which filter group it belongs to (used by the Notifications page and the bell).
export const KINDS = {
  delivered: { label: 'Delivered', color: '#14724F', group: 'parcels' },
  rto: { label: 'Return (RTO)', color: '#B23A2B', group: 'parcels' },
  ndr: { label: 'Delivery failed (NDR)', color: '#8A5A00', group: 'parcels' },
  pickup_missed: { label: 'Pickup missed', color: '#2A4570', group: 'parcels' },
  batch: { label: 'Bulk job finished', color: '#3877fc', group: 'parcels' },
  wallet: { label: 'Wallet', color: '#B23A2B', group: 'money' },
  cod: { label: 'COD payout', color: '#14724F', group: 'money' },
  weight: { label: 'Weight dispute', color: '#8A5A00', group: 'money' },
  kyc: { label: 'KYC', color: '#6D28D9', group: 'account' },
  ticket: { label: 'Support', color: '#3877fc', group: 'account' },
  system: { label: 'Update', color: '#51628a', group: 'account' },
};
// Something changed in the inbox (read / marked read): the bell and the page refresh at once.
export const NOTIFICATIONS_CHANGED = 'nx:notifications-changed';
export const notificationsChanged = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)); };

export const GROUPS = [['all', 'All'], ['unread', 'Unread'], ['parcels', 'Parcels'], ['money', 'Money'], ['account', 'Account']];

/** "5 min ago", "3 h ago", "yesterday", or a date: short and readable. */
export function timeAgo(iso, now = Date.now()) {
  const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  if (secs < 172800) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
