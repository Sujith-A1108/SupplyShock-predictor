/**
 * geoService.js
 * Handles geopolitical risk data retrieval
 */

const fs = require('fs');
const path = require('path');

const MOCK_PATH = path.join(__dirname, '../../data/mockGeo.json');

async function getAllGeoRisks() {
  const raw = fs.readFileSync(MOCK_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function getGeoRiskByRoute(route) {
  const data = await getAllGeoRisks();
  return data.find(g =>
    g.affectedRoutes.some(r => r.toLowerCase().includes(route.toLowerCase()))
  ) || null;
}

async function getHighSeverityEvents() {
  const data = await getAllGeoRisks();
  return data.filter(g => g.severity === 'High');
}

module.exports = { getAllGeoRisks, getGeoRiskByRoute, getHighSeverityEvents };
