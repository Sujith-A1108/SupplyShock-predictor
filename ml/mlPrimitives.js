/**
 * mlPrimitives.js
 * Pure-JS implementation of:
 *   - Label encoder  (categorical → integer)
 *   - Min-max scaler
 *   - Decision tree  (CART, Gini / MSE)
 *   - Random forest  (bagging + feature subsampling)
 *   - Gradient boosted trees (regression + classification head)
 */

'use strict';

// ─── Label Encoder ────────────────────────────────────────────────────────────
class LabelEncoder {
  constructor() { this.map = {}; this.reverseMap = {}; }

  fit(values) {
    const unique = [...new Set(values)].sort();
    unique.forEach((v, i) => { this.map[v] = i; this.reverseMap[i] = v; });
    return this;
  }

  transform(values) { return values.map(v => this.map[v] !== undefined ? this.map[v] : -1); }
  fitTransform(values) { return this.fit(values).transform(values); }
  inverse(codes)   { return codes.map(c => this.reverseMap[c] ?? null); }
}

// ─── Min-Max Scaler ───────────────────────────────────────────────────────────
class MinMaxScaler {
  constructor() { this.min = []; this.max = []; this.range = []; }

  fit(matrix) {
    const cols = matrix[0].length;
    for (let c = 0; c < cols; c++) {
      const col = matrix.map(r => r[c]);
      this.min[c]   = Math.min(...col);
      this.max[c]   = Math.max(...col);
      this.range[c] = this.max[c] - this.min[c] || 1;
    }
    return this;
  }

  transform(matrix) {
    return matrix.map(row => row.map((v, c) => (v - this.min[c]) / this.range[c]));
  }

  fitTransform(matrix) { return this.fit(matrix).transform(matrix); }
}

// ─── CART Decision Tree ───────────────────────────────────────────────────────
function gini(labels) {
  const n = labels.length;
  if (n === 0) return 0;
  const counts = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  let g = 1;
  for (const c of Object.values(counts)) g -= (c / n) ** 2;
  return g;
}

function mse(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }

function majorityClass(labels) {
  const counts = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  return +Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

class DecisionTree {
  constructor({ maxDepth = 8, minSamplesSplit = 5, task = 'classification', features = null } = {}) {
    this.maxDepth       = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.task           = task; // 'classification' | 'regression'
    this.features       = features; // subset of feature indices to consider
    this.root           = null;
  }

  _impurity(labels) { return this.task === 'regression' ? mse(labels) : gini(labels); }

  _bestSplit(X, y, featureIndices) {
    let bestGain = -Infinity, bestFeat = null, bestThreshold = null;
    const parentImp = this._impurity(y);
    const n = y.length;

    for (const fi of featureIndices) {
      // Collect unique candidate thresholds (midpoints between sorted unique values)
      const vals = [...new Set(X.map(r => r[fi]))].sort((a, b) => a - b);
      for (let k = 0; k < vals.length - 1; k++) {
        const threshold = (vals[k] + vals[k + 1]) / 2;
        const leftIdx   = [];
        const rightIdx  = [];
        for (let i = 0; i < n; i++) {
          (X[i][fi] <= threshold ? leftIdx : rightIdx).push(i);
        }
        if (leftIdx.length === 0 || rightIdx.length === 0) continue;
        const leftY  = leftIdx.map(i => y[i]);
        const rightY = rightIdx.map(i => y[i]);
        const gain = parentImp
          - (leftY.length  / n) * this._impurity(leftY)
          - (rightY.length / n) * this._impurity(rightY);
        if (gain > bestGain) { bestGain = gain; bestFeat = fi; bestThreshold = threshold; }
      }
    }
    return { bestFeat, bestThreshold, bestGain };
  }

  _build(X, y, depth) {
    if (depth >= this.maxDepth || y.length < this.minSamplesSplit || new Set(y).size === 1) {
      return { leaf: true, value: this.task === 'regression' ? mean(y) : majorityClass(y), proba: this._classProba(y) };
    }

    const nFeats    = X[0].length;
    const featureIndices = this.features
      ? this.features
      : Array.from({ length: nFeats }, (_, i) => i);

    const { bestFeat, bestThreshold, bestGain } = this._bestSplit(X, y, featureIndices);

    if (bestFeat === null || bestGain <= 1e-7) {
      return { leaf: true, value: this.task === 'regression' ? mean(y) : majorityClass(y), proba: this._classProba(y) };
    }

    const leftIdx  = [];
    const rightIdx = [];
    for (let i = 0; i < X.length; i++) {
      (X[i][bestFeat] <= bestThreshold ? leftIdx : rightIdx).push(i);
    }

    return {
      leaf: false,
      feat: bestFeat,
      threshold: bestThreshold,
      left:  this._build(leftIdx.map(i => X[i]),  leftIdx.map(i => y[i]),  depth + 1),
      right: this._build(rightIdx.map(i => X[i]), rightIdx.map(i => y[i]), depth + 1),
    };
  }

  _classProba(y) {
    const counts = {};
    for (const l of y) counts[l] = (counts[l] || 0) + 1;
    const n = y.length || 1;
    const proba = {};
    for (const [k, v] of Object.entries(counts)) proba[k] = v / n;
    return proba;
  }

  fit(X, y) { this.root = this._build(X, y, 0); return this; }

  _predict1(node, x) {
    if (node.leaf) return node;
    return x[node.feat] <= node.threshold ? this._predict1(node.left, x) : this._predict1(node.right, x);
  }

  predict(X) { return X.map(x => this._predict1(this.root, x).value); }
  predictProba(X) { return X.map(x => this._predict1(this.root, x).proba || {}); }
}

// ─── Random Forest ────────────────────────────────────────────────────────────
function bootstrapSample(X, y, rng) {
  const n = X.length;
  const idx = Array.from({ length: n }, () => Math.floor(rng() * n));
  return { X: idx.map(i => X[i]), y: idx.map(i => y[i]) };
}

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >> 7))  >>> 0;
    s = (s ^ (s << 17)) >>> 0;
    return (s >>> 0) / 4294967296;
  };
}

