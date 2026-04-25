"""
ml_server.py
Flask microservice exposing the Python ML models.
Listens on port 5001 (configurable via ML_PORT env var).
Called by Node.js backend via HTTP.

Endpoints:
  GET  /health                — liveness probe + model metrics
  POST /predict               — single shipment prediction
  POST /batch                 — batch predictions
  POST /train                 — (re)train and save models
"""

import os
import sys
import json
import traceback
from flask import Flask, request, jsonify

# Ensure local imports work when run as a subprocess
sys.path.insert(0, os.path.dirname(__file__))

from models import registry
from training_data import generate_training_data


app = Flask(__name__)


def _ensure_ready():
    if not registry._ready:
        registry.ensure_ready()


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get('/health')
def health():
    try:
        _ensure_ready()
        return jsonify({
            'status': 'ready',
            'model_version': '3.0.0-python',
            'metrics': registry.train_metrics,
        })
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ── Single predict ─────────────────────────────────────────────────────────────
@app.post('/predict')
def predict():
    try:
        body    = request.get_json(force=True)
        ship    = body.get('ship', {})
        context = body.get('context', {})
        if not ship:
            return jsonify({'success': False, 'error': 'ship object required'}), 400

        _ensure_ready()
        prediction = registry.predict(ship, context)
        impact     = _estimate_impact(prediction, body.get('financials', {}), ship)
        return jsonify({
            'success': True,
            'shipment_id': ship.get('shipId') or ship.get('name'),
            'prediction': prediction,
            'impact': impact,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Batch predict ──────────────────────────────────────────────────────────────
@app.post('/batch')
def batch():
    try:
        body  = request.get_json(force=True)
        ships = body.get('ships', [])
        if not ships:
            return jsonify({'success': False, 'error': 'ships array required'}), 400

        _ensure_ready()
        results = []
        for ship in ships:
            ctx = body.get('context', {})
            try:
                pred   = registry.predict(ship, ctx)
                impact = _estimate_impact(pred, {}, ship)
                results.append({'shipId': ship.get('shipId'), 'prediction': pred, 'impact': impact, 'error': None})
            except Exception as e:
                results.append({'shipId': ship.get('shipId'), 'prediction': None, 'impact': None, 'error': str(e)})

        return jsonify({'success': True, 'results': results, 'count': len(results)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500



# ── Train / retrain ────────────────────────────────────────────────────────────
@app.post('/train')
def train():
    try:
        body = request.get_json(force=True) or {}
        n    = body.get('n_samples', 2000)
        seed = body.get('seed', 42)
        print(f'[ML] Retraining with n={n}, seed={seed}')
        df = generate_training_data(n, seed)
        registry.train(df)
        registry.save()
        return jsonify({'success': True, 'metrics': registry.train_metrics})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Business impact helper ─────────────────────────────────────────────────────
def _estimate_impact(pred: dict, financials: dict, ship: dict) -> dict:
    cargo_value   = (ship.get('consignment') or {}).get('totalValueUSD', 5_000_000) or 5_000_000
    daily_revenue = financials.get('dailyRevenue', 50_000)
    penalty_per_d = financials.get('penaltyCostPerDay', 5_000)

    delay_days  = pred.get('predicted_delay_days', 0)
    risk_score  = pred.get('route_risk_score', 0)
    shortage_n  = pred.get('shortage_risk_num', 0)

    revenue_loss  = daily_revenue * delay_days
    penalty_costs = penalty_per_d * delay_days
    cargo_risk    = pred.get('delay_probability', 0) * cargo_value * 0.03
    shortage_cost = (daily_revenue * 7 if shortage_n == 2 else
                     daily_revenue * 3 if shortage_n == 1 else 0)
    total         = revenue_loss + penalty_costs + cargo_risk + shortage_cost
    severity      = ('Critical' if total > 500_000 else
                     'High'     if total > 100_000 else
                     'Medium'   if total > 20_000  else 'Low')

    return {
        'estimated_delay_days':   round(delay_days, 1),
        'revenue_loss':           round(revenue_loss),
        'penalty_costs':          round(penalty_costs),
        'cargo_risk_exposure':    round(cargo_risk),
        'shortage_impact':        round(shortage_cost),
        'total_estimated_impact': round(total),
        'impact_severity':        severity,
        'risk_adjusted_impact':   round(total * (risk_score / 100)),
    }


if __name__ == '__main__':
    port = int(os.environ.get('ML_PORT', 5001))
    print(f'[ML Server] Warming up models on port {port}...')
    registry.ensure_ready()
    print(f'[ML Server] Ready — listening on port {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
