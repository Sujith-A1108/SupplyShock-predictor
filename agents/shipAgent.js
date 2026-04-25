/**
 * shipAgent.js — Agent 1: Data ingestion, filtered by importCountry
 */
const shipService = require('../backend/services/shipService');

class ShipAgent {
  constructor() { this.name = 'ShipAgent'; }

  async run(country) {
    console.log(`[${this.name}] Ingesting ships for country: ${country || 'ALL'}`);
    let ships = await shipService.getAllShips();
    if (country) ships = ships.filter(s => s.importCountry === country);
    const validated = ships.map(s => this._validate(s)).filter(Boolean);
    console.log(`[${this.name}] Validated ${validated.length} ships`);
    return validated;
  }

  _validate(ship) {
    const required = ['shipId', 'name', 'origin', 'destination', 'route', 'status'];
    for (const f of required) { if (!ship[f]) return null; }
    return { ...ship, delayDays: ship.delayDays ?? 0, status: ship.status.trim(), geoPoliticalDelays: ship.geoPoliticalDelays || [] };
  }
}

module.exports = new ShipAgent();