function featureSubset(nFeats, k, rng) {
  const indices = Array.from({ length: nFeats }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, k);
}

class RandomForest {
  constructor({ nTrees = 50, maxDepth = 8, minSamplesSplit = 5, task = 'classification', seed = 42 } = {}) {
    this.nTrees          = nTrees;
    this.maxDepth        = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.task            = task;
    this.seed            = seed;
    this.trees           = [];
  }

  fit(X, y) {
    const rng   = seededRng(this.seed);
    const nFeats = X[0].length;
    const k      = Math.max(1, Math.round(Math.sqrt(nFeats)));

    this.trees = [];
    for (let t = 0; t < this.nTrees; t++) {
      const { X: bX, y: bY } = bootstrapSample(X, y, rng);
      const features = featureSubset(nFeats, k, rng);
      const tree = new DecisionTree({ maxDepth: this.maxDepth, minSamplesSplit: this.minSamplesSplit, task: this.task, features });
      tree.fit(bX, bY);
      this.trees.push(tree);
    }
    return this;
  }

  predict(X) {
    if (this.task === 'regression') {
      const preds = this.trees.map(t => t.predict(X));
      return X.map((_, i) => mean(preds.map(p => p[i])));
    }
    // classification: majority vote
    const preds = this.trees.map(t => t.predict(X));
    return X.map((_, i) => {
      const votes = {};
      for (const p of preds) votes[p[i]] = (votes[p[i]] || 0) + 1;
      return +Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    });
  }

  predictProba(X) {
    // Average class probabilities across trees
    const allProba = this.trees.map(t => t.predictProba(X));
    return X.map((_, i) => {
      const combined = {};
      for (const proba of allProba) {
        for (const [cls, p] of Object.entries(proba[i])) {
          combined[cls] = (combined[cls] || 0) + p;
        }
      }
      const n = this.trees.length;
      const norm = {};
      for (const [k, v] of Object.entries(combined)) norm[k] = v / n;
      return norm;
    });
  }
}

