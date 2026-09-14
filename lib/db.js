import pg from 'pg';

const { Pool } = pg;
let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL (or POSTGRES_URL) environment variable is not set.');
    }
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

/**
 * Minimal tagged-template query helper, e.g. sql`SELECT * FROM t WHERE id = ${id}`.
 * Kept API-compatible with the old @vercel/postgres `sql` tag (which is now
 * deprecated) so the rest of the app didn't need to change — this just
 * builds a parameterized query and runs it through `pg`, and pg's result
 * already has the same `.rows` shape.
 */
export function sql(strings, ...values) {
  let text = '';
  strings.forEach((chunk, i) => {
    text += chunk;
    if (i < values.length) text += '$' + (i + 1);
  });
  return getPool().query(text, values);
}

let initialized = false;

export const DEFAULT_CONFIG = {
  commonItems: [
    "Walk-around visual inspection for new damage",
    "Tires / tracks condition and pressure",
    "Lights, signals and beacon",
    "Horn and backup alarm",
    "Mirrors and camera visibility",
    "Seatbelt and operator restraint",
    "Fire extinguisher present and charged",
    "Visible fluid, oil or coolant leaks",
    "Frame and structure condition",
    "Gauges and warning lights at start-up"
  ],
  equipmentTypes: {
    materialHandler: {
      label: "Material Handler",
      models: ["Sennebogen 830 M", "CAT MH3059", "Komatsu PC290LL"],
      items: [
        "Boom and stick condition",
        "Cab riser / elevation function",
        "Counterweight and undercarriage",
        "Hydraulic hoses and cylinders",
        "Slew ring / rotation bearing"
      ]
    },
    loader: {
      label: "Loader",
      models: ["CAT 950M", "John Deere 644L", "Komatsu WA320"],
      items: [
        "Bucket / attachment linkage",
        "Articulation joint",
        "Bucket cutting edge and teeth",
        "Hydraulic cylinders"
      ]
    },
    skidSteer: {
      label: "Skid Steer",
      models: ["Bobcat S650", "CAT 262D3", "John Deere 320G"],
      items: [
        "Attachment locking mechanism / quick coupler",
        "Lift arms and cylinders",
        "Cab door and restraint bar",
        "Undercarriage, tires or tracks"
      ]
    },
    forklift: {
      label: "Forklift",
      models: ["Toyota 8FGU25", "Hyster H50FT", "Crown FC 5252"],
      items: [
        "Forks and carriage condition",
        "Mast and lift chains",
        "Load backrest extension",
        "Overhead guard",
        "Capacity data plate legible"
      ]
    },
    haulTruck: {
      label: "Haul Truck",
      models: ["CAT 745", "Komatsu HM300", "Volvo A40G"],
      items: [
        "Braking system (service and parking)",
        "Dump body and hoist cylinder",
        "Articulation joint",
        "Backup camera and alarm system",
        "Tarp system (if equipped)"
      ]
    }
  },
  fluidItems: [
    "Engine oil level",
    "Hydraulic fluid level",
    "Coolant level",
    "Fuel level",
    "DEF level",
    "Grease / lubrication points"
  ],
  attachmentChecks: {
    grapple: [
      "Grapple tips / teeth wear and cracks",
      "Jaw alignment and full closure",
      "Hydraulic cylinder leaks (grapple)",
      "Hydraulic hoses and fittings (grapple)",
      "Rotation motor / bearing function",
      "Pins, bushings and retainers",
      "Structural welds and frame condition"
    ],
    magnet: [
      "Magnet face / plate condition (wear, cracks)",
      "Lifting cable, chain and shackles",
      "Power cable insulation and reel",
      "Generator / power pack function",
      "Controller, battery and warning lights",
      "Cooling fan operation (if equipped)",
      "Mounting yoke / lifting eye condition"
    ]
  },
  attachmentLabels: { grapple: "Grapple", magnet: "Magnet" },
  defaultLines: {
    grapple: [
      "Hydraulic line — open function",
      "Hydraulic line — close function",
      "Hydraulic line — rotation"
    ],
    magnet: [
      "Main power cable",
      "Control / signal cable",
      "Cable reel slip ring connection"
    ]
  },
  locations: [
    "Main Yard",
    "North Site",
    "South Site"
  ],
  regions: [
    "Midwest",
    "Southeast",
    "Northeast"
  ],
  departments: [
    "Maintenance",
    "Operations",
    "Logistics"
  ],
  costCenters: [
    "CC-1000",
    "CC-2000",
    "CC-3000"
  ]
};

