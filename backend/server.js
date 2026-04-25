/**
 * server.js — SupplyShock Predictor with Country Auth + ML Intelligence Suite
 */
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { spawn } = require('child_process');

const { login, logout, authMiddleware, COUNTRY_CREDENTIALS } = require('./auth');
const shipRoutes    = require('./routes/shipRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const geoRoutes     = require('./routes/geoRoutes');
const portRoutes    = require('./routes/portRoutes');
const mlRoutes       = require('../ml/mlRoutes');
const realtimeRoutes = require('./routes/realtimeRoutes');
const { runPipeline } = require('../ml/coordinatorAgentML');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

// ─── Launch Python ML microservice ────────────────────────────────────────────
function startPythonML() {
  const mlDir  = path.join(__dirname, '../python_ml');
  const mlPort = process.env.ML_PORT || 5001;
  console.log(`\n  [ML]  Launching Python ML microservice on port ${mlPort}...`);

  const py = spawn('py', ['ml_server.py'], {
    cwd: mlDir,
    env: { ...process.env, ML_PORT: String(mlPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  py.stdout.on('data', d => process.stdout.write(`  [Python ML]  ${d}`));
  py.stderr.on('data', d => {
    const msg = d.toString();
    // Filter out Flask's normal startup/request logs at INFO level
    if (!msg.includes('WARNING') && !msg.includes('GET /') && !msg.includes('POST /')) {
      process.stderr.write(`  [Python ML]  ${d}`);
    }
  });

  py.on('exit', (code, sig) => {
    if (code !== 0 && sig !== 'SIGTERM') {
      console.warn(`  [ML]  Python ML process exited (code ${code}) — will degrade gracefully`);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => py.kill('SIGTERM'));
  process.on('SIGINT',  () => py.kill('SIGTERM'));

  return py;
}

startPythonML();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── Country login banner ──────────────────────────────────────────────────────
const COUNTRY_BANNERS = {
  India: `
============================================================
  [IN] INDIA PORTAL ACTIVATED
  Monitoring : Arabian Sea, Bay of Bengal, Persian Gulf
  Entry Ports: Nhava Sheva, Chennai, Kochi, Kolkata, Mundra
  Risk Zones : Hormuz (HIGH), Gulf of Aden (HIGH), BoB Piracy
  API Keys   : MarineTraffic [IN], OpenWeatherMap, PortWatch [IN]
============================================================`,

  Iran: `
============================================================
  [IR] IRAN PORTAL ACTIVATED
  Monitoring : Persian Gulf, Gulf of Oman, Arabian Sea
  Entry Ports: Bandar Abbas, Imam Khomeini Port, Chabahar
  Risk Zones : Hormuz IRGC (HIGH), US Navy Gulf (HIGH), Red Sea Houthi (HIGH)
  API Keys   : MarineTraffic [IR], OpenWeatherMap, PortWatch [IR]
============================================================`,

  USA: `
============================================================
  [US] USA PORTAL ACTIVATED
  Monitoring : North Atlantic, Trans-Pacific, Gulf of Mexico
  Entry Ports: Los Angeles, Houston, New York, Baltimore, Savannah
  Risk Zones : Panama Canal drought (MEDIUM), China tariff reroutes (HIGH)
  API Keys   : MarineTraffic [US], OpenWeatherMap, PortWatch [US]
============================================================`,

  Russia: `
============================================================
  [RU] RUSSIA PORTAL ACTIVATED
  Monitoring : Black Sea, Bosphorus, Baltic, Arctic, Pacific
  Entry Ports: St. Petersburg, Novorossiysk, Vladivostok, Murmansk
  Risk Zones : Black Sea war (HIGH), Bosphorus block (HIGH), Red Sea (HIGH)
  API Keys   : MarineTraffic [RU], OpenWeatherMap, PortWatch [RU]
============================================================`,
};

// ─── Auth endpoints ────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password)
    return res.status(400).json({ success: false, error: 'userId and password required' });

  const result = login(userId, password);
  if (!result.success) {
    console.log(`\n  [AUTH]  Failed login attempt — userId: ${userId}`);
    return res.status(401).json(result);
  }

  const banner = COUNTRY_BANNERS[result.country] || '';
  console.log(banner);
  console.log(`  Session token  : ${result.token.slice(0, 24)}...`);
  console.log(`  Login time     : ${new Date().toISOString()}`);
  console.log(`  Running preprocessing for ${result.country}...\n`);

  try {
    const shipAgent = require('../agents/shipAgent');
    const { runPreprocessing } = require('../utils/preprocessLogger');
    const rawShips = await shipAgent.run(result.country);
    await runPreprocessing(result.country, rawShips);
    console.log(`\n  [LOGIN]  Preprocessing complete for ${result.country} — ready for analysis.\n`);
  } catch (err) {
    console.error(`\n  [LOGIN]  Preprocessing failed: ${err.message}\n`);
  }

  res.json(result);
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers['x-auth-token'];
  const country = req.session.country;
  logout(token);
  console.log(`\n  [AUTH]  ${country} operator logged out — ${new Date().toISOString()}\n`);
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const c = COUNTRY_CREDENTIALS[req.session.country];
  res.json({ success: true, country: req.session.country, flag: c.flag, color: c.color, accentColor: c.accentColor });
});

// ─── Protected API routes ──────────────────────────────────────────────────────
app.use('/api/ships',   authMiddleware, shipRoutes);
app.use('/api/weather', authMiddleware, weatherRoutes);
app.use('/api/geo',     authMiddleware, geoRoutes);
app.use('/api/ports',   authMiddleware, portRoutes);
app.use('/api/ml',      authMiddleware, mlRoutes);
app.use('/api/realtime', authMiddleware, realtimeRoutes);

app.post('/api/analyze', authMiddleware, async (req, res) => {
  try {
    const country = req.session.country;
    console.log(`\n  [ANALYZE]  Request received for country: ${country}`);
    console.log(`  [ANALYZE]  ${new Date().toISOString()}`);
    console.log(`  [ANALYZE]  Starting preprocessing + ML pipeline...\n`);
    const result = await runPipeline(country);
    res.json({ success: true, country, ...result });
  } catch (err) {
    console.error('\n  [ERROR]  Pipeline failed:', err.message);
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Startup banner ────────────────────────────────────────────────────────────
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log('');
    console.log('============================================================');
    console.log('  SUPPLYSHOCK PREDICTOR  v5.0  [Python ML + Real-time]');
    console.log('  Multi-Agent Maritime Import Intelligence Platform');
    console.log('  ML Backend: scikit-learn (GBT + Random Forest)');
    console.log('============================================================');
    console.log(`  Server     : http://localhost:${port}`);
    console.log(`  Health     : http://localhost:${port}/api/health`);
    console.log(`  ML Status  : http://localhost:${port}/api/ml/status`);
    console.log(`  Mode       : ${process.env.DATA_MODE === 'live' ? 'LIVE API' : 'MOCK DATA'}`);
    console.log('');
    console.log('  COUNTRY CREDENTIALS:');
    Object.entries(COUNTRY_CREDENTIALS).forEach(([c, v]) => {
      console.log(`  ${v.flag}  ${c.padEnd(8)}  ${v.userId}  /  ${v.password}`);
    });
    console.log('');
    console.log('  Warming up Python ML models in background...');
    console.log('============================================================');
    console.log('');

    // Warm up: wait for Python ML service then init agent
    (async () => {
      // Give Python service a few seconds to start up
      await new Promise(r => setTimeout(r, 3000));
      try {
        const mlAgent = require('../ml/mlPredictionAgent');
        await mlAgent.init();
        const h = await fetch(`${process.env.ML_SERVICE_URL || 'http://localhost:5001'}/health`)
          .then(r => r.json()).catch(() => null);
        if (h?.status === 'ready') {
          console.log('  [ML]  Python scikit-learn models ready.');
          const m = h.metrics || {};
          if (m.delay)   console.log(`  [ML]  Delay accuracy:    ${m.delay.accuracy}`);
          if (m.shortage) console.log(`  [ML]  Shortage accuracy: ${m.shortage.accuracy}`);
          if (m.route)   console.log(`  [ML]  Route Risk R²:     ${m.route.r2}`);
          console.log('');
        } else {
          console.warn('  [ML]  Python ML service not yet ready — retrying at first request\n');
        }
      } catch (err) {
        console.warn('  [ML]  Warm-up failed (non-fatal):', err.message, '\n');
      }
    })();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const altPort = port + 1;
      console.warn(`Port ${port} is already in use. Attempting to start on ${altPort} instead.`);
      startServer(altPort);
      return;
    }

    console.error('Server error:', err);
    process.exit(1);
  });
};

startServer(PORT);

module.exports = app;
