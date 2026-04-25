/**
 * pythonMLClient.js
 * HTTP client that delegates all ML inference to the Python Flask microservice
 * running on ML_SERVICE_URL (default: http://localhost:5001).
 *
 * Drop-in replacement for mlRegistry.js — same public API surface.
 */

'use strict';

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
const TIMEOUT_MS = 10000;

// ─── HTTP helper ───────────────────────────────────────────────────────────────
async function mlPost(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'ML service error');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function mlGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_URL}${path}`, {
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── PythonMLClient ────────────────────────────────────────────────────────────
class PythonMLClient {
  constructor() {
    this._metricsCache = null;
  }

  // ── Health / metrics ─────────────────────────────────────────────────────────
  async health() {
    return mlGet('/health');
  }

  // ── Single prediction ─────────────────────────────────────────────────────────
  async predict(ship, context = {}) {
    const data = await mlPost('/predict', { ship, context });
    return data.prediction;
  }

  // ── Batch prediction ──────────────────────────────────────────────────────────
  async batchPredict(ships) {
    const data = await mlPost('/batch', { ships });
    return data.results; // [{ shipId, prediction, impact, error }]
  }

  /**
   * Enrich an array of ships with mlPrediction + mlImpact fields.
   * Used directly in coordinatorAgentML.js as a drop-in for mlRegistry.batchPredict().
   */
  async batchEnrich(ships) {
    try {
      const data = await mlPost('/batch', { ships });
      return ships.map((ship, i) => {
        const r = data.results[i];
        if (r && r.prediction) {
          return { ...ship, mlPrediction: r.prediction, mlImpact: r.impact };
        }
        console.warn(`[PythonML] No prediction for ${ship.shipId}: ${r?.error}`);
        return { ...ship, mlPrediction: null, mlImpact: null };
      });
    } catch (err) {
      console.error('[PythonML] batchEnrich failed:', err.message);
      // Graceful degradation — return ships without ML enrichment
      return ships.map(s => ({ ...s, mlPrediction: null, mlImpact: null }));
    }
  }

  // ── Metrics/presets (cached) ──────────────────────────────────────────────────
  get trainMetrics() { return this._metricsCache || {}; }

  async refreshMetrics() {
    try {
      const h = await this.health();
      this._metricsCache      = h.metrics || {};
    } catch (e) {
      console.warn('[PythonML] Could not refresh metrics:', e.message);
    }
  }
}

const client = new PythonMLClient();
module.exports = client;
