/**
 * mlRegistry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton that:
 *   1. Generates 2 000 synthetic training samples on first load
 *   2. Trains all four models in sequence (fits shared FeaturePipeline once)
 *   3. Exposes a clean predict(shipment, context) API for use in coordinatorAgent
 *   4. Provides scenarioSimulate(shipment, shocks) for what-if analysis
 *   5. Provides recommendAlternatives(shipment, allShipments) for routing/supplier recs
 *   6. Provides estimateBusinessImpact(mlOutput, financials) for impact scoring
 *
 * Drop-in integration:  require('./ml/mlRegistry').then(...) or use sync after init.
 */

'use strict';

const { FeaturePipeline }                      = require('./featurePipeline');
const { DelayModel, ShortageModel, RouteRiskModel, SupplierModel } = require('./models');
const { generateTrainingData }                 = require('./trainingData');

// ─── Scenario shock definitions ───────────────────────────────────────────────
const SHOCK_PRESETS = {
  severe_weather:      { weather_risk_score: +30, label: 'Severe Weather Event' },
  port_strike:         { port_congestion_score: +40, label: 'Port Strike' },
  geopolitical_crisis: { geopolitical_risk_score: +35, label: 'Geopolitical Crisis' },
  supplier_failure:    { supplier_risk_score: +50, label: 'Supplier Failure' },
  demand_spike:        { demand_volatility: +0.3, stock_cover_days: -10, label: 'Demand Spike' },
  route_closure:       { geopolitical_risk_score: +40, port_congestion_score: +20, label: 'Route Closure' },
  pandemic:            { weather_risk_score: +15, port_congestion_score: +25, supplier_risk_score: +30, demand_volatility: +0.2, label: 'Pandemic Disruption' },
};

class MLRegistry {
  constructor() {
    this._ready   = false;
    this._promise = null;

    this.pipeline      = new FeaturePipeline();
    this.delayModel    = new DelayModel();
    this.shortageModel = new ShortageModel();
    this.routeModel    = new RouteRiskModel();
    this.supplierModel = new SupplierModel();
    this.trainMetrics  = {};
  }

  // ── Init / training ────────────────────────────────────────────────────────

  async init() {
    if (this._ready) return this;
    if (this._promise) return this._promise;

    this._promise = (async () => {
      console.log('\n  [MLRegistry] Generating training data...');
      const t0   = Date.now();
      const data = generateTrainingData(1000, 42);

      console.log('  [MLRegistry] Training delay model...');
      this.delayModel.pipeline = this.pipeline;
      const X = this.pipeline.fitTransform(data);
      // Manually wire all models to the same fitted pipeline
      this.delayModel.pipeline    = this.pipeline;
      this.shortageModel.pipeline = this.pipeline;
      this.routeModel.pipeline    = this.pipeline;
      this.supplierModel.pipeline = this.pipeline;

      // Fit classifiers on pre-transformed X for speed
      this._trainAll(data, X);

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      this.trainMetrics = {
        delay:    this.delayModel.metrics,
        shortage: this.shortageModel.metrics,
        route:    this.routeModel.metrics,
        supplier: this.supplierModel.metrics,
      };
      console.log(`  [MLRegistry] All models trained in ${elapsed}s`);
      console.log(`  [MLRegistry] Delay accuracy:   ${this.trainMetrics.delay.accuracy}`);
      console.log(`  [MLRegistry] Shortage accuracy: ${this.trainMetrics.shortage.accuracy}`);
      console.log(`  [MLRegistry] Route R²:          ${this.trainMetrics.route.r2}`);
      console.log(`  [MLRegistry] Supplier accuracy: ${this.trainMetrics.supplier.accuracy}`);

      this._ready = true;
      return this;
    })();

    return this._promise;
  }

