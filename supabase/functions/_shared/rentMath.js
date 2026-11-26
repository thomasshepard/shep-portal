// Days in month (1-12), leap year aware
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Clamp day to max valid day for year/month
export function clampDay(year, month, day) {
  return Math.min(day, daysInMonth(year, month));
}

// Format YYYY-MM-DD zero-padded
export function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Today in America/Chicago as YYYY-MM-DD
export function centralToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

// First date on/after today with day = clampDay(dueDay). dueDay 1-31.
export function nextDueDate(dueDay, today) {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error('Due Day must be 1 to 31');
  }
  const [y, m] = today.split('-').map(Number);
  let year = y;
  let month = m;
  const clamped = clampDay(year, month, dueDay);
  let candidate = ymd(year, month, clamped);
  if (candidate < today) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const clampedNext = clampDay(year, month, dueDay);
    candidate = ymd(year, month, clampedNext);
  }
  return candidate;
}

// Add n days to YYYY-MM-DD in UTC (no DST drift)
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// true when today >= dueDate - sendDaysBefore (sendDaysBefore blank => 10)
export function isDueToSend(dueDate, sendDaysBefore, today) {
  const sendDays = (sendDaysBefore === undefined || sendDaysBefore === null || sendDaysBefore === '' || Number.isNaN(Number(sendDaysBefore))) ? 10 : Number(sendDaysBefore);
  const threshold = addDays(dueDate, -sendDays);
  return today >= threshold;
}

// Key for idempotency: scheduleId:dueDate
export function runKey(scheduleId, dueDate) {
  return `${scheduleId}:${dueDate}`;
}

// Dollars to integer cents
export function toCents(dollars) {
  return Math.round(Number(dollars) * 100) || 0;
}

// Cents to dollars
export function fromCents(cents) {
  return cents / 100;
}

// Cents as "$1,225.00" for problem messages
export function fmtUsd(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Core split logic
export function splitAmounts(lines, rows) {
  const totalCents = lines.reduce((sum, l) => sum + toCents(l.amount), 0);
  if (totalCents === 0) {
    return { ok: false, problem: 'Lease total is $0 (no line items)', totalCents: 0, rows: [] };
  }
  if (!rows || rows.length === 0) {
    return { ok: false, problem: 'No billing rows', totalCents, rows: [] };
  }

  const sorted = [...rows].sort((a, b) => (a.dueDay - b.dueDay) || String(a.id).localeCompare(String(b.id)));
  const types = new Set(sorted.map(r => r.shareType));

  if (types.size > 1) {
    return { ok: false, problem: 'Mixed share types not allowed', totalCents, rows: [] };
  }

  const type = sorted[0].shareType;

  if (type === 'Full') {
    if (sorted.length !== 1) {
      return { ok: false, problem: 'Full share only valid as sole row', totalCents, rows: [] };
    }
    const r = sorted[0];
    return {
      ok: true,
      problem: null,
      totalCents,
      rows: [{
        id: r.id,
        cents: totalCents,
        lines: lines.map(l => ({ name: l.name, cents: toCents(l.amount) }))
      }]
    };
  }

  if (type === 'Percent') {
    const sumPct = sorted.reduce((s, r) => s + Number(r.shareValue), 0);
    // Written as !(<=) so a blank share (NaN) fails instead of slipping through.
    if (!(Math.abs(sumPct - 100) <= 0.01)) {
      return { ok: false, problem: `Percent shares add up to ${sumPct.toFixed(2)}%, not 100%`, totalCents, rows: [] };
    }
    const resultRows = [];
    let sumSoFar = 0;
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      let cents;
      if (i === sorted.length - 1) {
        cents = totalCents - sumSoFar;
      } else {
        cents = Math.round(totalCents * Number(r.shareValue) / 100);
      }
      sumSoFar += cents;
      resultRows.push({ id: r.id, cents, lines: null });
    }
    return { ok: true, problem: null, totalCents, rows: resultRows };
  }

  if (type === 'Fixed') {
    const fixedCents = sorted.map(r => toCents(r.shareValue));
    const sumFixed = fixedCents.reduce((s, c) => s + c, 0);
    if (sumFixed !== totalCents) {
      return {
        ok: false,
        problem: `Fixed shares add up to ${fmtUsd(sumFixed)} but the lease total is ${fmtUsd(totalCents)}`,
        totalCents,
        rows: []
      };
    }
    return {
      ok: true,
      problem: null,
      totalCents,
      rows: sorted.map((r, i) => ({ id: r.id, cents: fixedCents[i], lines: null }))
    };
  }

  return { ok: false, problem: `Unknown share type: ${type}`, totalCents, rows: [] };
}

// Frozen mapping of property Stripe Account select value -> rent account key
export const RENT_ACCOUNTS = Object.freeze({
  'East Meadow Properties': 'east_meadow',
  'Shepard Holdings': 'shepard_holdings'
});

// Map property's Stripe Account select through RENT_ACCOUNTS; else null
export function rentAccountKey(propertyStripeAccount) {
  return RENT_ACCOUNTS[propertyStripeAccount] ?? null;
}

// Payment methods: always us_bank_account; add card if 'Card' present
export function paymentMethodTypes(methods) {
  const arr = Array.isArray(methods) ? methods : [];
  const types = ['us_bank_account'];
  if (arr.includes('Card')) types.push('card');
  return types;
}

// Unix seconds for 12:00 noon America/Chicago on dateStr
export function dueDateUnixNoonCentral(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
    hour: 'numeric',
    hour12: false
  });
  const parts = fmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  const offsetStr = offsetPart?.value || 'GMT-6';
  const match = offsetStr.match(/GMT([+-]\d+)/);
  const offsetHours = match ? Number(match[1]) : -6;
  const utcHour = 12 - offsetHours;
  return Math.floor(Date.UTC(y, m - 1, d, utcHour) / 1000);
}