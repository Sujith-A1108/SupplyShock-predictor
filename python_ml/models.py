"""
models.py
Four scikit-learn ML models for SupplyShock Predictor:

  1. DelayModel        — GradientBoosting classifier: delay_probability + predicted_delay_days
  2. ShortageModel     — RandomForest multi-class: shortage_risk (Low/Med/High) + stock_cover_days
  3. RouteRiskModel    — GradientBoosting regressor: route_risk_score (0-100)
  4. SupplierModel     — RandomForest classifier: supplier_reliability_label + reliability_score

Feature pipeline uses sklearn ColumnTransformer with OrdinalEncoder + StandardScaler.
"""

import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OrdinalEncoder, StandardScaler
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error, r2_score, confusion_matrix
from sklearn.model_selection import train_test_split
import joblib
import os

# ── Feature definitions ────────────────────────────────────────────────────────
CATEGORICAL_COLS = [
    'origin_country', 'destination_country',
    'port_of_origin', 'port_of_destination',
    'route', 'shipment_type', 'supplier_country', 'supplier_tier',
]
NUMERIC_COLS = [
    'volume', 'avg_delay_days_history', 'weather_risk_score',
    'geopolitical_risk_score', 'port_congestion_score', 'port_throughput',
    'stock_cover_days', 'demand_volatility', 'supplier_risk_score',
    'seasonal_congestion_mult',
]

HIGH_RISK_ROUTES  = {'Red Sea', 'Gulf of Aden', 'Suez Canal', 'Strait of Malacca', 'Black Sea', 'Persian Gulf'}
DIVERSION_ROUTES  = {'Red Sea', 'Gulf of Aden', 'Black Sea'}
CARGO_DELAY_MULTS = {
    'Perishable': 1.8, 'Hazardous': 1.4, 'Pharmaceuticals': 1.5, 'Electronics': 1.3,
    'Energy/Fuel': 1.2, 'Auto Parts': 1.1, 'Consumer Goods': 1.15,
    'Finished Goods': 1.1, 'Semi-finished': 1.0, 'Raw Material': 1.0,
}


