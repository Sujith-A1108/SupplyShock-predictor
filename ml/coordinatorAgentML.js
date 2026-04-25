/**
 * coordinatorAgent.js — Master pipeline orchestrator (ML-Augmented v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from v1:
 *   - step5.5: MLPredictionAgent.run() after inventoryAgent
 *   - predictRisk() now blends ML route_risk_score (60%) + rule-based (40%)
 *   - generateDecisions() uses ML predictions for smarter recommendations
 *   - generateInsights() reports ML-derived delay probability + shortage risk
 *   - Impact uses ML financial estimates when available
 */

const shipAgent            = require('../agents/shipAgent');
const weatherAgent         = require('../agents/weatherAgent');
const geopoliticsAgent     = require('../agents/geopoliticsAgent');
const portCongestionAgent  = require('../agents/portCongestionAgent');
const inventoryAgent       = require('../agents/inventoryAgent');
const backupRouteAgent     = require('../agents/backupRouteAgent');
const mlPredictionAgent    = require('../ml/mlPredictionAgent');

const { calculateShipmentRisk, getRiskLabel, estimateBusinessImpact, aggregateRiskSummary } = require('../utils/riskCalculator');
const { buildAlertMessage } = require('../utils/formatter');
const { runPreprocessing }  = require('../utils/preprocessLogger');

function predictRisk(ships) {
  return ships.map(ship => {
    const ruleScore = calculateShipmentRisk({ ship, weather: ship.weatherData, geo: ship.geoData, port: ship.portData });
    const geoDelayPenalty = (ship.geoPoliticalDelays || []).reduce((sum, d) => {
      return sum + (d.severity === 'High' ? 15 : d.severity === 'Medium' ? 8 : 3);
    }, 0);

    let finalScore;
    // ML-augmented blending
    if (ship.mlPrediction && ship.mlPrediction.route_risk_score !== undefined) {
      const mlScore  = ship.mlPrediction.route_risk_score;
      const blended  = Math.round(0.60 * mlScore + 0.40 * ruleScore);
      finalScore     = Math.min(blended + geoDelayPenalty, 100);
    } else {
      finalScore     = Math.min(ruleScore + geoDelayPenalty, 100);
    }

    return { ...ship, riskScore: finalScore, riskLabel: getRiskLabel(finalScore) };
  });
}

function generateDecisions(ships) {
  return ships.map(ship => {
    const recommendations = [];
    const ml = ship.mlPrediction;

    if (ship.riskScore >= 70) {
      // ML-enhanced: delay probability threshold
      if (ml?.delay_probability >= 0.70)
        recommendations.push({ type: 'ml_delay_alert', message: `ML model predicts ${(ml.delay_probability * 100).toFixed(0)}% delay probability — expedite contingency planning` });

      if (ship.geoData?.severity === 'High')
        recommendations.push({ type: 'route_change', message: `Reroute ${ship.name} via ${ship.geoData.alternateRoute || 'alternate route'} to avoid ${ship.geoData.region}` });
      if ((ship.geoPoliticalDelays || []).length > 0)
        recommendations.push({ type: 'geopolitical_alert', message: `Geopolitical risk: ${ship.geoPoliticalDelays[0].newsHeadline}` });
      if (ship.backupRoute?.triggered)
        recommendations.push({ type: 'backup_route', message: ship.backupRoute.recommendation });
      if (ship.maxShortageRisk >= 60 || ml?.shortage_risk === 'High') {
        recommendations.push({ type: 'stock_increase', message: `Increase safety stock — ML shortage risk: ${ml?.shortage_risk || 'High'} (${ship.maxShortageRisk || 0}% rule-based)` });
        recommendations.push({ type: 'early_reorder', message: `Trigger early reorder for ${ship.cargo?.join(', ')} from backup supplier` });
      }

      // ML supplier risk
      if (ml?.supplier_risk_tier === 'High')
        recommendations.push({ type: 'supplier_switch', message: `Supplier risk tier: HIGH — ML reliability score ${ml.reliability_score}/100. Identify alternate supplier immediately.` });
      else
        recommendations.push({ type: 'alternate_supplier', message: `Identify alternate supplier for cargo on ${ship.name} as contingency` });

    } else if (ship.riskScore >= 40) {
      // ML: if model disagrees (higher probability), escalate
      if (ml?.delay_probability >= 0.60 && ship.riskScore < 70)
        recommendations.push({ type: 'ml_escalation', message: `ML model flags ${(ml.delay_probability * 100).toFixed(0)}% delay probability — consider escalating to High risk` });

      recommendations.push({ type: 'monitor', message: `Monitor ${ship.name} closely — medium risk on ${ship.route} route` });
      if (ship.delayDays > 0)
        recommendations.push({ type: 'early_reorder', message: `Consider early reorder for ${ship.cargo?.join(', ')} due to ${ship.delayDays}-day delay` });
      if (ml?.shortage_risk === 'High' || ml?.shortage_risk === 'Medium')
        recommendations.push({ type: 'inventory_warning', message: `ML shortage forecast: ${ml.shortage_risk} — predicted stock cover ${ml.predicted_stock_cover_days || '?'} days` });
      if ((ship.geoPoliticalDelays || []).some(d => d.severity !== 'Low'))
        recommendations.push({ type: 'geopolitical_alert', message: `Monitor: ${ship.geoPoliticalDelays.find(d => d.severity !== 'Low')?.newsHeadline}` });
      if (ship.backupRoute?.triggered)
        recommendations.push({ type: 'backup_route', message: ship.backupRoute.recommendation });
    } else {
      if (ml?.delay_probability >= 0.45)
        recommendations.push({ type: 'ml_watch', message: `ML model detects emerging risk (${(ml.delay_probability * 100).toFixed(0)}% delay probability) — monitor closely` });
      else
        recommendations.push({ type: 'monitor', message: `${ship.name} is on schedule — no action required` });
    }

    return { ...ship, recommendations };
  });
}

