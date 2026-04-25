/**
 * backupRouteAgent.js
 * Agent 7 — Backup Route Intelligence
 *
 * Triggers when a ship faces:
 *   - Port congestion level = High  (loadPercent >= 85 or congestionLevel = 'High')
 *   - Geopolitical severity  = High  (geoData.severity = 'High')
 *   - Risk score >= 70 (overall high risk)
 *
 * For each triggered ship, finds:
 *   1. Alternate backup port (less congested, same country)
 *   2. Alternate water route to that backup port
 *   3. Cost/time estimate for rerouting
 */

const fs   = require('fs');
const path = require('path');

const ALT_DATA_PATH = path.join(__dirname, '../data/mockAlternatePorts.json');

class BackupRouteAgent {
  constructor() {
    this.name    = 'BackupRouteAgent';
    this.version = '1.0.0';
  }

  _loadAltData() {
    try {
      return JSON.parse(fs.readFileSync(ALT_DATA_PATH, 'utf-8'));
    } catch (e) {
      console.warn(`[${this.name}] Could not load alt port data: ${e.message}`);
      return {};
    }
  }

  _needsBackupRoute(ship) {
    const portHigh  = ship.portData?.congestionLevel === 'High' || (ship.portData?.loadPercent || 0) >= 85;
    const geoHigh   = ship.geoData?.severity === 'High';
    const riskHigh  = ship.riskScore >= 70;
    const hasGeoDelay = (ship.geoPoliticalDelays || []).some(d => d.severity === 'High');
    return portHigh || geoHigh || riskHigh || hasGeoDelay;
  }

  _buildTriggerReasons(ship) {
    const reasons = [];
    if (ship.portData?.congestionLevel === 'High')
      reasons.push({ type: 'port_congestion', detail: `Destination port at ${ship.portData.loadPercent?.toFixed(0)}% capacity — avg wait ${ship.portData.avgWaitDays} days` });
    if (ship.geoData?.severity === 'High')
      reasons.push({ type: 'geopolitical', detail: ship.geoData.description });
    (ship.geoPoliticalDelays || []).filter(d => d.severity === 'High').forEach(d => {
      reasons.push({ type: 'geo_event', detail: d.newsHeadline, addedDays: d.addedDays });
    });
    if (ship.riskScore >= 70)
      reasons.push({ type: 'risk_score', detail: `Overall risk score ${ship.riskScore}/100 exceeds safe threshold` });
    return reasons;
  }

  async run(ships, country) {
    console.log(`\n[${this.name}] Evaluating backup routes for ${country} imports...`);

    const altData   = this._loadAltData();
    const countryAlt = altData[country];

    if (!countryAlt) {
      console.log(`[${this.name}] No alternate port data configured for ${country} — skipping`);
      return ships.map(s => ({ ...s, backupRoute: null }));
    }

    let backupCount = 0;

    const enriched = ships.map(ship => {
      if (!this._needsBackupRoute(ship)) {
        return { ...ship, backupRoute: null, backupTriggered: false };
      }

      backupCount++;

      // Find matching backup route for this ship's current route
      const routeKey  = Object.keys(countryAlt.backupRoutes).find(key =>
        ship.route.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(ship.route.toLowerCase().split(' ')[0])
      );

      const altRoute  = routeKey ? countryAlt.backupRoutes[routeKey] : null;

      // Pick least-congested backup port relevant to cargo type
      const altPort   = countryAlt.backupPorts
        .filter(p => p.congestionLevel === 'Low' || p.congestionLevel === 'Medium')
        .sort((a, b) => a.loadPercent - b.loadPercent)[0] || null;

      const triggerReasons = this._buildTriggerReasons(ship);

      const backupRoute = {
        triggered:       true,
        triggerReasons,
        altPort:         altPort || null,
        altRoute:        altRoute || null,
        extraDays:       altRoute?.extraDays || (altPort ? 1 : 2),
        costPenalty:     (altRoute?.extraDays || 2) * 50000,   // $50k/day opportunity cost
        recommendation:  this._buildRecommendation(ship, altPort, altRoute),
        confidence:      this._calcConfidence(triggerReasons),
      };

      console.log(`[${this.name}]   🔀 ${ship.name} (${ship.shipId}) → backup route triggered`);
      console.log(`[${this.name}]      Reason: ${triggerReasons.map(r => r.type).join(', ')}`);
      if (altPort)  console.log(`[${this.name}]      Alt port: ${altPort.name} (${altPort.loadPercent}% load)`);
      if (altRoute) console.log(`[${this.name}]      Alt route: ${altRoute.name} (+${altRoute.extraDays}d)`);

      return { ...ship, backupRoute, backupTriggered: true };
    });

    console.log(`[${this.name}] Backup route analysis complete — ${backupCount}/${ships.length} ships need rerouting`);
    return enriched;
  }

  _buildRecommendation(ship, altPort, altRoute) {
    if (altRoute && altPort) {
      return `Reroute ${ship.name} via "${altRoute.name}" to ${altPort.name} — avoids ${altRoute.avoidZone}. +${altRoute.extraDays} days, ~$${(altRoute.extraDays * 50000).toLocaleString()} extra cost.`;
    }
    if (altRoute) {
      return `Use backup route "${altRoute.name}" — avoids ${altRoute.avoidZone}. +${altRoute.extraDays} days extra transit.`;
    }
    if (altPort) {
      return `Redirect ${ship.name} to ${altPort.name} (${altPort.loadPercent}% load, ${altPort.avgWaitDays}d wait) instead of congested primary port.`;
    }
    return `Consider alternate routing for ${ship.name} — primary route has High risk.`;
  }

  _calcConfidence(reasons) {
    const hasPort = reasons.some(r => r.type === 'port_congestion');
    const hasGeo  = reasons.some(r => r.type === 'geopolitical' || r.type === 'geo_event');
    const hasRisk = reasons.some(r => r.type === 'risk_score');
    if (hasPort && hasGeo) return 'Very High';
    if (hasPort || (hasGeo && hasRisk)) return 'High';
    if (hasGeo || hasRisk) return 'Medium';
    return 'Low';
  }
}

module.exports = new BackupRouteAgent();