  _trainAll(data, X) {
    const yDelay       = data.map(d => d.delayed);
    const yDelayDays   = data.map(d => d.predicted_delay_days);
    const yShortage    = data.map(d => d.shortage_risk_num);
    const yStockDays   = data.map(d => d.predicted_stock_cover_days);
    const yRouteRisk   = data.map(d => d.route_risk_score);
    const ySupplier    = data.map(d => d.supplier_reliability_label);

    const split = Math.floor(X.length * 0.8);
    const XTr   = X.slice(0, split), XTe = X.slice(split);

    // Delay classifier + regressor
    this.delayModel.classifier.fit(XTr, yDelay.slice(0, split));
    this.delayModel.regressor.fit(XTr, yDelayDays.slice(0, split));
    const delayPreds = this.delayModel.classifier.predict(XTe);
    const { accuracy, mae, confusionMatrix } = require('./mlPrimitives');
    this.delayModel.metrics = {
      accuracy: accuracy(yDelay.slice(split), delayPreds),
      delay_days_mae: mae(yDelayDays.slice(split), this.delayModel.regressor.predict(XTe)),
      confusion_matrix: confusionMatrix(yDelay.slice(split), delayPreds),
      test_size: XTe.length,
    };
    this.delayModel.trained = true;

    // Shortage classifier + regressor
    this.shortageModel.classifier.fit(XTr, yShortage.slice(0, split));
    this.shortageModel.regressor.fit(XTr, yStockDays.slice(0, split));
    const shortagePreds = this.shortageModel.classifier.predict(XTe);
    this.shortageModel.metrics = {
      accuracy: accuracy(yShortage.slice(split), shortagePreds),
      stock_cover_days_mae: mae(yStockDays.slice(split), this.shortageModel.regressor.predict(XTe)),
      test_size: XTe.length,
    };
    this.shortageModel.trained = true;

    // Route risk regressor
    this.routeModel.regressor.fit(XTr, yRouteRisk.slice(0, split));
    const routePreds = this.routeModel.regressor.predict(XTe);
    const { rmse, r2 } = require('./mlPrimitives');
    this.routeModel.metrics = {
      mae: mae(yRouteRisk.slice(split), routePreds),
      rmse: rmse(yRouteRisk.slice(split), routePreds),
      r2: r2(yRouteRisk.slice(split), routePreds),
      test_size: XTe.length,
    };
    this.routeModel.trained = true;

    // Supplier classifier
    this.supplierModel.classifier.fit(XTr, ySupplier.slice(0, split));
    const supplierPreds = this.supplierModel.classifier.predict(XTe);
    this.supplierModel.metrics = {
      accuracy: accuracy(ySupplier.slice(split), supplierPreds),
      test_size: XTe.length,
    };
    this.supplierModel.trained = true;
  }

  // ── Core prediction API ────────────────────────────────────────────────────

  /**
   * Full ML prediction for a single shipment.
   * @param {object} ship    - raw ship object from coordinatorAgent
   * @param {object} context - optional extra context: { stockCoverDays, demandVolatility, supplierRiskScore }
   * @returns {object} mlPrediction
   */
  predict(ship, context = {}) {
    if (!this._ready) throw new Error('MLRegistry not initialised. Await mlRegistry.init() first.');

    const feat = FeaturePipeline.fromShipment(ship, context);

    const delay    = this.delayModel.predict(feat);
    const shortage = this.shortageModel.predict(feat);
    const route    = this.routeModel.predict(feat);
    const supplier = this.supplierModel.predict(feat);

    // Blended risk score: combine ML route_risk_score with rule-based score (if provided)
    const mlRiskScore = route.route_risk_score;
    const blendedScore = context.ruleBasedScore !== undefined
      ? Math.round(0.6 * mlRiskScore + 0.4 * context.ruleBasedScore)
      : mlRiskScore;

    return {
      // ── Delay ────────────────────────────────────────────────────────────
      delay_probability:         delay.delay_probability,
      predicted_delay_days:      delay.predicted_delay_days,
      delayed:                   delay.delayed,

      // ── Shortage / inventory ─────────────────────────────────────────────
      shortage_risk:             shortage.shortage_risk,
      shortage_risk_num:         shortage.shortage_risk_num,
      predicted_stock_cover_days: shortage.predicted_stock_cover_days,
      shortage_probabilities:    shortage.shortage_probabilities,

      // ── Route ────────────────────────────────────────────────────────────
      route_risk_score:          route.route_risk_score,
      route_risk_label:          route.route_risk_label,

      // ── Supplier ─────────────────────────────────────────────────────────
      supplier_reliable:         supplier.supplier_reliable,
      reliability_score:         supplier.reliability_score,
      supplier_risk_tier:        supplier.supplier_risk_tier,

      // ── Blended overall ──────────────────────────────────────────────────
      ml_risk_score:             blendedScore,
      ml_risk_label:             blendedScore >= 70 ? 'High' : blendedScore >= 40 ? 'Medium' : 'Low',

      // ── Metadata ─────────────────────────────────────────────────────────
      feature_snapshot:          feat,
      model_version:             '2.0.0',
    };
  }