function generateInsights(ships) {
  const alerts = [];
  const insights = ships.map(ship => {
    const reasons = [];
    const ml = ship.mlPrediction;

    if (ship.weatherData?.riskLevel === 'High')   reasons.push(`Severe weather: ${ship.weatherData.conditions} in ${ship.weatherData.region}`);
    if (ship.geoData?.severity === 'High')         reasons.push(`Geopolitical: ${ship.geoData.description}`);
    if (ship.portData?.congestionLevel === 'High') reasons.push(`Port congestion (${ship.portData?.avgWaitDays}d wait)`);
    if (ship.delayDays > 0)                        reasons.push(`Delay: ${ship.delayDays} days`);
    if ((ship.geoPoliticalDelays || []).length > 0) reasons.push(`Geo-political: ${ship.geoPoliticalDelays.map(d => d.cause).join('; ')}`);
    if (ship.backupRoute?.triggered)               reasons.push(`Backup route activated: ${ship.backupRoute.altRoute?.name || 'alternate port'}`);

    // ML-derived reasons
    if (ml) {
      if (ml.delay_probability >= 0.6)       reasons.push(`ML: ${(ml.delay_probability * 100).toFixed(0)}% delay probability`);
      if (ml.shortage_risk !== 'Low')        reasons.push(`ML shortage risk: ${ml.shortage_risk} (${ml.predicted_stock_cover_days}d cover)`);
      if (ml.supplier_risk_tier === 'High')  reasons.push(`ML supplier risk: HIGH (reliability ${ml.reliability_score}/100)`);
    }

    const reason = reasons.length > 0 ? reasons.join('; ') : 'Nominal conditions';

    // Use ML impact when available
    const impact = estimateBusinessImpact({
      riskScore: ship.riskScore,
      cargoValue: ship.consignment?.totalValueUSD || 5_000_000,
      dailyRevenue: 50_000,
      mlImpact: ship.mlImpact,
    });

    if (ship.riskLabel === 'High' || ship.riskLabel === 'Medium')
      alerts.push(buildAlertMessage({ ship, riskScore: ship.riskScore, riskLabel: ship.riskLabel, reason }));

    return { ...ship, reason, impact };
  });
  return { ships: insights, alerts };
}

async function runPipeline(country) {
  // ── Step 0: Preprocessing ─────────────────────────────────────────────────
  const rawShips = await shipAgent.run(country);
  await runPreprocessing(country, rawShips);

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  🚀  Starting Agent Pipeline v2 (ML-Augmented) for ${country}`);
  console.log(`${'─'.repeat(55)}`);

  // ── Agent pipeline ────────────────────────────────────────────────────────
  const step2 = await weatherAgent.run(rawShips);
  const step3 = await geopoliticsAgent.run(step2);
  const step4 = await portCongestionAgent.run(step3);
  const step5 = await inventoryAgent.run(step4);

  // ── Step 5.5: ML Prediction Agent ─────────────────────────────────────────
  const step55 = await mlPredictionAgent.run(step5);

  // ── Backup Route Agent ────────────────────────────────────────────────────
  const step6 = await backupRouteAgent.run(step55, country);

  // ── Decision + Insight ────────────────────────────────────────────────────
  const step7  = predictRisk(step6);
  const step8  = generateDecisions(step7);
  const { ships: finalShips, alerts } = generateInsights(step8);
  const summary = aggregateRiskSummary(finalShips);

  const backupCount = finalShips.filter(s => s.backupTriggered).length;
  const mlCount     = finalShips.filter(s => s.mlPrediction).length;

  console.log(`\n  📊  Pipeline Complete`);
  console.log(`      Total: ${summary.total}  |  High: ${summary.high}  |  Med: ${summary.medium}  |  Low: ${summary.low}`);
  console.log(`      ML predictions: ${mlCount}/${summary.total}  |  Avg delay prob: ${summary.avgDelayProbability ?? 'N/A'}`);
  console.log(`      Backup routes: ${backupCount}/${summary.total}\n`);

  // Attach ML training metrics to response for dashboard
  return {
    shipments: finalShips,
    alerts,
    summary,
    mlMetrics: mlPredictionAgent.metrics,
  };
}

module.exports = { runPipeline };
