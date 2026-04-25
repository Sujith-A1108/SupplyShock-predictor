/**
 * shipService.js
 * Handles ship data retrieval (mock or live API)
 */

const fs = require('fs');
const path = require('path');

const MOCK_PATH = path.join(__dirname, '../../data/mockShips.json');

/**
 * Get all ships from data source
 */
async function getAllShips() {
  try {
    const raw = fs.readFileSync(MOCK_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load ship data: ${err.message}`);
  }
}

/**
 * Get a single ship by ID
 */
async function getShipById(shipId) {
  const ships = await getAllShips();
  const ship = ships.find(s => s.shipId === shipId);
  if (!ship) throw new Error(`Ship not found: ${shipId}`);
  return ship;
}

/**
 * Get ships by route
 */
async function getShipsByRoute(route) {
  const ships = await getAllShips();
  return ships.filter(s => s.route.toLowerCase().includes(route.toLowerCase()));
}

/**
 * Get delayed ships (delayDays > 0)
 */
async function getDelayedShips() {
  const ships = await getAllShips();
  return ships.filter(s => s.delayDays > 0);
}

module.exports = { getAllShips, getShipById, getShipsByRoute, getDelayedShips };
