/**
 * models.js
 * Four trained ML models for SupplyShock Predictor:
 *
 *  1. DelayModel        — GBT classifier: delay_probability + predicted_delay_days
 *  2. ShortageModel     — RF multi-class: shortage_risk (Low/Med/High) + stock_cover_days
 *  3. RouteRiskModel    — GBT regressor: route_risk_score (0–100)
 *  4. SupplierModel     — RF classifier: supplier_reliability (0/1) + reliability_score
 */

'use strict';

const { RandomForest, GradientBoostedTrees, accuracy, mae, rmse, r2, confusionMatrix, mean } = require('./mlPrimitives');
const { FeaturePipeline } = require('./featurePipeline');
const { generateTrainingData } = require('./trainingData');

// ─── Shared feature pipeline (fitted once) ────────────────────────────────────
let _pipeline = null;
let _trainData = null;

function getPipeline() {
  if (_pipeline) return _pipeline;
  _pipeline = new FeaturePipeline();
  return _pipeline;
}

function getTrainData() {
  if (_trainData) return _trainData;
  _trainData = generateTrainingData(1000, 42);
  return _trainData;
}

// ─── 1. Delay Model ───────────────────────────────────────────────────────────
/**
 * Binary classification: delayed (0/1)
 * Regression head:       predicted_delay_days (continuous)
 *
 * Uses GradientBoostedTrees for the classifier and a RandomForest regressor
 * for the delay-days head (multi-task via separate models).
 */
class DelayModel {
  constructor() {
    this.classifier = new GradientBoostedTrees({ nEstimators: 25, learningRate: 0.12, maxDepth: 4, task: 'classification', seed: 7 });
    this.regressor  = new RandomForest({ nTrees: 20, maxDepth: 5, task: 'regression', seed: 13 });
    this.pipeline   = null;
    this.trained    = false;
    this.metrics    = {};
  }

  train(data, pipeline) {
    this.pipeline = pipeline;
    const X = pipeline.fitTransform(data);
    const yClass = data.map(d => d.delayed);
    const yReg   = data.map(d => d.predicted_delay_days);

    // Train-test split (80/20)
    const split = Math.floor(X.length * 0.8);
    const XTr = X.slice(0, split),  XTe = X.slice(split);
    const yCTr = yClass.slice(0, split), yCTe = yClass.slice(split);
    const yRTr = yReg.slice(0, split),   yRTe = yReg.slice(split);

    this.classifier.fit(XTr, yCTr);
    this.regressor.fit(XTr, yRTr);

    // Eval
    const predClass = this.classifier.predict(XTe);
    const predReg   = this.regressor.predict(XTe);
    const acc = accuracy(yCTe, predClass);
    const maeV = mae(yRTe, predReg);

    this.metrics = {
      accuracy: acc,
      delay_days_mae: maeV,
      confusion_matrix: confusionMatrix(yCTe, predClass),
      test_size: XTe.length,
    };
    this.trained = true;
    console.log(`[DelayModel] trained — accuracy: ${acc} | delay MAE: ${maeV}`);
    return this;
  }

  /**
   * @param {object} featureObj - canonical feature object
   * @returns {{ delay_probability, predicted_delay_days, delayed }}
   */
  predict(featureObj) {
    if (!this.trained) throw new Error('DelayModel not trained');
    const X    = [this.pipeline.transformOne(featureObj)];
    const prob = this.classifier.predictProba(X)[0];
    const delayProb = prob[1] ?? 0;
    const delayDays = Math.max(0, Math.round(this.regressor.predict(X)[0]));
    return {
      delay_probability:     +delayProb.toFixed(4),
      predicted_delay_days:  delayDays,
      delayed:               delayProb >= 0.5 ? 1 : 0,
    };
  }
}

// ─── 2. Shortage Model ────────────────────────────────────────────────────────
/**
 * Multi-class classification: shortage_risk_num (0=Low, 1=Med, 2=High)
 * Regression head: predicted_stock_cover_days
 */
class ShortageModel {
  constructor() {
    this.classifier = new RandomForest({ nTrees: 20, maxDepth: 5, task: 'classification', seed: 17 });
    this.regressor  = new RandomForest({ nTrees: 20, maxDepth: 5, task: 'regression', seed: 23 });
    this.pipeline   = null;
    this.trained    = false;
    this.metrics    = {};
  }

  // Shortage uses a specialized feature set with heavy inventory weighting
  _buildShortageFeatures(data, pipeline) {
    // Use the shared pipeline (already fitted on full feature set)
    return pipeline.transform ? pipeline.transform(data) : pipeline.fitTransform(data);
  }

