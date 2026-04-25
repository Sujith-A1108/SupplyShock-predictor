/**
 * portService.js
 * Handles port congestion data retrieval
 */

const fs = require('fs');
const path = require('path');

const MOCK_PATH = path.join(__dirname, '../../data/mockPorts.json');

async function getAllPorts() {
  const raw = fs.readFileSync(MOCK_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function getPortById(portId) {
  const ports = await getAllPorts();
  return ports.find(p => p.portId === portId) || null;
}

async function getPortByName(name) {
  const ports = await getAllPorts();
  return ports.find(p => p.name.toLowerCase().includes(name.toLowerCase())) || null;
}

async function getCongestedPorts() {
  const ports = await getAllPorts();
  return ports.filter(p => p.congestionLevel === 'High');
}

module.exports = { getAllPorts, getPortById, getPortByName, getCongestedPorts };
