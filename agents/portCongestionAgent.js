/**
 * portCongestionAgent.js
 * Maps port congestion data to destination ports
 */

const portService = require('../backend/services/portService');

class PortCongestionAgent {
  constructor() {
    this.name = 'PortCongestionAgent';
  }

  async run(ships) {
    console.log(`[${this.name}] Checking port congestion...`);
    const allPorts = await portService.getAllPorts();

    const enriched = ships.map(ship => {
      const port = allPorts.find(p =>
        p.name.toLowerCase().includes(ship.destination.toLowerCase()) ||
        ship.destination.toLowerCase().includes(p.country.toLowerCase())
      );
      return {
        ...ship,
        portData: port || { congestionLevel: 'Low', riskScore: 10, avgWaitDays: 1, operationalStatus: 'Normal' },
      };
    });

    console.log(`[${this.name}] Port congestion enrichment complete.`);
    return enriched;
  }
}

module.exports = new PortCongestionAgent();
