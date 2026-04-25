/**
 * riskCalculator.js
 * Core risk scoring engine for SupplyShock Predictor
 */

/**
 * Calculate overall shipment risk score (0-100)
 */
function calculateShipmentRisk({ ship, weather, geo, port }) {
  const weights = {
    delay: 0.25,
    weather: 0.25,
    geo: 0.30,
    port: 0.20,
  };

  const delayScore = Math.min((ship.delayDays / 10) * 100, 100);
  const weatherScore = weather ? weather.riskLevel === 'High' ? 85 : weather.riskLevel === 'Medium' ? 50 : 15 : 10;
  const geoScore = geo ? geo.riskScore : 10;
  const portScore = port ? port.riskScore : 20;

  const overall =
    delayScore * weights.delay +
    weatherScore * weights.weather +
    geoScore * weights.geo +
    portScore * weights.port;

  return Math.round(overall);
}

/**
 * Label risk level from score
 */
function getRiskLabel(score) {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

/**
 * Calculate stock cover days
 */
function calculateStockCoverDays({ currentStock, dailyDemand }) {
  if (!dailyDemand || dailyDemand === 0) return Infinity;
  return Math.floor(currentStock / dailyDemand);
}

/**
 * Calculate shortage risk based on cover days and expected delay
 */
function calculateShortageRisk({ stockCoverDays, expectedDelay }) {
  if (stockCoverDays === Infinity) return 0;
  if (stockCoverDays <= expectedDelay) return 100;
  const buffer = stockCoverDays - expectedDelay;
  if (buffer >= 30) return 10;
  if (buffer >= 14) return 30;
  if (buffer >= 7) return 60;
  return 85;
}

/**
 * Calculate supplier risk score
 */
function calculateSupplierRisk({ reliability, leadTimeDays, country }) {
  const HIGH_RISK_COUNTRIES = ['Yemen', 'Ukraine', 'Russia', 'Myanmar', 'Sudan'];
  const countryRisk = HIGH_RISK_COUNTRIES.includes(country) ? 30 : 0;
  const reliabilityScore = (1 - reliability) * 50;
  const leadTimeScore = Math.min((leadTimeDays / 60) * 20, 20);
  return Math.round(reliabilityScore + leadTimeScore + countryRisk);
}

/**
 * Estimate business impact of a disruption
 */
function estimateBusinessImpact({ riskScore, cargoValue, dailyRevenue }) {
  const delayEstimate = riskScore >= 70 ? 14 : riskScore >= 40 ? 7 : 2;
  const revenueLoss = dailyRevenue * delayEstimate;
  const cargoRisk = (riskScore / 100) * cargoValue * 0.05;
  const total = revenueLoss + cargoRisk;

  return {
    estimatedDelayDays: delayEstimate,
    estimatedRevenueLoss: Math.round(revenueLoss),
    estimatedCargoRisk: Math.round(cargoRisk),
    totalEstimatedImpact: Math.round(total),
  };
}

/**
 * Aggregate risk across all shipments
 */
function aggregateRiskSummary(shipments) {
  const total = shipments.length;
  const high = shipments.filter(s => s.riskLabel === 'High').length;
  const medium = shipments.filter(s => s.riskLabel === 'Medium').length;
  const low = shipments.filter(s => s.riskLabel === 'Low').length;
  const avgScore = Math.round(shipments.reduce((acc, s) => acc + s.riskScore, 0) / total);

  return { total, high, medium, low, avgScore };
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
