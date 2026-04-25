"""
training_data.py
Maritime research-calibrated synthetic training data generator.
Mirrors the logic in ml/trainingData.js but uses numpy for speed.
"""

import numpy as np
import pandas as pd

ORIGIN_COUNTRIES = [
    'China', 'India', 'Germany', 'USA', 'Japan', 'South Korea',
    'Brazil', 'UAE', 'Turkey', 'Malaysia', 'Vietnam', 'Bangladesh',
    'Italy', 'Netherlands',
]
DEST_COUNTRIES = [
    'India', 'USA', 'Germany', 'UK', 'France', 'Japan', 'Australia',
    'Canada', 'Netherlands', 'Singapore', 'Saudi Arabia', 'South Korea',
    'Brazil', 'Spain',
]

PORT_BASELINES = {
    'Shanghai': 68, 'Shenzhen': 62, 'Ningbo': 58, 'Port Klang': 52, 'Busan': 45,
    'Rotterdam': 35, 'Hamburg': 38, 'Antwerp': 40, 'Felixstowe': 55, 'Le Havre': 42,
    'Los Angeles': 72, 'Long Beach': 70, 'New York': 60, 'Houston': 48,
    'Nhava Sheva': 65, 'Chennai': 58, 'Kolkata': 70, 'Mundra': 50,
    'Dubai': 40, 'Jebel Ali': 38, 'Bandar Abbas': 80, 'Chabahar': 72,
    'Novorossiysk': 65, 'Saint Petersburg': 60, 'Vladivostok': 55, 'Murmansk': 45,
    'Singapore': 30, 'Tokyo': 32, 'Yokohama': 35, 'Melbourne': 42, 'Sydney': 44,
}
PORTS_OF_ORIGIN = list(PORT_BASELINES.keys())[:18]
PORTS_OF_DEST   = list(PORT_BASELINES.keys())[6:]

ROUTE_RISK_PRIORS = {
    'Red Sea':              {'geo': 92, 'weather': 45, 'base_delay': 8,  'diversion': True},
    'Gulf of Aden':         {'geo': 88, 'weather': 42, 'base_delay': 7,  'diversion': True},
    'Suez Canal':           {'geo': 55, 'weather': 30, 'base_delay': 4,  'diversion': False},
    'Strait of Malacca':    {'geo': 38, 'weather': 50, 'base_delay': 2,  'diversion': False},
    'Trans-Pacific':        {'geo': 20, 'weather': 65, 'base_delay': 3,  'diversion': False},
    'Trans-Atlantic':       {'geo': 18, 'weather': 60, 'base_delay': 2,  'diversion': False},
    'Cape of Good Hope':    {'geo': 25, 'weather': 72, 'base_delay': 5,  'diversion': False},
    'Panama Canal':         {'geo': 22, 'weather': 40, 'base_delay': 3,  'diversion': False},
    'Arctic Route':         {'geo': 30, 'weather': 85, 'base_delay': 6,  'diversion': False},
    'Mediterranean':        {'geo': 35, 'weather': 35, 'base_delay': 2,  'diversion': False},
    'Black Sea':            {'geo': 78, 'weather': 55, 'base_delay': 6,  'diversion': True},
    'Persian Gulf':         {'geo': 65, 'weather': 50, 'base_delay': 4,  'diversion': False},
}
ROUTES = list(ROUTE_RISK_PRIORS.keys())

CARGO_PROFILES = {
    'Perishable':      {'delay_mult': 1.8, 'shortage_mult': 1.6, 'weather_sens': 1.4},
    'Hazardous':       {'delay_mult': 1.4, 'shortage_mult': 1.2, 'weather_sens': 1.1},
    'Raw Material':    {'delay_mult': 1.0, 'shortage_mult': 0.9, 'weather_sens': 0.9},
    'Finished Goods':  {'delay_mult': 1.1, 'shortage_mult': 1.1, 'weather_sens': 1.0},
    'Semi-finished':   {'delay_mult': 1.0, 'shortage_mult': 1.0, 'weather_sens': 0.95},
    'Consumer Goods':  {'delay_mult': 1.15,'shortage_mult': 1.2, 'weather_sens': 1.0},
    'Pharmaceuticals': {'delay_mult': 1.5, 'shortage_mult': 1.8, 'weather_sens': 1.3},
    'Electronics':     {'delay_mult': 1.3, 'shortage_mult': 1.5, 'weather_sens': 1.1},
    'Energy/Fuel':     {'delay_mult': 1.2, 'shortage_mult': 1.3, 'weather_sens': 0.8},
    'Auto Parts':      {'delay_mult': 1.1, 'shortage_mult': 1.2, 'weather_sens': 0.9},
}
SHIPMENT_TYPES = list(CARGO_PROFILES.keys())

SUPPLIER_TIERS = {
    'Tier-1': {'reliability_mean': 0.88, 'reliability_std': 0.06},
    'Tier-2': {'reliability_mean': 0.72, 'reliability_std': 0.10},
    'Tier-3': {'reliability_mean': 0.52, 'reliability_std': 0.14},
}
HIGH_RISK_COUNTRIES = ['Iran', 'Russia', 'North Korea', 'Venezuela', 'Myanmar', 'Syria']
SEASONAL_MULT = [1.2, 1.4, 1.0, 0.9, 0.85, 0.8, 0.85, 0.9, 1.0, 1.1, 1.3, 1.4]


def sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -50, 50)))


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def generate_training_data(n=2000, seed=42):
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        route = rng.choice(ROUTES)
        prior = ROUTE_RISK_PRIORS[route]

        origin = rng.choice(ORIGIN_COUNTRIES)
        dest   = rng.choice(DEST_COUNTRIES)
        port_o = rng.choice(PORTS_OF_ORIGIN)
        port_d = rng.choice(PORTS_OF_DEST)
        cargo  = rng.choice(SHIPMENT_TYPES)
        cargo_p = CARGO_PROFILES[cargo]
        tier_key = rng.choice(list(SUPPLIER_TIERS.keys()))
        tier = SUPPLIER_TIERS[tier_key]
        sup_country = rng.choice(ORIGIN_COUNTRIES)
        month = int(rng.integers(0, 12))
        season_mult = SEASONAL_MULT[month]

        weather_risk = clamp(float(rng.normal(
            prior['weather'] * cargo_p['weather_sens'], 12)), 5, 100)
        geo_risk = clamp(float(rng.normal(prior['geo'], 10)), 5, 100)
        port_cong = clamp(float(rng.normal(
            PORT_BASELINES.get(port_d, 55) * season_mult, 12)), 5, 100)
        port_throughput = clamp(float(rng.normal(5000, 2000)), 500, 15000)
        volume = clamp(float(rng.normal(250, 120)), 10, 1200)
        avg_delay_hist = clamp(abs(float(rng.normal(prior['base_delay'], 2.5))), 0, 25)

        sup_rel = clamp(float(rng.normal(
            tier['reliability_mean'] - (0.15 if sup_country in HIGH_RISK_COUNTRIES else 0),
            tier['reliability_std'])), 0.15, 1.0)
        sup_risk = clamp((1 - sup_rel) * 100, 0, 100)
        stock_cover = clamp(int(rng.normal(22, 14)), 2, 120)
        demand_vol  = clamp(float(rng.normal(0.22, 0.14)) * (1.5 if cargo == 'Perishable' else 1), 0, 1)

        # Delay label
        delay_logit = (
            -4.2
            + 0.035 * weather_risk * cargo_p['weather_sens']
            + 0.032 * geo_risk
            + 0.025 * port_cong
            + 0.18  * avg_delay_hist
            + 0.018 * sup_risk
            + (1.8 if prior['diversion'] else 0)
            + (0.6 if tier_key == 'Tier-3' else 0)
            + (0.4 if stock_cover < 10 else 0)
            + float(rng.normal(0, 0.4))
        )
        delay_prob = sigmoid(delay_logit)
        delayed    = int(delay_prob >= 0.5)

        base_delay_days  = prior['base_delay'] + avg_delay_hist * 0.8 + geo_risk / 25
        pred_delay_days  = clamp(round(
            base_delay_days * cargo_p['delay_mult'] + abs(float(rng.normal(0, 2)))
        ), 1, 35) if delayed else 0

        inbound_risk = delay_prob * 0.45 + (port_cong / 100) * 0.30 + (sup_risk / 100) * 0.25
        proj_cover   = stock_cover - pred_delay_days * (1 + demand_vol) * cargo_p['shortage_mult']
        if proj_cover <= 4 or inbound_risk > 0.72:
            shortage_label = 'High'
            shortage_num   = 2
        elif proj_cover <= 16 or inbound_risk > 0.42:
            shortage_label = 'Medium'
            shortage_num   = 1
        else:
            shortage_label = 'Low'
            shortage_num   = 0
        pred_stock_cover = clamp(round(proj_cover + float(rng.normal(0, 1.5))), 0, 120)

        route_risk = clamp(round(
            weather_risk * 0.28 + geo_risk * 0.38 + port_cong * 0.22 + sup_risk * 0.12
            + (12 if prior['diversion'] else 0)
            + float(rng.normal(0, 4))
        ), 0, 100)

        sup_rel_label = int(sup_rel >= 0.75)

        rows.append({
            'shipment_id': f'SYN-{i:05d}',
            'origin_country': origin,
            'destination_country': dest,
            'port_of_origin': port_o,
            'port_of_destination': port_d,
            'route': route,
            'volume': round(volume, 2),
            'shipment_type': cargo,
            'supplier_country': sup_country,
            'supplier_tier': tier_key,
            'month': month,
            'avg_delay_days_history': round(avg_delay_hist, 2),
            'weather_risk_score': round(weather_risk, 1),
            'geopolitical_risk_score': round(geo_risk, 1),
            'port_congestion_score': round(port_cong, 1),
            'port_throughput': round(port_throughput),
            'stock_cover_days': stock_cover,
            'demand_volatility': round(demand_vol, 3),
            'supplier_risk_score': round(sup_risk, 1),
            'seasonal_congestion_mult': round(season_mult, 2),
            # Labels
            'delayed': delayed,
            'delay_probability': round(float(delay_prob), 4),
            'predicted_delay_days': pred_delay_days,
            'shortage_risk_label': shortage_label,
            'shortage_risk_num': shortage_num,
            'predicted_stock_cover_days': pred_stock_cover,
            'route_risk_score': route_risk,
            'supplier_reliability': round(float(sup_rel), 3),
            'supplier_reliability_label': sup_rel_label,
        })
    return pd.DataFrame(rows)


if __name__ == '__main__':
    df = generate_training_data(2000)
    print(df.shape)
    print(df.dtypes)
    print(df['shortage_risk_label'].value_counts())
    print(df['delayed'].value_counts())
