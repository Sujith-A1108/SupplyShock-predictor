/**
 * weatherService.js
 * Handles weather data retrieval (mock or live API)
 */

const fs = require('fs');
const path = require('path');

const MOCK_PATH = path.join(__dirname, '../../data/mockWeather.json');

async function getAllWeather() {
  const raw = fs.readFileSync(MOCK_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function getWeatherByRoute(route) {
  const data = await getAllWeather();
  return data.find(w =>
    w.affectedRoutes.some(r => r.toLowerCase().includes(route.toLowerCase()))
  ) || null;
}

async function getHighRiskWeather() {
  const data = await getAllWeather();
  return data.filter(w => w.riskLevel === 'High');
}

module.exports = { getAllWeather, getWeatherByRoute, getHighRiskWeather };