  // ── What-if scenario simulation ────────────────────────────────────────────

  /**
   * Simulate impact of a shock on a shipment.
   * @param {object} ship    - raw ship object
   * @param {string|object} shock - preset name or { weather_risk_score: +N, ... }
   * @param {object} context - existing context
   * @returns {{ baseline, shocked, delta, shockLabel }}
   */
  simulateScenario(ship, shock, context = {}) {
    const baseline = this.predict(ship, context);
    const shockDef  = typeof shock === 'string' ? (SHOCK_PRESETS[shock] || {}) : shock;
    const shockLabel = shockDef.label || (typeof shock === 'string' ? shock : 'Custom Shock');

    // Build shocked features by modifying the canonical feature object directly
    const baseFeatures    = FeaturePipeline.fromShipment(ship, context);
    const shockedFeatures = { ...baseFeatures };
    const numericKeys = ['weather_risk_score', 'geopolitical_risk_score', 'port_congestion_score',
                         'supplier_risk_score', 'demand_volatility', 'stock_cover_days'];
    for (const key of numericKeys) {
      if (shockDef[key] !== undefined) {
        shockedFeatures[key] = Math.max(0, (shockedFeatures[key] || 0) + shockDef[key]);
        if (key.endsWith('_score')) shockedFeatures[key] = Math.min(100, shockedFeatures[key]);
      }
    }

    // Transform shocked features and run inference directly
    const X = [this.pipeline.transformOne(shockedFeatures)];

    const delayProba = this.delayModel.classifier.predictProba(X)[0];
    const delayProb  = delayProba[1] ?? 0;
    const delayDays  = Math.max(0, Math.round(this.delayModel.regressor.predict(X)[0]));

    const shortageProba = this.shortageModel.classifier.predictProba(X)[0];
    const shortageNum   = this.shortageModel.classifier.predict(X)[0];
    const stockDays     = Math.max(0, Math.round(this.shortageModel.regressor.predict(X)[0]));
    const shortageLabels = { 0: 'Low', 1: 'Medium', 2: 'High' };

    const routeRaw   = this.routeModel.regressor.predict(X)[0];
    const routeScore = Math.max(0, Math.min(100, Math.round(routeRaw)));

    const supplierProba = this.supplierModel.classifier.predictProba(X)[0];
    const reliabilityScore = Math.round((supplierProba[1] || 0) * 100);

    const mlScore = context.ruleBasedScore !== undefined
      ? Math.round(0.6 * routeScore + 0.4 * context.ruleBasedScore)
      : routeScore;

    const shocked = {
      delay_probability:          +delayProb.toFixed(4),
      predicted_delay_days:       delayDays,
      delayed:                    delayProb >= 0.5 ? 1 : 0,
      shortage_risk:              shortageLabels[shortageNum] || 'Low',
      shortage_risk_num:          shortageNum,
      predicted_stock_cover_days: stockDays,
      shortage_probabilities:     { Low: +(shortageProba[0]||0).toFixed(3), Medium: +(shortageProba[1]||0).toFixed(3), High: +(shortageProba[2]||0).toFixed(3) },
      route_risk_score:           routeScore,
      route_risk_label:           routeScore >= 70 ? 'High' : routeScore >= 40 ? 'Medium' : 'Low',
      supplier_reliable:          reliabilityScore >= 50,
      reliability_score:          reliabilityScore,
      supplier_risk_tier:         reliabilityScore >= 75 ? 'Low' : reliabilityScore >= 50 ? 'Medium' : 'High',
      ml_risk_score:              mlScore,
      ml_risk_label:              mlScore >= 70 ? 'High' : mlScore >= 40 ? 'Medium' : 'Low',
    };

    const delta = {
      delay_probability:    +(shocked.delay_probability - baseline.delay_probability).toFixed(4),
      predicted_delay_days:  shocked.predicted_delay_days - baseline.predicted_delay_days,
      ml_risk_score:         shocked.ml_risk_score - baseline.ml_risk_score,
      route_risk_score:      shocked.route_risk_score - baseline.route_risk_score,
      shortage_risk_num:     shocked.shortage_risk_num - baseline.shortage_risk_num,
    };

    return { baseline, shocked, delta, shockLabel, shockApplied: shockDef };
  }