def add_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived/engineered features to a DataFrame in place."""
    df = df.copy()
    df['is_high_risk_route']  = df['route'].isin(HIGH_RISK_ROUTES).astype(int)
    df['is_diversion_route']  = df['route'].isin(DIVERSION_ROUTES).astype(int)
    df['cargo_delay_mult']    = df['shipment_type'].map(CARGO_DELAY_MULTS).fillna(1.0)
    df['inbound_risk_composite'] = (
        df['weather_risk_score'] * 0.28
        + df['geopolitical_risk_score'] * 0.38
        + df['port_congestion_score'] * 0.22
        + df['supplier_risk_score'] * 0.12
    ) / 100
    df['stock_buffer_ratio'] = np.where(
        df['stock_cover_days'] > 0,
        np.minimum(df['avg_delay_days_history'] / df['stock_cover_days'].clip(lower=1), 3),
        3.0
    )
    return df


ALL_NUMERIC = NUMERIC_COLS + [
    'is_high_risk_route', 'is_diversion_route',
    'cargo_delay_mult', 'inbound_risk_composite', 'stock_buffer_ratio',
]


def build_preprocessor(df_train: pd.DataFrame):
    """Build a fitted ColumnTransformer."""
    ct = ColumnTransformer([
        ('cat', OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1), CATEGORICAL_COLS),
        ('num', StandardScaler(), ALL_NUMERIC),
    ])
    ct.fit(df_train)
    return ct


# ── Model 1: Delay ─────────────────────────────────────────────────────────────
class DelayModel:
    """Binary classifier (delayed 0/1) + regression head (delay_days)."""

    def __init__(self):
        self.classifier = GradientBoostingClassifier(
            n_estimators=120, learning_rate=0.10, max_depth=4,
            subsample=0.85, random_state=7,
        )
        self.regressor = GradientBoostingRegressor(
            n_estimators=100, learning_rate=0.10, max_depth=4,
            subsample=0.85, random_state=13,
        )
        self.metrics = {}

    def fit(self, X_train, y_class_train, y_reg_train, X_test, y_class_test, y_reg_test):
        self.classifier.fit(X_train, y_class_train)
        self.regressor.fit(X_train, y_reg_train)

        preds_class = self.classifier.predict(X_test)
        preds_reg   = self.regressor.predict(X_test)
        self.metrics = {
            'accuracy':     round(accuracy_score(y_class_test, preds_class), 4),
            'delay_mae':    round(mean_absolute_error(y_reg_test, preds_reg), 3),
            'confusion_matrix': confusion_matrix(y_class_test, preds_class).tolist(),
            'test_size':    len(X_test),
        }
        return self

    def predict_proba(self, X) -> np.ndarray:
        return self.classifier.predict_proba(X)[:, 1]

    def predict_days(self, X) -> np.ndarray:
        return np.maximum(self.regressor.predict(X), 0)


# ── Model 2: Shortage ──────────────────────────────────────────────────────────
class ShortageModel:
    """Multi-class RF: shortage_risk (0=Low,1=Medium,2=High) + stock_cover_days."""

    def __init__(self):
        self.classifier = RandomForestClassifier(
            n_estimators=150, max_depth=8, min_samples_split=5,
            class_weight='balanced', random_state=42, n_jobs=-1,
        )
        self.regressor = RandomForestRegressor(
            n_estimators=100, max_depth=7, random_state=17, n_jobs=-1,
        )
        self.classes_ = [0, 1, 2]
        self.metrics  = {}

    def fit(self, X_train, y_class_train, y_reg_train, X_test, y_class_test, y_reg_test):
        self.classifier.fit(X_train, y_class_train)
        self.regressor.fit(X_train, y_reg_train)
        self.classes_ = list(self.classifier.classes_)

        preds_class = self.classifier.predict(X_test)
        preds_reg   = self.regressor.predict(X_test)
        self.metrics = {
            'accuracy':          round(accuracy_score(y_class_test, preds_class), 4),
            'stock_cover_mae':   round(mean_absolute_error(y_reg_test, preds_reg), 3),
            'test_size':         len(X_test),
        }
        return self

    def predict_label(self, X):
        raw = self.classifier.predict(X)
        MAP = {0: 'Low', 1: 'Medium', 2: 'High'}
        return [MAP.get(int(r), 'Low') for r in raw]

    def predict_cover_days(self, X) -> np.ndarray:
        return np.maximum(self.regressor.predict(X), 0)


# ── Model 3: Route Risk ───────────────────────────────────────────────────────
class RouteRiskModel:
    """GBT regressor: route_risk_score (0-100)."""

    def __init__(self):
        self.model = GradientBoostingRegressor(
            n_estimators=120, learning_rate=0.10, max_depth=5,
            subsample=0.85, random_state=99,
        )
        self.metrics = {}

    def fit(self, X_train, y_train, X_test, y_test):
        self.model.fit(X_train, y_train)
        preds = self.model.predict(X_test)
        self.metrics = {
            'r2':   round(r2_score(y_test, preds), 4),
            'mae':  round(mean_absolute_error(y_test, preds), 3),
            'test_size': len(X_test),
        }
        return self

    def predict_score(self, X) -> np.ndarray:
        return np.clip(self.model.predict(X), 0, 100)


# ── Model 4: Supplier ─────────────────────────────────────────────────────────
class SupplierModel:
    """RF binary classifier: supplier_reliability_label (0/1)."""

    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=100, max_depth=6, random_state=55, n_jobs=-1,
        )
        self.metrics = {}

    def fit(self, X_train, y_train, X_test, y_test):
        self.model.fit(X_train, y_train)
        preds = self.model.predict(X_test)
        self.metrics = {
            'accuracy':  round(accuracy_score(y_test, preds), 4),
            'test_size': len(X_test),
        }
        return self

    def predict_reliability_score(self, X) -> np.ndarray:
        proba = self.model.predict_proba(X)[:, 1]
        return np.round(proba * 100, 1)


# ── MLRegistry — singleton trained container ──────────────────────────────────
class MLRegistry:
    MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models.joblib')

    def __init__(self):
        self.preprocessor  = None
        self.delay_model   = DelayModel()
        self.shortage_model = ShortageModel()
        self.route_model   = RouteRiskModel()
        self.supplier_model = SupplierModel()
        self.train_metrics = {}
        self._ready        = False

    def train(self, df: pd.DataFrame):
        print('[MLRegistry] Adding derived features...')
        df = add_derived_features(df)

        X_cols = CATEGORICAL_COLS + ALL_NUMERIC
        X_raw = df[X_cols]

        print('[MLRegistry] Building preprocessor...')
        self.preprocessor = build_preprocessor(X_raw)
        X = self.preprocessor.transform(X_raw)

        # Train/test split
        idx = int(len(df) * 0.8)
        X_tr, X_te = X[:idx], X[idx:]

        # Labels
        y_delay_cls  = df['delayed'].values
        y_delay_days = df['predicted_delay_days'].values
        y_shortage   = df['shortage_risk_num'].values
        y_stock      = df['predicted_stock_cover_days'].values
        y_route      = df['route_risk_score'].values
        y_supplier   = df['supplier_reliability_label'].values

        print('[MLRegistry] Training DelayModel (GBT)...')
        self.delay_model.fit(X_tr, y_delay_cls[:idx], y_delay_days[:idx],
                             X_te, y_delay_cls[idx:], y_delay_days[idx:])
        print(f'  Delay accuracy:  {self.delay_model.metrics["accuracy"]}')

        print('[MLRegistry] Training ShortageModel (RF)...')
        self.shortage_model.fit(X_tr, y_shortage[:idx], y_stock[:idx],
                                X_te, y_shortage[idx:], y_stock[idx:])
        print(f'  Shortage accuracy: {self.shortage_model.metrics["accuracy"]}')

        print('[MLRegistry] Training RouteRiskModel (GBT)...')
        self.route_model.fit(X_tr, y_route[:idx], X_te, y_route[idx:])
        print(f'  Route Risk R²:  {self.route_model.metrics["r2"]}')

        print('[MLRegistry] Training SupplierModel (RF)...')
        self.supplier_model.fit(X_tr, y_supplier[:idx], X_te, y_supplier[idx:])
        print(f'  Supplier accuracy: {self.supplier_model.metrics["accuracy"]}')

        self.train_metrics = {
            'delay':    self.delay_model.metrics,
            'shortage': self.shortage_model.metrics,
            'route':    self.route_model.metrics,
            'supplier': self.supplier_model.metrics,
        }
        self._ready = True
        return self

    def save(self):
        joblib.dump({
            'preprocessor':   self.preprocessor,
            'delay_model':    self.delay_model,
            'shortage_model': self.shortage_model,
            'route_model':    self.route_model,
            'supplier_model': self.supplier_model,
            'train_metrics':  self.train_metrics,
        }, self.MODEL_PATH)
        print(f'[MLRegistry] Models saved to {self.MODEL_PATH}')

    def load(self):
        data = joblib.load(self.MODEL_PATH)
        self.preprocessor   = data['preprocessor']
        self.delay_model    = data['delay_model']
        self.shortage_model = data['shortage_model']
        self.route_model    = data['route_model']
        self.supplier_model = data['supplier_model']
        self.train_metrics  = data['train_metrics']
        self._ready = True
        print('[MLRegistry] Models loaded from disk.')
        return self

    def ensure_ready(self):
        if self._ready:
            return
        if os.path.exists(self.MODEL_PATH):
            self.load()
        else:
            from training_data import generate_training_data
            print('[MLRegistry] Training from scratch...')
            df = generate_training_data(2000, seed=42)
            self.train(df)
            self.save()

    def _df_from_shipment(self, ship: dict, context: dict) -> pd.DataFrame:
        """Convert a raw shipment dict + context into a feature DataFrame row."""
        from datetime import datetime

        weather_map = {'High': 75, 'Medium': 45, 'Low': 15}
        congestion_map = {'High': 80, 'Medium': 50, 'Low': 20}

        weather_risk   = weather_map.get(ship.get('weatherData', {}).get('riskLevel', 'Low'), 15)
        geo_risk       = ship.get('geoData', {}).get('riskScore', 0)
        if not geo_risk:
            geo_risk = {'High': 80, 'Medium': 50, 'Low': 15}.get(
                ship.get('geoData', {}).get('severity', 'Low'), 15)
        port_cong      = ship.get('portData', {}).get('riskScore', 0)
        if not port_cong:
            port_cong = congestion_map.get(ship.get('portData', {}).get('congestionLevel', 'Low'), 20)
        port_throughput = ship.get('portData', {}).get('throughput', 5000) or 5000

        sup_risk    = context.get('supplierRiskScore', 20)
        stock_cover = context.get('stockCoverDays', 20)
        demand_vol  = context.get('demandVolatility', 0.2)
        month       = datetime.now().month - 1
        season_mult = [1.2,1.4,1.0,0.9,0.85,0.8,0.85,0.9,1.0,1.1,1.3,1.4][month]

        sup_tier = 'Tier-1' if sup_risk < 25 else ('Tier-2' if sup_risk < 55 else 'Tier-3')
        cargo_list = ship.get('cargo', ['Finished Goods'])
        cargo_type = cargo_list[0] if cargo_list else 'Finished Goods'

        row = {
            'origin_country':        ship.get('origin', 'Unknown'),
            'destination_country':   ship.get('destination', 'Unknown'),
            'port_of_origin':        ship.get('portOfOrigin', ship.get('origin', 'Unknown')),
            'port_of_destination':   ship.get('portData', {}).get('name', ship.get('destination', 'Unknown')) or 'Unknown',
            'route':                 ship.get('route', 'Unknown'),
            'volume':                ship.get('consignment', {}).get('totalWeightMT', 200) or 200,
            'shipment_type':         cargo_type,
            'supplier_country':      ship.get('supplierCountry', ship.get('origin', 'Unknown')),
            'supplier_tier':         sup_tier,
            'avg_delay_days_history': ship.get('delayDays', 0) or 0,
            'weather_risk_score':    weather_risk,
            'geopolitical_risk_score': geo_risk,
            'port_congestion_score': port_cong,
            'port_throughput':       port_throughput,
            'stock_cover_days':      stock_cover,
            'demand_volatility':     demand_vol,
            'supplier_risk_score':   sup_risk,
            'seasonal_congestion_mult': season_mult,
        }
        df = pd.DataFrame([row])
        return add_derived_features(df)

    def predict(self, ship: dict, context: dict = {}) -> dict:
        self.ensure_ready()
        df    = self._df_from_shipment(ship, context)
        X_raw = df[CATEGORICAL_COLS + ALL_NUMERIC]
        X     = self.preprocessor.transform(X_raw)

        delay_prob  = float(self.delay_model.predict_proba(X)[0])
        delay_days  = float(self.delay_model.predict_days(X)[0])
        delayed     = int(delay_prob >= 0.5)

        shortage_label  = self.shortage_model.predict_label(X)[0]
        stock_cover_days = float(self.shortage_model.predict_cover_days(X)[0])
        shortage_num     = {'Low': 0, 'Medium': 1, 'High': 2}.get(shortage_label, 0)

        route_risk  = float(self.route_model.predict_score(X)[0])
        rel_score   = float(self.supplier_model.predict_reliability_score(X)[0])

        risk_label  = 'High' if route_risk >= 70 else ('Medium' if route_risk >= 40 else 'Low')
        sup_tier    = 'High' if rel_score < 40 else ('Medium' if rel_score < 70 else 'Low')

        return {
            'delay_probability':          round(delay_prob, 4),
            'delayed':                    delayed,
            'predicted_delay_days':       round(delay_days, 1),
            'shortage_risk':              shortage_label,
            'shortage_risk_num':          shortage_num,
            'predicted_stock_cover_days': round(stock_cover_days, 1),
            'route_risk_score':           round(route_risk, 1),
            'ml_risk_score':              round(route_risk, 1),
            'ml_risk_label':              risk_label,
            'reliability_score':          round(rel_score, 1),
            'supplier_risk_tier':         sup_tier,
        }

    def batch_predict(self, ships: list, contexts: list = None) -> list:
        self.ensure_ready()
        if contexts is None:
            contexts = [{} for _ in ships]
        return [self.predict(s, c) for s, c in zip(ships, contexts)]


# Singleton
registry = MLRegistry()