  train(data, pipeline) {
    this.pipeline = pipeline;
    // Ensure pipeline is fitted (delay model fits it first; shortage model reuses)
    let X;
    try { X = pipeline.transform(data); }
    catch { X = pipeline.fitTransform(data); }

    const yClass = data.map(d => d.shortage_risk_num);
    const yReg   = data.map(d => d.predicted_stock_cover_days);

    const split  = Math.floor(X.length * 0.8);
    const XTr    = X.slice(0, split), XTe = X.slice(split);
    const yCTr   = yClass.slice(0, split), yCTe = yClass.slice(split);
    const yRTr   = yReg.slice(0, split),   yRTe = yReg.slice(split);

    this.classifier.fit(XTr, yCTr);
    this.regressor.fit(XTr, yRTr);

    const predClass = this.classifier.predict(XTe);
    const predReg   = this.regressor.predict(XTe);

    this.metrics = {
      accuracy:               accuracy(yCTe, predClass),
      stock_cover_days_mae:   mae(yRTe, predReg),
      test_size:              XTe.length,
    };
    this.trained = true;
    console.log(`[ShortageModel] trained — accuracy: ${this.metrics.accuracy} | stock-cover MAE: ${this.metrics.stock_cover_days_mae}`);
    return this;
  }

  predict(featureObj) {
    if (!this.trained) throw new Error('ShortageModel not trained');
    const X    = [this.pipeline.transformOne(featureObj)];
    const proba  = this.classifier.predictProba(X)[0];
    const numLabel = this.classifier.predict(X)[0];
    const labelMap = { 0: 'Low', 1: 'Medium', 2: 'High' };
    const stockDays = Math.max(0, Math.round(this.regressor.predict(X)[0]));

    return {
      shortage_risk:               labelMap[numLabel] || 'Low',
      shortage_risk_num:           numLabel,
      predicted_stock_cover_days:  stockDays,
      shortage_probabilities: {
        Low:    +(proba[0] || 0).toFixed(3),
        Medium: +(proba[1] || 0).toFixed(3),
        High:   +(proba[2] || 0).toFixed(3),
      },
    };
  }
}

// ─── 3. Route Risk Model ──────────────────────────────────────────────────────
/**
 * Regression: route_risk_score (0–100)
 * Outputs a 0-100 score replacing/augmenting the weighted formula in riskCalculator.js
 */
class RouteRiskModel {
  constructor() {
    this.regressor = new GradientBoostedTrees({ nEstimators: 25, learningRate: 0.12, maxDepth: 4, task: 'regression', seed: 31 });
    this.pipeline  = null;
    this.trained   = false;
    this.metrics   = {};
  }

  train(data, pipeline) {
    this.pipeline = pipeline;
    let X;
    try { X = pipeline.transform(data); }
    catch { X = pipeline.fitTransform(data); }

    const y     = data.map(d => d.route_risk_score);
    const split = Math.floor(X.length * 0.8);
    const XTr   = X.slice(0, split), XTe = X.slice(split);
    const yTr   = y.slice(0, split), yTe = y.slice(split);

    this.regressor.fit(XTr, yTr);

    const preds = this.regressor.predict(XTe);
    this.metrics = { mae: mae(yTe, preds), rmse: rmse(yTe, preds), r2: r2(yTe, preds), test_size: XTe.length };
    this.trained = true;
    console.log(`[RouteRiskModel] trained — MAE: ${this.metrics.mae} | R²: ${this.metrics.r2}`);
    return this;
  }

  predict(featureObj) {
    if (!this.trained) throw new Error('RouteRiskModel not trained');
    const X    = [this.pipeline.transformOne(featureObj)];
    const raw  = this.regressor.predict(X)[0];
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    return {
      route_risk_score: score,
      route_risk_label: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low',
    };
  }
}

// ─── 4. Supplier Model ────────────────────────────────────────────────────────
/**
 * Binary classification: supplier_reliability_label (0/1)
 * Outputs a reliability_score (0-100) and risk tier
 */
class SupplierModel {
  constructor() {
    this.classifier = new RandomForest({ nTrees: 20, maxDepth: 5, task: 'classification', seed: 41 });
    this.pipeline   = null;
    this.trained    = false;
    this.metrics    = {};
  }

  train(data, pipeline) {
    this.pipeline = pipeline;
    let X;
    try { X = pipeline.transform(data); }
    catch { X = pipeline.fitTransform(data); }

    const y     = data.map(d => d.supplier_reliability_label);
    const split = Math.floor(X.length * 0.8);
    const XTr   = X.slice(0, split), XTe = X.slice(split);
    const yTr   = y.slice(0, split), yTe = y.slice(split);

    this.classifier.fit(XTr, yTr);

    const preds = this.classifier.predict(XTe);
    this.metrics = { accuracy: accuracy(yTe, preds), test_size: XTe.length };
    this.trained = true;
    console.log(`[SupplierModel] trained — accuracy: ${this.metrics.accuracy}`);
    return this;
  }

  predict(featureObj) {
    if (!this.trained) throw new Error('SupplierModel not trained');
    const X    = [this.pipeline.transformOne(featureObj)];
    const proba  = this.classifier.predictProba(X)[0];
    const label  = this.classifier.predict(X)[0];
    const reliabilityScore = Math.round((proba[1] || 0) * 100);
    return {
      supplier_reliable:    label === 1,
      reliability_score:    reliabilityScore,
      supplier_risk_tier:   reliabilityScore >= 75 ? 'Low' : reliabilityScore >= 50 ? 'Medium' : 'High',
      reliability_proba:    { reliable: +(proba[1] || 0).toFixed(3), unreliable: +(proba[0] || 0).toFixed(3) },
    };
  }
}

module.exports = { DelayModel, ShortageModel, RouteRiskModel, SupplierModel };
