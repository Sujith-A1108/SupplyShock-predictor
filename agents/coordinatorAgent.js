/**
 * coordinatorAgent.js — Master pipeline orchestrator with backup route engine
 */
const shipAgent           = require('./shipAgent');
const weatherAgent        = require('./weatherAgent');
const geopoliticsAgent    = require('./geopoliticsAgent');
const portCongestionAgent = require('./portCongestionAgent');
const inventoryAgent      = require('./inventoryAgent');
const backupRouteAgent    = require('./backupRouteAgent');

const { calculateShipmentRisk, getRiskLabel, estimateBusinessImpact, aggregateRiskSummary } = require('../utils/riskCalculator');
const { buildAlertMessage } = require('../utils/formatter');
const { runPreprocessing }  = require('../utils/preprocessLogger');

function predictRisk(ships) {
  return ships.map(ship => {
    const riskScore = calculateShipmentRisk({ ship, weather: ship.weatherData, geo: ship.geoData, port: ship.portData });
    const geoDelayPenalty = (ship.geoPoliticalDelays || []).reduce((sum, d) => {
      return sum + (d.severity === 'High' ? 15 : d.severity === 'Medium' ? 8 : 3);
    }, 0);
    const finalScore = Math.min(riskScore + geoDelayPenalty, 100);
    return { ...ship, riskScore: finalScore, riskLabel: getRiskLabel(finalScore) };
  });
}

function generateDecisions(ships) {
  return ships.map(ship => {
    const recommendations = [];

    if (ship.riskScore >= 70) {
      if (ship.geoData?.severity === 'High')
        recommendations.push({ type: 'route_change', message: `Reroute ${ship.name} via ${ship.geoData.alternateRoute || 'alternate route'} to avoid ${ship.geoData.region}` });
      if ((ship.geoPoliticalDelays || []).length > 0)
        recommendations.push({ type: 'geopolitical_alert', message: `Geopolitical risk: ${ship.geoPoliticalDelays[0].newsHeadline}` });
      if (ship.backupRoute?.triggered)
        recommendations.push({ type: 'backup_route', message: ship.backupRoute.recommendation });
      if (ship.maxShortageRisk >= 60) {
        recommendations.push({ type: 'stock_increase', message: `Increase safety stock — shortage risk at ${ship.maxShortageRisk}%` });
        recommendations.push({ type: 'early_reorder', message: `Trigger early reorder for ${ship.cargo?.join(', ')} from backup supplier` });
      }
      recommendations.push({ type: 'alternate_supplier', message: `Identify alternate supplier for cargo on ${ship.name} as contingency` });
    } else if (ship.riskScore >= 40) {
      recommendations.push({ type: 'monitor', message: `Monitor ${ship.name} closely — medium risk on ${ship.route} route` });
      if (ship.delayDays > 0)
        recommendations.push({ type: 'early_reorder', message: `Consider early reorder for ${ship.cargo?.join(', ')} due to ${ship.delayDays}-day delay` });
      if ((ship.geoPoliticalDelays || []).some(d => d.severity !== 'Low'))
        recommendations.push({ type: 'geopolitical_alert', message: `Monitor: ${ship.geoPoliticalDelays.find(d => d.severity !== 'Low')?.newsHeadline}` });
      if (ship.backupRoute?.triggered)
        recommendations.push({ type: 'backup_route', message: ship.backupRoute.recommendation });
    } else {
      recommendations.push({ type: 'monitor', message: `${ship.name} is on schedule — no action required` });
    }

    return { ...ship, recommendations };
  });
}

function generateInsights(ships) {
  const alerts = [];
  const insights = ships.map(ship => {
    const reasons = [];
    if (ship.weatherData?.riskLevel === 'High') reasons.push(`Severe weather: ${ship.weatherData.conditions} in ${ship.weatherData.region}`);
    if (ship.geoData?.severity === 'High') reasons.push(`Geopolitical: ${ship.geoData.description}`);
    if (ship.portData?.congestionLevel === 'High') reasons.push(`Port congestion (${ship.portData?.avgWaitDays}d wait)`);
    if (ship.delayDays > 0) reasons.push(`Delay: ${ship.delayDays} days`);
    if ((ship.geoPoliticalDelays || []).length > 0)
      reasons.push(`Geo-political: ${ship.geoPoliticalDelays.map(d => d.cause).join('; ')}`);
    if (ship.backupRoute?.triggered)
      reasons.push(`Backup route activated: ${ship.backupRoute.altRoute?.name || 'alternate port'}`);

    const reason = reasons.length > 0 ? reasons.join('; ') : 'Nominal conditions';
    const impact = estimateBusinessImpact({ riskScore: ship.riskScore, cargoValue: 5_000_000, dailyRevenue: 50_000 });

    if (ship.riskLabel === 'High' || ship.riskLabel === 'Medium')
      alerts.push(buildAlertMessage({ ship, riskScore: ship.riskScore, riskLabel: ship.riskLabel, reason }));

    return { ...ship, reason, impact };
  });
  return { ships: insights, alerts };
}

async function runPipeline(country) {
  // ── Step 0: Preprocessing (terminal logs) ─────────────────────────────────
  // We do a quick first pass of ships to power the preprocessing display
  const rawShips = await shipAgent.run(country);
  await runPreprocessing(country, rawShips);

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  🚀  Starting Agent Pipeline for ${country}`);
  console.log(`${'─'.repeat(55)}`);

  // ── Agent pipeline ─────────────────────────────────────────────────────────
  const step2 = await weatherAgent.run(rawShips);
  const step3 = await geopoliticsAgent.run(step2);
  const step4 = await portCongestionAgent.run(step3);
  const step5 = await inventoryAgent.run(step4);
  const step6 = predictRisk(step5);

  // ── Backup Route Agent (new) ───────────────────────────────────────────────
  const step7 = await backupRouteAgent.run(step6, country);

  // ── Decision + Insight ─────────────────────────────────────────────────────
  const step8 = generateDecisions(step7);
  const { ships: finalShips, alerts } = generateInsights(step8);
  const summary = aggregateRiskSummary(finalShips);

  // Summary log
  const backupCount = finalShips.filter(s => s.backupTriggered).length;
  console.log(`\n  📊  Pipeline Complete`);
  console.log(`      Total : ${summary.total}  |  High: ${summary.high}  |  Med: ${summary.medium}  |  Low: ${summary.low}`);
  console.log(`      Backup routes activated: ${backupCount}/${summary.total} vessels\n`);

  return { shipments: finalShips, alerts, summary };
}

module.exports = { runPipeline };
