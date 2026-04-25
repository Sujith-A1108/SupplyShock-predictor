/**
 * mlRoutes.js  (Python ML Edition)
 * Express router — proxies requests to Python ML microservice.
 * Same endpoint contract as before.
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const mlAgent  = require('./mlPredictionAgent');
const pythonML = require('./pythonMLClient');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

let initPromise = null;
function ensureInit() {
  if (!initPromise) initPromise = mlAgent.init();
  return initPromise;
}

// ── GET /api/ml/status ────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    await ensureInit();
    // Get fresh metrics from Python service
    const health = await fetch(`${ML_URL}/health`).then(r => r.json()).catch(() => null);
    res.json({
      success:       true,
      status:        health ? 'ready' : 'degraded',
      model_version: '3.0.0-python',
      backend:       'scikit-learn (Python)',
      metrics:       health?.metrics || mlAgent.metrics,
      timestamp:     new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/ml/predict ──────────────────────────────────────────────────────
router.post('/predict', async (req, res) => {
  try {
    await ensureInit();
    const { ship, context = {} } = req.body;
    if (!ship) return res.status(400).json({ success: false, error: 'ship required' });
    const prediction = await mlAgent.predictOne(ship, context);
    const impact     = await mlAgent.estimateImpact(prediction, {
      cargoValue: ship.consignment?.totalValueUSD || 5_000_000,
    });
    res.json({ success: true, shipment_id: ship.shipId || ship.name, prediction, impact });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/ml/routes/recommend ─────────────────────────────────────────────
router.post('/routes/recommend', async (req, res) => {
  try {
    await ensureInit();
    const { ship, context = {} } = req.body;
    if (!ship) return res.status(400).json({ success: false, error: 'ship required' });
    const result = await mlAgent.recommendRoutes(ship, context);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/ml/suppliers/rank ───────────────────────────────────────────────
router.post('/suppliers/rank', async (req, res) => {
  try {
    await ensureInit();
    const { suppliers, ship, context = {} } = req.body;
    if (!suppliers || !ship) return res.status(400).json({ success: false, error: 'suppliers and ship required' });
    const ranked = await mlAgent.rankSuppliers(suppliers, ship, context);
    res.json({ success: true, ranked_suppliers: ranked });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/ml/impact ───────────────────────────────────────────────────────
router.post('/impact', async (req, res) => {
  try {
    await ensureInit();
    const { mlOutput, financials = {} } = req.body;
    if (!mlOutput) return res.status(400).json({ success: false, error: 'mlOutput required' });
    const impact = await mlAgent.estimateImpact(mlOutput, financials);
    res.json({ success: true, impact });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/ml/train ────────────────────────────────────────────────────────
router.post('/train', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await fetch(`${ML_URL}/train`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
