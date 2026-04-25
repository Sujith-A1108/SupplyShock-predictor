/**
 * preprocessLogger.js
 * Country-specific terminal preprocessing — Windows PowerShell compatible
 * Uses simple console.log (no \r carriage-return spinners, no ANSI that breaks on Windows)
 */

const COUNTRY_CONFIG = {
  India: {
    flag: '[IN]', fullFlag: '🇮🇳',
    ports: ['Nhava Sheva (Mumbai)', 'Chennai', 'Kochi', 'Kolkata', 'Mundra', 'Visakhapatnam'],
    apiEndpoints: {
      'MarineTraffic': 'AIS Feed [IN zone: 6N-23N, 68E-90E]',
      'OpenWeatherMap': 'Marine API — Arabian Sea + Bay of Bengal grid',
      'PortWatch IMF' : 'JNPT, Chennai, Kochi, Haldia nodes',
    },
    riskZones: [
      { zone: 'Strait of Hormuz',           severity: 'HIGH'   },
      { zone: 'Gulf of Aden / Red Sea',      severity: 'HIGH'   },
      { zone: 'Bay of Bengal (piracy)',       severity: 'MEDIUM' },
      { zone: 'Palk Strait',                 severity: 'LOW'    },
    ],
    cargoProfiles: ['Crude Oil / LPG', 'Electronics', 'Machinery', 'Pharmaceuticals', 'Palm Oil / Rubber', 'Coal'],
    validationRules: [
      'PASS  Check AIS position within Indian EEZ or inbound corridor',
      'PASS  Flag vessels with AIS dark periods > 6 hours',
      'PASS  Validate cargo manifest against DGFT import codes',
      'PASS  Cross-check MMSI with IMO vessel registry',
      'PASS  Normalize port names: Nhava Sheva <-> JNPT <-> Mumbai Port Trust',
      'PASS  Impute missing delay days to 0 for newly departed vessels',
      'PASS  Filter: exclude vessels with importCountry != India',
    ],
  },

  Iran: {
    flag: '[IR]', fullFlag: '🇮🇷',
    ports: ['Bandar Abbas', 'Imam Khomeini Port', 'Chabahar', 'Bandar Anzali'],
    apiEndpoints: {
      'MarineTraffic': 'AIS Feed [IR zone: 24N-38N, 44E-63E]',
      'OpenWeatherMap': 'Marine API — Persian Gulf + Gulf of Oman grid',
      'PortWatch IMF' : 'Bandar Abbas, Chabahar nodes',
    },
    riskZones: [
      { zone: 'Strait of Hormuz (IRGC patrols)',  severity: 'HIGH'   },
      { zone: 'Gulf of Oman (US Navy presence)',   severity: 'HIGH'   },
      { zone: 'Red Sea (Houthi threat)',            severity: 'HIGH'   },
      { zone: 'Caspian Sea corridor',              severity: 'LOW'    },
    ],
    cargoProfiles: ['Food Grains / Wheat', 'Machinery', 'Electronics', 'Steel', 'Medicines', 'LPG / Chemicals'],
    validationRules: [
      'PASS  Check AIS beacon active — flag dark ships in Hormuz corridor',
      'PASS  Validate vessel not on OFAC SDN sanctions list',
      'PASS  Cross-reference IMO against EU/UN sanctions registries',
      'PASS  Normalize port names: Imam Khomeini <-> Bandar Imam <-> BIK',
      'WARN  Flag vessels under non-Iranian registries (shadow fleet check)',
      'PASS  Impute missing delay days — apply +2d for Hormuz transit delays',
      'PASS  Filter: exclude vessels with importCountry != Iran',
    ],
  },

  USA: {
    flag: '[US]', fullFlag: '🇺🇸',
    ports: ['Los Angeles / Long Beach', 'Houston', 'New York / New Jersey', 'Baltimore', 'Savannah'],
    apiEndpoints: {
      'MarineTraffic': 'AIS Feed [US zone: 25N-48N, 65W-125W + Gulf of Mexico]',
      'OpenWeatherMap': 'Marine API — North Atlantic + Pacific + Gulf of Mexico grids',
      'PortWatch IMF' : 'POLA, POLB, Houston, PANYNJ, Savannah nodes',
    },
    riskZones: [
      { zone: 'Panama Canal (low water restriction)',  severity: 'MEDIUM' },
      { zone: 'Gulf of Mexico (hurricane season)',     severity: 'MEDIUM' },
      { zone: 'South China Sea (tariff reroutes)',     severity: 'HIGH'   },
      { zone: 'Cape Horn (alternate routing)',         severity: 'LOW'    },
    ],
    cargoProfiles: ['Electronics / Semiconductors', 'Auto Parts', 'Consumer Goods', 'Pharmaceuticals', 'LNG', 'Agricultural Products'],
    validationRules: [
      'PASS  Check vessel against CBP Automated Targeting System flags',
      'PASS  Validate ISF (Importer Security Filing) 10+2 compliance',
      'WARN  Cross-check against BIS Entity List for tariff-related rerouting',
      'PASS  Normalize port codes: USLAX <-> USLGB for LA/LB combined port',
      'WARN  Flag China-origin vessels with 145% tariff cargo — apply delay model',
      'PASS  Impute missing delay days — apply +1d for US port congestion',
      'PASS  Filter: exclude vessels with importCountry != USA',
    ],
  },

  Russia: {
    flag: '[RU]', fullFlag: '🇷🇺',
    ports: ['Saint Petersburg', 'Novorossiysk', 'Vladivostok', 'Murmansk', 'Ust-Luga', 'Kaliningrad'],
    apiEndpoints: {
      'MarineTraffic': 'AIS Feed [RU zone: 42N-72N, 20E-140E + Arctic]',
      'OpenWeatherMap': 'Marine API — Black Sea + Baltic + Arctic + Pacific grids',
      'PortWatch IMF' : 'Novorossiysk, St.Petersburg, Vladivostok, Murmansk nodes',
    },
    riskZones: [
      { zone: 'Black Sea (active war zone)',           severity: 'HIGH'   },
      { zone: 'Bosphorus (Turkey restriction)',        severity: 'HIGH'   },
      { zone: 'Red Sea (Houthi attacks)',              severity: 'HIGH'   },
      { zone: 'Korea Strait (sanctions port ban)',     severity: 'HIGH'   },
      { zone: 'Arctic (icebreaker withdrawal)',        severity: 'MEDIUM' },
    ],
    cargoProfiles: ['Electronics / IT Equipment', 'Vehicles', 'Consumer Goods', 'Food / Agriculture', 'Pharmaceuticals', 'Industrial Equipment'],
    validationRules: [
      'PASS  Check vessel against EU sanctions packages 1-14 registry',
      'WARN  Validate flag state — Russian-flagged vessels flagged for monitoring',
      'WARN  Cross-check shadow fleet list (OFAC + Lloyds) for sanctions evasion',
      'PASS  Normalize Cyrillic port names to Latin equivalents',
      'WARN  Detect Bosphorus AIS anomalies — Turkey reporting delays',
      'PASS  Apply Arctic route ice factor: multiply ETA x1.15 for Oct-April',
      'WARN  Flag vessels dark >12h in Black Sea — conflict avoidance maneuver',
      'PASS  Filter: exclude vessels with importCountry != Russia',
    ],
  },
};

