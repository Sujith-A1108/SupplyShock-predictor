/**
 * mlPredictionAgent.js  (Python ML Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the Python ML microservice client (pythonMLClient.js).
 * Same public API as before — coordinatorAgentML.js is unchanged.
 */

'use strict';

const pythonML = require('./pythonMLClient');

class MLPredictionAgent {
  constructor() {
    this.name    = 'MLPredictionAgent';
    this.version = '3.0.0-python';
    this._ready  = false;
  }

  async init() {
    if (this._ready) return;
    try {
      await pythonML.refreshMetrics();
      this._ready = true;
      console.log(`  [${this.name}]  Python ML service connected — ready for inference`);
    } catch (err) {
      console.warn(`  [${this.name}]  Python ML service not reachable: ${err.message}`);
      console.warn(`  [${this.name}]  Predictions will degrade gracefully (null mlPrediction)`);
      this._ready = true; // allow pipeline to continue without ML
    }
  }

  /**
   * Main pipeline runner — enriches ships with mlPrediction + mlImpact.
   */
  async run(ships) {
    if (!this._ready) await this.init();

    console.log(`\n  [${this.name}]  Sending ${ships.length} shipments to Python ML service...`);
    const enriched = await pythonML.batchEnrich(ships);

    // Summary log
    const withML  = enriched.filter(s => s.mlPrediction);
    const avgDelay = withML.length
      ? (withML.reduce((s, sh) => s + (sh.mlPrediction.delay_probability || 0), 0) / withML.length).toFixed(3)
      : 'N/A';
    const highRisk     = withML.filter(s => s.mlPrediction?.ml_risk_label === 'High').length;
    const highShortage = withML.filter(s => s.mlPrediction?.shortage_risk === 'High').length;

    console.log(`  [${this.name}]  Python ML complete — avg delay prob: ${avgDelay}`);
    console.log(`  [${this.name}]  High-risk: ${highRisk} | High shortage: ${highShortage}`);

    return enriched;
  }

  async predictOne(ship, context = {}) {
    if (!this._ready) await this.init();
    return pythonML.predict(ship, context);
  }

  async recommendRoutes(ship, context = {}) {
    // Delegate: score each alternate route via Python ML
    const ROUTES = ['Suez Canal','Cape of Good Hope','Trans-Pacific','Trans-Atlantic',
                    'Strait of Malacca','Panama Canal','Red Sea','Gulf of Aden','Mediterranean'];
    const currentRoute = ship.route || 'Unknown';
    const current = await pythonML.predict(ship, context);
    const alternatives = await Promise.all(
      ROUTES.filter(r => r !== currentRoute).map(async route => {
        const altPred = await pythonML.predict({ ...ship, route }, context);
        return {
          route,
          route_risk_score:    altPred.route_risk_score,
          route_risk_label:    altPred.ml_risk_label,
          delay_probability:   altPred.delay_probability,
          estimated_extra_days: route === 'Cape of Good Hope' ? 10 : route.includes('Pacific') ? 5 : 2,
        };
      })
    );
    return {
      current_route:      currentRoute,
      current_risk_score: current.route_risk_score,
      current_risk_label: current.ml_risk_label,
      alternatives: alternatives.sort((a, b) => a.route_risk_score - b.route_risk_score).slice(0, 3),
    };
  }

  async rankSuppliers(suppliers, baseShip, context = {}) {
    const results = await Promise.all(suppliers.map(async sup => {
      const pred = await pythonML.predict(
        { ...baseShip, supplierCountry: sup.supplierCountry },
        { ...context, supplierRiskScore: sup.supplierRiskScore || 20 }
      );
      return {
        supplier_id:        sup.supplierId,
        supplier_country:   sup.supplierCountry,
        reliability_score:  pred.reliability_score,
        supplier_risk_tier: pred.supplier_risk_tier,
        delay_probability:  pred.delay_probability,
        composite_score:    Math.round(pred.reliability_score * 0.5 + (100 - pred.route_risk_score) * 0.5),
      };
    }));
    return results.sort((a, b) => b.composite_score - a.composite_score);
  }

  async estimateImpact(mlOutput, financials = {}) {
    const delay_days      = mlOutput.predicted_delay_days || 0;
    const risk_score      = mlOutput.route_risk_score || 0;
    const shortage_n      = mlOutput.shortage_risk_num || 0;
    const cargo_value     = financials.cargoValue || 5_000_000;
    const daily_revenue   = financials.dailyRevenue || 50_000;
    const penalty_per_day = financials.penaltyCostPerDay || 5_000;
    const revenue_loss    = daily_revenue * delay_days;
    const penalty_costs   = penalty_per_day * delay_days;
    const cargo_risk      = (mlOutput.delay_probability || 0) * cargo_value * 0.03;
    const shortage_cost   = shortage_n === 2 ? daily_revenue * 7 : shortage_n === 1 ? daily_revenue * 3 : 0;
    const total           = revenue_loss + penalty_costs + cargo_risk + shortage_cost;
    return {
      estimated_delay_days:   Math.round(delay_days * 10) / 10,
      revenue_loss:           Math.round(revenue_loss),
      penalty_costs:          Math.round(penalty_costs),
      cargo_risk_exposure:    Math.round(cargo_risk),
      shortage_impact:        Math.round(shortage_cost),
      total_estimated_impact: Math.round(total),
      impact_severity:        total > 500_000 ? 'Critical' : total > 100_000 ? 'High' : total > 20_000 ? 'Medium' : 'Low',
      risk_adjusted_impact:   Math.round(total * (risk_score / 100)),
    };
  }

  get metrics() { return pythonML.trainMetrics; }
}

module.exports = new MLPredictionAgent();