// ─── Gradient Boosted Trees (regression + classification) ─────────────────────
class GradientBoostedTrees {
  constructor({ nEstimators = 60, learningRate = 0.12, maxDepth = 5, task = 'regression', seed = 42 } = {}) {
    this.nEstimators  = nEstimators;
    this.learningRate = learningRate;
    this.maxDepth     = maxDepth;
    this.task         = task;
    this.seed         = seed;
    this.trees        = [];
    this.initValue    = 0;
  }

  _sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x)))); }

  fit(X, y) {
    // Initial prediction: mean (regression) or log-odds (classification)
    if (this.task === 'regression') {
      this.initValue = mean(y);
    } else {
      const pos = y.filter(v => v === 1).length;
      const neg = y.length - pos;
      this.initValue = Math.log((pos + 1) / (neg + 1));
    }

    let F = new Array(y.length).fill(this.initValue);
    const rng = seededRng(this.seed);

    for (let m = 0; m < this.nEstimators; m++) {
      // Compute pseudo-residuals
      let residuals;
      if (this.task === 'regression') {
        residuals = y.map((yi, i) => yi - F[i]);
      } else {
        residuals = y.map((yi, i) => yi - this._sigmoid(F[i]));
      }

      // Subsample rows (stochastic GBT)
      const subsampleRate = 0.8;
      const n = X.length;
      const idx = [];
      for (let i = 0; i < n; i++) { if (rng() < subsampleRate) idx.push(i); }
      const subX = idx.map(i => X[i]);
      const subR = idx.map(i => residuals[i]);

      const tree = new DecisionTree({ maxDepth: this.maxDepth, minSamplesSplit: 5, task: 'regression' });
      tree.fit(subX, subR);

      const updates = tree.predict(X);
      F = F.map((f, i) => f + this.learningRate * updates[i]);
      this.trees.push(tree);
    }
    this._F_train = F;
    return this;
  }

  _scoreRaw(X) {
    let F = new Array(X.length).fill(this.initValue);
    for (const tree of this.trees) {
      const updates = tree.predict(X);
      F = F.map((f, i) => f + this.learningRate * updates[i]);
    }
    return F;
  }

  predict(X) {
    const raw = this._scoreRaw(X);
    if (this.task === 'regression') return raw;
    return raw.map(v => this._sigmoid(v) >= 0.5 ? 1 : 0);
  }

  predictProba(X) {
    const raw = this._scoreRaw(X);
    return raw.map(v => {
      const p = this._sigmoid(v);
      return { 0: +(1 - p).toFixed(4), 1: +p.toFixed(4) };
    });
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
function accuracy(yTrue, yPred) {
  const correct = yTrue.filter((y, i) => y === yPred[i]).length;
  return +(correct / yTrue.length).toFixed(4);
}

function mae(yTrue, yPred) {
  return +(yTrue.reduce((s, y, i) => s + Math.abs(y - yPred[i]), 0) / yTrue.length).toFixed(4);
}

function rmse(yTrue, yPred) {
  return +(Math.sqrt(yTrue.reduce((s, y, i) => s + (y - yPred[i]) ** 2, 0) / yTrue.length)).toFixed(4);
}

function r2(yTrue, yPred) {
  const m = mean(yTrue);
  const ssTot = yTrue.reduce((s, y) => s + (y - m) ** 2, 0);
  const ssRes = yTrue.reduce((s, y, i) => s + (y - yPred[i]) ** 2, 0);
  return +(1 - ssRes / ssTot).toFixed(4);
}

function confusionMatrix(yTrue, yPred, classes = [0, 1]) {
  const matrix = {};
  for (const a of classes) { matrix[a] = {}; for (const b of classes) matrix[a][b] = 0; }
  for (let i = 0; i < yTrue.length; i++) {
    const t = yTrue[i], p = yPred[i];
    if (matrix[t] !== undefined && matrix[t][p] !== undefined) matrix[t][p]++;
  }
  return matrix;
}

module.exports = { LabelEncoder, MinMaxScaler, DecisionTree, RandomForest, GradientBoostedTrees, accuracy, mae, rmse, r2, confusionMatrix, seededRng, mean };