function printLine(char, width) {
  console.log(char.repeat(width || 60));
}

function printBar(label, pct, width) {
  width = width || 28;
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  const bar    = '#'.repeat(filled) + '-'.repeat(empty);
  const status = pct >= 85 ? '[HIGH]' : pct >= 65 ? '[MED] ' : '[LOW] ';
  console.log(`  ${label.padEnd(24)} ${bar} ${pct}%  ${status}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runPreprocessing(country, ships) {
  const cfg = COUNTRY_CONFIG[country];
  if (!cfg) return;

  const W = 60;

  console.log('');
  printLine('=', W);
  console.log(`  ${cfg.fullFlag}  SUPPLYSHOCK PREDICTOR — PREPROCESSING`);
  console.log(`  Country  : ${country}  ${cfg.flag}`);
  console.log(`  Time     : ${new Date().toISOString()}`);
  console.log(`  Mode     : ${process.env.DATA_MODE === 'live' ? 'LIVE API' : 'MOCK DATA (demo mode)'}`);
  printLine('=', W);

  await sleep(120);

  // ── STEP 1: API Connection Check ─────────────────────────────────────────
  console.log('');
  console.log('  [STEP 1]  API Connection Check');
  printLine('-', W);
  for (const [service, endpoint] of Object.entries(cfg.apiEndpoints)) {
    await sleep(250);
    console.log(`  [OK]  ${service.padEnd(18)} ${endpoint}`);
  }

  // ── STEP 2: Port Load Status ──────────────────────────────────────────────
  console.log('');
  console.log('  [STEP 2]  Port Status Scan —', country, 'Entry Points');
  printLine('-', W);
  for (const port of cfg.ports) {
    await sleep(100);
    const load = 40 + Math.floor(Math.random() * 55);
    printBar(port, load);
  }

  // ── STEP 3: Risk Zone Monitoring ─────────────────────────────────────────
  console.log('');
  console.log('  [STEP 3]  Active Risk Zone Monitoring');
  printLine('-', W);
  for (const { zone, severity } of cfg.riskZones) {
    await sleep(100);
    const tag = `[${severity}]`.padEnd(9);
    console.log(`  ${tag}  ${zone}`);
  }

  // ── STEP 4: Data Cleaning & Validation ───────────────────────────────────
  console.log('');
  console.log('  [STEP 4]  Data Cleaning & Validation Rules');
  printLine('-', W);
  for (const rule of cfg.validationRules) {
    await sleep(180);
    console.log(`  ${rule}`);
  }

  // ── STEP 5: Vessel Inventory ─────────────────────────────────────────────
  console.log('');
  console.log('  [STEP 5]  Vessel Inventory —', country, 'Bound Ships');
  printLine('-', W);
  const delayed = ships.filter(s => s.delayDays > 0);
  const ontime  = ships.filter(s => s.delayDays === 0);
  await sleep(150);
  console.log(`  Total vessels loaded   : ${ships.length}`);
  console.log(`  On schedule            : ${ontime.length}`);
  console.log(`  Delayed                : ${delayed.length}${delayed.length > 0 ? '  (' + delayed.map(s => s.name).join(', ') + ')' : ''}`);
  console.log(`  Cargo types tracked    : ${cfg.cargoProfiles.join(' | ')}`);

  // ── STEP 6: Geo-Political Events ─────────────────────────────────────────
  const totalEvents = ships.reduce((a, s) => a + (s.geoPoliticalDelays||[]).length, 0);
  const highEvents  = ships.reduce((a, s) => a + (s.geoPoliticalDelays||[]).filter(d => d.severity === 'High').length, 0);
  console.log('');
  console.log('  [STEP 6]  Geo-Political Event Feed');
  printLine('-', W);
  await sleep(120);
  console.log(`  Active events ingested : ${totalEvents}`);
  console.log(`  High severity events   : ${highEvents}`);
  ships.forEach(s => {
    (s.geoPoliticalDelays || []).forEach(d => {
      const tag = `[${d.severity.toUpperCase()}]`.padEnd(9);
      console.log(`  ${tag}  ${s.name}: ${d.cause.slice(0, 52)}`);
    });
  });

  // ── STEP 7: Backup Route Engine ──────────────────────────────────────────
  const highRiskVessels = ships.filter(s =>
    (s.geoPoliticalDelays || []).some(d => d.severity === 'High') || s.delayDays >= 4
  );
  console.log('');
  console.log('  [STEP 7]  Backup Route Engine Init');
  printLine('-', W);
  console.log(`  Vessels requiring reroute analysis : ${highRiskVessels.length}`);
  for (const v of highRiskVessels) {
    await sleep(260);
    console.log(`  [CALC]  Alternate route -> ${v.name} (delay: +${v.delayDays}d)`);
  }
  if (highRiskVessels.length === 0) {
    console.log('  [OK]    No vessels require immediate rerouting');
  }

  // ── DONE ─────────────────────────────────────────────────────────────────
  console.log('');
  printLine('=', W);
  console.log('  PREPROCESSING COMPLETE — Launching agent pipeline...');
  printLine('=', W);
  console.log('');

  await sleep(100);
}

module.exports = { runPreprocessing };