  /**
   * Run all preset scenarios for a shipment.
   */
  simulateAllScenarios(ship, context = {}) {
    return Object.keys(SHOCK_PRESETS).map(key => this.simulateScenario(ship, key, context));
  }

  // ── Recommendations ────────────────────────────────────────────────────────

  /**
   * Recommend alternate routes based on risk comparison.
   * Returns top 3 lowest-risk route alternatives.
   */
  recommendAlternateRoutes(ship, context = {}) {
    const ROUTES = ['Suez Canal', 'Cape of Good Hope', 'Trans-Pacific', 'Trans-Atlantic',
                    'Strait of Malacca', 'Panama Canal', 'Red Sea', 'Gulf of Aden', 'Mediterranean'];
    const currentRoute = ship.route || 'Unknown';

    const alternatives = ROUTES
      .filter(r => r !== currentRoute)
      .map(route => {
        const altShip = { ...ship, route };
        const pred    = this.predict(altShip, context);
        return {
          route,
          route_risk_score: pred.route_risk_score,
          route_risk_label: pred.route_risk_label,
          delay_probability: pred.delay_probability,
          estimated_extra_days: route === 'Cape of Good Hope' ? 10 : route.includes('Pacific') ? 5 : 2,
          recommendation_reason: this._routeRecommendReason(pred, route),
        };
      })
      .sort((a, b) => a.route_risk_score - b.route_risk_score)
      .slice(0, 3);

    const current = this.predict(ship, context);
    return {
      current_route:      currentRoute,
      current_risk_score: current.route_risk_score,
      current_risk_label: current.route_risk_label,
      alternatives,
    };
  }

  _routeRecommendReason(pred, route) {
    const reasons = [];
    if (pred.route_risk_score < 40)   reasons.push('Low overall route risk');
    if (pred.delay_probability < 0.3) reasons.push('Low delay probability');
    if (route === 'Cape of Good Hope') reasons.push('Avoids geopolitical chokepoints (+10 days)');
    if (route === 'Trans-Pacific')    reasons.push('Stable trans-ocean corridor');
    return reasons.join('; ') || 'Lower composite risk than current route';
  }

