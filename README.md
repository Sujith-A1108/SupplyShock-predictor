# ⬡ SupplyShock Predictor

**Multi-Agent Supply Chain Risk Intelligence System**

Predicts shipment delays, shortage risks, and supply disruptions using a 6-agent AI pipeline.

---

## Architecture

```
Input Data Sources
       │
Agent 1: Data Ingestion      — Collect & validate ship/inventory/weather/port data
       │
Agent 2: Cleaning Agent      — Remove missing values, standardize, merge datasets
       │
Agent 3: Feature Agent       — Stock cover days, port risk score, supplier/weather risk
       │
Agent 4: Prediction Agent    — Predict delay risk & shortage risk (Low/Medium/High)
       │
Agent 5: Decision Agent      — Recommend alternate supplier / route / reorder
       │
Agent 6: Insight Agent       — Generate alerts, explain risk, estimate business impact
       │
Dashboard / Output           — Risk Table, Alerts, Route Risk, Recommendations, Impact
```

---

## Project Structure

```
supplyshock-predictor/
├── frontend/
│   ├── index.html        # Dashboard UI
│   ├── styles.css        # Dark industrial theme
│   └── script.js         # API calls + rendering
├── backend/
│   ├── server.js         # Express server + /api/analyze endpoint
│   ├── routes/
│   │   ├── shipRoutes.js
│   │   ├── weatherRoutes.js
│   │   ├── geoRoutes.js
│   │   └── portRoutes.js
│   └── services/
│       ├── shipService.js
│       ├── weatherService.js
│       ├── geoService.js
│       └── portService.js
├── agents/
│   ├── coordinatorAgent.js   # Master orchestrator
│   ├── shipAgent.js          # Agent 1: Data Ingestion
│   ├── weatherAgent.js       # Agent 2: Weather enrichment
│   ├── geopoliticsAgent.js   # Agent 3: Geo risk
│   ├── portCongestionAgent.js# Agent 4: Port risk
│   └── inventoryAgent.js     # Agent 5: Shortage risk
├── data/
│   ├── mockShips.json
│   ├── mockWeather.json
│   ├── mockGeo.json
│   └── mockPorts.json
├── utils/
│   ├── riskCalculator.js     # Core scoring engine
│   └── formatter.js          # Output formatting helpers
├── .env
├── package.json
└── README.md
```

---

## Quick Start

### 1. Install dependencies
```bash
cd supplyshock-predictor
npm install
```

### 2. Configure environment
```bash
cp .env .env.local
# Edit .env.local with your API keys if using live data
```

### 3. Run the server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 4. Open dashboard
```
http://localhost:3000
```

### 5. Test pipeline only (CLI)
```bash
npm test
```

---

## API Endpoints

| Method | Endpoint           | Description                          |
|--------|--------------------|--------------------------------------|
| POST   | /api/analyze       | Run full 6-agent pipeline            |
| GET    | /api/ships         | All ships                            |
| GET    | /api/ships/delayed | Delayed ships                        |
| GET    | /api/ships/:id     | Single ship by ID                    |
| GET    | /api/weather       | All weather data                     |
| GET    | /api/weather/high-risk | High risk weather regions        |
| GET    | /api/geo           | All geopolitical risks               |
| GET    | /api/geo/high-severity | High severity geo events         |
| GET    | /api/ports         | All port data                        |
| GET    | /api/ports/congested | Congested ports only               |
| GET    | /api/health        | Server health check                  |

---

## Risk Scoring

Risk scores (0–100) are calculated as a weighted combination of:

| Factor           | Weight |
|------------------|--------|
| Delay Days       | 25%    |
| Weather Risk     | 25%    |
| Geopolitical     | 30%    |
| Port Congestion  | 20%    |

**Labels:**
- 🔴 **High**: Score ≥ 70
- 🟡 **Medium**: Score 40–69
- 🟢 **Low**: Score < 40

---

## Extending to Live Data

Replace mock services with real API calls:

- **Ships**: [MarineTraffic API](https://www.marinetraffic.com/en/ais-api-services)
- **Weather**: [OpenWeatherMap Marine API](https://openweathermap.org/api/marine-weather)
- **Ports**: [PortWatch / UN Global Platform](https://portwatch.imf.org/)
- **Geopolitics**: [GDELT Project](https://www.gdeltproject.org/) or custom feed

Set `DATA_MODE=live` in `.env` and update the service files accordingly.

---

## License

MIT
