// Incubation species config for the MeeF 28-egg incubator.
//
// Chicken and duck share the same incubator hardware but have different cycle
// lengths and phase-specific temp/humidity/turning targets. Everything that
// varies by species lives here so the incubator pages stay in sync.
//
// Candling days are the same for both species (Day 7 and Day 14).

export const CANDLE_DAYS = [7, 14]

export const SPECIES = {
  chicken: {
    key: 'chicken',
    label: 'Chicken',
    emoji: '🐔',
    incubationDays: 21,
    lockdownDay: 18,
    // Ordered phases — first phase whose `maxDay >= day` wins.
    phases: [
      { maxDay: 7,        label: 'Days 1–7',            temp: '100.0–100.5°F', humidity: '50–60%', turn: true  },
      { maxDay: 14,       label: 'Days 8–14',           temp: '100.0–100.5°F', humidity: '45–55%', turn: true  },
      { maxDay: 17,       label: 'Days 15–17',          temp: '100.0°F',       humidity: '45–55%', turn: true  },
      { maxDay: Infinity, label: 'Day 18+ (Lockdown)',  temp: '99.5–100°F',    humidity: '65–75%', turn: false },
    ],
  },
  duck: {
    key: 'duck',
    label: 'Duck',
    emoji: '🦆',
    incubationDays: 28,
    lockdownDay: 26,
    phases: [
      { maxDay: 25,       label: 'Days 1–25',           temp: '99.5°F', humidity: '45–55%', turn: true  },
      { maxDay: Infinity, label: 'Day 26+ (Lockdown)',  temp: '99.5°F', humidity: '65–75%', turn: false },
    ],
  },
}

// Resolve the species config from an Airtable batch's `fields` object.
// Defaults to chicken when the Species field is missing or unrecognized
// (keeps legacy batches working).
export function getSpecies(fields) {
  const raw = String(fields?.['Species'] ?? '').toLowerCase()
  return SPECIES[raw] || SPECIES.chicken
}

// The active phase for a given day of incubation.
export function phaseForDay(species, day) {
  return species.phases.find(p => day <= p.maxDay) || species.phases[species.phases.length - 1]
}

// { temp, humidity, turn } targets for a given day.
export function targetsForDay(species, day) {
  const p = phaseForDay(species, day)
  return { temp: p.temp, humidity: p.humidity, turn: p.turn }
}

// Human-readable phase name for the day indicator.
export function phaseName(species, day) {
  const { lockdownDay, incubationDays } = species
  if (day < 7) return 'Early Development'
  if (day < 14) return 'Growing'
  if (day < lockdownDay) return 'Pre-Lockdown'
  if (day === lockdownDay) return 'LOCKDOWN TODAY'
  if (day <= incubationDays) return 'Watch for Pip'
  return 'Complete'
}