  /**
   * Score multiple suppliers and rank them.
   * @param {Array<{supplierId, supplierCountry, supplierRiskScore}>} suppliers
   * @param {object} baseShip - base shipment context
   */
  rankSuppliers(suppliers, baseShip, context = {}) {
    return suppliers
      .map(sup => {
        const altShip = { ...baseShip, supplierCountry: sup.supplierCountry };
        const altCtx  = { ...context, supplierRiskScore: sup.supplierRiskScore || 20 };
        const pred    = this.predict(altShip, altCtx);
        return {
          supplier_id:       sup.supplierId,
          supplier_country:  sup.supplierCountry,
          reliability_score: pred.reliability_score,
          supplier_risk_tier: pred.supplier_risk_tier,
          delay_probability: pred.delay_probability,
          composite_score:   Math.round((pred.reliability_score * 0.5) + ((100 - pred.route_risk_score) * 0.5)),
        };
      })
      .sort((a, b) => b.composite_score - a.composite_score);
  }

  // ── Business impact estimation ─────────────────────────────────────────────

  /**
   * Estimate financial impact from ML prediction.
   * @param {object} mlOutput - output of predict()
   * @param {object} financials - { cargoValue, dailyRevenue, penaltyCostPerDay }
   */
  estimateBusinessImpact(mlOutput, financials = {}) {
    const cargoValue        = financials.cargoValue || 5_000_000;
    const dailyRevenue      = financials.dailyRevenue || 50_000;
    const penaltyPerDay     = financials.penaltyCostPerDay || 5_000;

    const delayDays         = mlOutput.predicted_delay_days || 0;
    const riskScore         = mlOutput.ml_risk_score || 0;
    const shortageRiskNum   = mlOutput.shortage_risk_num || 0;

    // Revenue loss from delay
    const revenueLoss       = dailyRevenue * delayDays;

    // Penalty costs
    const penaltyCosts      = penaltyPerDay * delayDays;

    // Cargo risk: probability-weighted cargo exposure
    const cargoRisk         = mlOutput.delay_probability * cargoValue * 0.03;

    // Shortage impact: additional cost if shortage occurs
    const shortageCost      = shortageRiskNum === 2 ? dailyRevenue * 7  // High
                            : shortageRiskNum === 1 ? dailyRevenue * 3  // Medium
                            : 0;

    const total             = revenueLoss + penaltyCosts + cargoRisk + shortageCost;
    const severity          = total > 500_000 ? 'Critical' : total > 100_000 ? 'High' : total > 20_000 ? 'Medium' : 'Low';

    return {
      estimated_delay_days:    delayDays,
      revenue_loss:            Math.round(revenueLoss),
      penalty_costs:           Math.round(penaltyCosts),
      cargo_risk_exposure:     Math.round(cargoRisk),
      shortage_impact:         Math.round(shortageCost),
      total_estimated_impact:  Math.round(total),
      impact_severity:         severity,
      risk_adjusted_impact:    Math.round(total * (riskScore / 100)),
    };
  }

  // ── Batch scoring ──────────────────────────────────────────────────────────

  /**
   * Predict for all shipments in the pipeline batch.
   * @param {Array} ships - enriched ships from inventoryAgent
   */
  batchPredict(ships) {
    return ships.map(ship => {
      const context = {
        stockCoverDays:     (ship.cargoRisks || []).reduce((s, c) => s + c.stockCoverDays, 0) / Math.max((ship.cargoRisks || []).length, 1),
        demandVolatility:   0.2,
        supplierRiskScore:  20,
        ruleBasedScore:     ship.riskScore,  // blend with existing rule-based score
      };

      try {
        const ml = this.predict(ship, context);
        const impact = this.estimateBusinessImpact(ml, { cargoValue: ship.consignment?.totalValueUSD || 5_000_000 });
        return { ...ship, mlPrediction: ml, mlImpact: impact };
      } catch (err) {
        console.warn(`[MLRegistry] Prediction failed for ${ship.shipId}: ${err.message}`);
        return { ...ship, mlPrediction: null, mlImpact: null };
      }
    });
  }

  get shockPresets() { return SHOCK_PRESETS; }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
const registry = new MLRegistry();
module.exports = registry;
