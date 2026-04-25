/**
 * server.js — ML PATCH
 * ─────────────────────────────────────────────────────────────────────────────
 * Add these three blocks to your existing ssp/backend/server.js
 *
 * PATCH 1 — require the ML routes (after existing require lines, ~line 10):
 */

const mlRoutes = require('../ml/mlRoutes');  // ← ADD THIS

/**
 * PATCH 2 — Mount ML routes (after existing app.use('/api/ports', ...) line):
 *
 * app.use('/api/ml', authMiddleware, mlRoutes);  // ← ADD THIS
 *
 * PATCH 3 — Warm up ML engine at startup (after app.listen callback opens):
 *
 * // Warm up ML models in the background so first /api/analyze is instant
 * (async () => {
 *   try {
 *     const mlAgent = require('../ml/mlPredictionAgent');
 *     await mlAgent.init();
 *     console.log('  [ML]  Models warm and ready.\n');
 *   } catch (err) {
 *     console.warn('  [ML]  Warm-up failed (non-fatal):', err.message);
 *   }
 * })();
 *
 * PATCH 4 — Replace coordinatorAgent require:
 *
 * // OLD: const { runPipeline } = require('../agents/coordinatorAgent');
 * // NEW:
 * const { runPipeline } = require('../ml/coordinatorAgentML');  // ← REPLACE
 */

// ─── Complete replacement for /api/analyze handler (optional — add ml fields) ─
// The coordinatorAgentML already returns mlMetrics + shockPresets.
// No change to the /api/analyze handler is needed if you use coordinatorAgentML.

module.exports = {}; // placeholder — this file is a patch guide, not a real module
