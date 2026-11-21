const SHELF_LIFE_DAYS = { whole_blood: 35, packed_rbc: 42, plasma: 365, platelets: 5 };
const DONATION_INTERVAL_DAYS = 56;
const LOW_STOCK_THRESHOLD = 5;

const RED_ABO = { O: ['O'], A: ['A', 'O'], B: ['B', 'O'], AB: ['AB', 'A', 'B', 'O'] };
const PLASMA_ABO = { O: ['O', 'A', 'B', 'AB'], A: ['A', 'AB'], B: ['B', 'AB'], AB: ['AB'] };

// Donor groups a recipient can receive for a component, exact match first.
function compatibleDonorGroups(recipientGroup, component) {
  const abo = recipientGroup.slice(0, -1);
  const rh = recipientGroup.slice(-1);
  const table = component === 'plasma' || component === 'platelets' ? PLASMA_ABO : RED_ABO;
  const rhMatters = component !== 'plasma';
  const out = [];
  for (const a of table[abo]) {
    for (const r of ['+', '-']) {
      if (rhMatters && rh === '-' && r === '+') continue;
      out.push(a + r);
    }
  }
  // Exact match first, otherwise keep ABO-table order, same-Rh before the other.
  return out.sort((x, y) => (y === recipientGroup) - (x === recipientGroup));
}

// UTC date math so the result never drifts with the server timezone.
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  return Math.round((new Date(`${toStr}T00:00:00Z`) - new Date(`${fromStr}T00:00:00Z`)) / 86400000);
}

const computeExpiry = (collectedOn, component) => addDays(collectedOn, SHELF_LIFE_DAYS[component]);

module.exports = {
  SHELF_LIFE_DAYS, DONATION_INTERVAL_DAYS, LOW_STOCK_THRESHOLD,
  compatibleDonorGroups, computeExpiry, addDays, daysBetween,
};
