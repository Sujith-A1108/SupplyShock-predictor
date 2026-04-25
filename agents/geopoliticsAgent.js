/**
 * geopoliticsAgent.js
 * Maps geopolitical risk events to shipping routes
 */

const geoService = require('../backend/services/geoService');

class GeopoliticsAgent {
  constructor() {
    this.name = 'GeopoliticsAgent';
  }

  async run(ships) {
    console.log(`[${this.name}] Analyzing geopolitical risks...`);
    const allGeo = await geoService.getAllGeoRisks();

    const enriched = ships.map(ship => {
      const geoRisk = allGeo.find(g =>
        g.affectedRoutes.some(r => r.toLowerCase().includes(ship.route.toLowerCase()))
      );
      return {
        ...ship,
        geoData: geoRisk || { severity: 'Low', riskScore: 5, description: 'No known geopolitical threats' },
      };
    });

    console.log(`[${this.name}] Geopolitical enrichment complete.`);
    return enriched;
  }
}

module.exports = new GeopoliticsAgent();