/**
 * Creates all tables if they don't already exist. Safe to call on every
 * request — cheap, and cached per warm serverless instance.
 */
export async function ensureTable() {
  if (initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS inspections (
      id               TEXT PRIMARY KEY,
      equipment_type   TEXT,
      equipment_label  TEXT,
      unit_id          TEXT,
      operator         TEXT,
      inspection_date  TEXT,
      shift            TEXT,
      hours            TEXT,
      attachment       TEXT,
      has_fail         BOOLEAN,
      saved_at         TIMESTAMPTZ,
      created_by       TEXT,
      location         TEXT,
      region           TEXT,
      department       TEXT,
      cost_center      TEXT,
      data             JSONB NOT NULL
    );
  `;
  // Migrations for columns added after the table originally existed.
  await sql`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS location TEXT;`;
  await sql`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS region TEXT;`;
  await sql`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS department TEXT;`;
  await sql`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS cost_center TEXT;`;
  await sql`CREATE INDEX IF NOT EXISTS inspections_saved_at_idx ON inspections (saved_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS inspections_location_idx ON inspections (location);`;
  await sql`CREATE INDEX IF NOT EXISTS inspections_region_idx ON inspections (region);`;
  await sql`CREATE INDEX IF NOT EXISTS inspections_department_idx ON inspections (department);`;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'general',
      created_at    TIMESTAMPTZ
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS app_config (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS work_orders (
      id               TEXT PRIMARY KEY,
      inspection_id    TEXT,
      equipment_type   TEXT,
      equipment_label  TEXT,
      unit_id          TEXT,
      location         TEXT,
      region           TEXT,
      department       TEXT,
      cost_center      TEXT,
      item_group       TEXT,
      item_label       TEXT,
      item_status      TEXT,
      item_notes       TEXT,
      photo            TEXT,
      status           TEXT NOT NULL DEFAULT 'Open',
      created_at       TIMESTAMPTZ,
      created_by       TEXT,
      resolution_notes TEXT,
      closed_at        TIMESTAMPTZ,
      closed_by        TEXT,
      updated_at       TIMESTAMPTZ
    );
  `;
  await sql`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS region TEXT;`;
  await sql`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS department TEXT;`;
  await sql`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cost_center TEXT;`;
  await sql`CREATE INDEX IF NOT EXISTS work_orders_status_idx ON work_orders (status);`;
  await sql`CREATE INDEX IF NOT EXISTS work_orders_created_at_idx ON work_orders (created_at DESC);`;

  initialized = true;
}

export function computeHasFail(record) {
  const groups = [
    record.fluids || [],
    record.checklist || [],
    record.attachmentChecklist || [],
    record.attachmentLines || []
  ];
  for (const group of groups) {
    for (const item of group) {
      if (item && (item.status === 'Needs Attention' || item.status === 'Low')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns every flagged item on a record with which group it came from,
 * so a work order can be filed per item.
 */
export function collectFlaggedItems(record) {
  const groupNames = ['fluids', 'checklist', 'attachmentChecklist', 'attachmentLines'];
  const out = [];
  groupNames.forEach((groupName) => {
    (record[groupName] || []).forEach((item) => {
      if (item && (item.status === 'Needs Attention' || item.status === 'Low')) {
        out.push({ group: groupName, ...item });
      }
    });
  });
  return out;
}
