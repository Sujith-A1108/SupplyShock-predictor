/**
 * riskCalculator.js  (ML-Augmented)
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for the original riskCalculator.js
 *
 * Strategy:
 *   - If mlRegistry is ready and ship has mlPrediction, BLEND ML + rule-based.
 *   - If ML is not available, fall back 100% to the original rule-based formula.
 *   - All existing function signatures are preserved for full backward compat.
 */

'use strict';

// ─── Original rule-based scoring (preserved exactly) ─────────────────────────

function calculateShipmentRisk({ ship, weather, geo, port }) {
  const weights = { delay: 0.25, weather: 0.25, geo: 0.30, port: 0.20 };

  const delayScore   = Math.min((ship.delayDays / 10) * 100, 100);
  const weatherScore = weather ? weather.riskLevel === 'High' ? 85 : weather.riskLevel === 'Medium' ? 50 : 15 : 10;
  const geoScore     = geo ? geo.riskScore : 10;
  const portScore    = port ? port.riskScore : 20;

  const ruleScore =
    delayScore   * weights.delay   +
    weatherScore * weights.weather +
    geoScore     * weights.geo     +
    portScore    * weights.port;

  // If the ship already has an ML prediction, blend it in (60 ML / 40 rule)
  if (ship.mlPrediction && ship.mlPrediction.route_risk_score !== undefined) {
    const mlScore = ship.mlPrediction.route_risk_score;
    return Math.round(0.60 * mlScore + 0.40 * ruleScore);
  }

  return Math.round(ruleScore);
}

function getRiskLabel(score) {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

function calculateStockCoverDays({ currentStock, dailyDemand }) {
  if (!dailyDemand || dailyDemand === 0) return Infinity;
  return Math.floor(currentStock / dailyDemand);
}

function calculateShortageRisk({ stockCoverDays, expectedDelay, mlShortageRisk }) {
  // If ML shortage risk is available, use it as the primary signal
  if (mlShortageRisk !== undefined) {
    // mlShortageRisk is 0-100 numeric. Convert shortage_risk_num (0/1/2) → score.
    const mlScore = mlShortageRisk === 2 ? 85 : mlShortageRisk === 1 ? 50 : 15;
    // Blend with rule-based
    const ruleScore = _ruleBasedShortageRisk(stockCoverDays, expectedDelay);
    return Math.round(0.65 * mlScore + 0.35 * ruleScore);
  }
  return _ruleBasedShortageRisk(stockCoverDays, expectedDelay);
}

function _ruleBasedShortageRisk(stockCoverDays, expectedDelay) {
  if (stockCoverDays === Infinity) return 0;
  if (stockCoverDays <= expectedDelay) return 100;
  const buffer = stockCoverDays - expectedDelay;
  if (buffer >= 30) return 10;
  if (buffer >= 14) return 30;
  if (buffer >= 7)  return 60;
  return 85;
}

function calculateSupplierRisk({ reliability, leadTimeDays, country, mlSupplierResult }) {
  // ML-augmented supplier risk
  if (mlSupplierResult && mlSupplierResult.reliability_score !== undefined) {
    const mlRisk = 100 - mlSupplierResult.reliability_score;
    const HIGH_RISK_COUNTRIES = ['Yemen', 'Ukraine', 'Russia', 'Myanmar', 'Sudan'];
    const countryRisk = HIGH_RISK_COUNTRIES.includes(country) ? 20 : 0;
    return Math.round(mlRisk * 0.7 + countryRisk * 0.3);
  }

  const HIGH_RISK_COUNTRIES = ['Yemen', 'Ukraine', 'Russia', 'Myanmar', 'Sudan'];
  const countryRisk     = HIGH_RISK_COUNTRIES.includes(country) ? 30 : 0;
  const reliabilityScore = (1 - reliability) * 50;
  const leadTimeScore   = Math.min((leadTimeDays / 60) * 20, 20);
  return Math.round(reliabilityScore + leadTimeScore + countryRisk);
}

function estimateBusinessImpact({ riskScore, cargoValue, dailyRevenue, mlImpact }) {
  // Prefer ML-derived impact if available
  if (mlImpact && mlImpact.total_estimated_impact !== undefined) {
    return {
      estimatedDelayDays:     mlImpact.estimated_delay_days,
      estimatedRevenueLoss:   mlImpact.revenue_loss,
      estimatedCargoRisk:     mlImpact.cargo_risk_exposure,
      estimatedPenaltyCosts:  mlImpact.penalty_costs,
      estimatedShortageImpact: mlImpact.shortage_impact,
      totalEstimatedImpact:   mlImpact.total_estimated_impact,
      impactSeverity:         mlImpact.impact_severity,
      source:                 'ml',
    };
  }

  // Rule-based fallback
  const delayEstimate = riskScore >= 70 ? 14 : riskScore >= 40 ? 7 : 2;
  const revenueLoss   = dailyRevenue * delayEstimate;
  const cargoRisk     = (riskScore / 100) * cargoValue * 0.05;
  const total         = revenueLoss + cargoRisk;

  return {
    estimatedDelayDays:    delayEstimate,
    estimatedRevenueLoss:  Math.round(revenueLoss),
    estimatedCargoRisk:    Math.round(cargoRisk),
    totalEstimatedImpact:  Math.round(total),
    impactSeverity:        total > 500000 ? 'Critical' : total > 100000 ? 'High' : total > 20000 ? 'Medium' : 'Low',
    source:                'rule-based',
  };
}

function aggregateRiskSummary(shipments) {
  const total  = shipments.length;
  const high   = shipments.filter(s => s.riskLabel === 'High').length;
  const medium = shipments.filter(s => s.riskLabel === 'Medium').length;
  const low    = shipments.filter(s => s.riskLabel === 'Low').length;
  const avgScore = Math.round(shipments.reduce((acc, s) => acc + s.riskScore, 0) / total);

  // ML-enhanced aggregate stats
  const mlPredictions = shipments.filter(s => s.mlPrediction);
  const avgDelayProb  = mlPredictions.length
    ? +(mlPredictions.reduce((s, ship) => s + (ship.mlPrediction.delay_probability || 0), 0) / mlPredictions.length).toFixed(3)
    : null;
  const shortageHigh  = shipments.filter(s => s.mlPrediction?.shortage_risk === 'High').length;

  return { total, high, medium, low, avgScore, avgDelayProbability: avgDelayProb, shortageHighCount: shortageHigh };
}

module.exports = {
  calculateShipmentRisk,
  getRiskLabel,
  calculateStockCoverDays,
  calculateShortageRisk,
  calculateSupplierRisk,
  estimateBusinessImpact,
  aggregateRiskSummary,
};
