/**
 * inventoryAgent.js
 * Agent: Calculates stock cover days and shortage risk per shipment
 */

const { calculateStockCoverDays, calculateShortageRisk } = require('../utils/riskCalculator');

// Simulated inventory data (replace with real DB/API in production)
const MOCK_INVENTORY = {
  Electronics:      { currentStock: 5000, dailyDemand: 200 },
  Textiles:         { currentStock: 8000, dailyDemand: 150 },
  'Auto Parts':     { currentStock: 3000, dailyDemand: 180 },
  Machinery:        { currentStock: 1200, dailyDemand: 40  },
  Pharmaceuticals:  { currentStock: 2500, dailyDemand: 300 },
  'Consumer Goods': { currentStock: 12000, dailyDemand: 400 },
  'Raw Materials':  { currentStock: 20000, dailyDemand: 500 },
  Chemicals:        { currentStock: 4000, dailyDemand: 120 },
};

class InventoryAgent {
  constructor() {
    this.name = 'InventoryAgent';
  }

  async run(ships) {
    console.log(`[${this.name}] Computing inventory risk for ${ships.length} ships...`);

    const enriched = ships.map(ship => {
      const cargoRisks = (ship.cargo || []).map(item => {
        const inv = MOCK_INVENTORY[item] || { currentStock: 1000, dailyDemand: 100 };
        const stockCoverDays = calculateStockCoverDays(inv);
        const expectedDelay = (ship.delayDays || 0) + (ship.portData?.avgWaitDays || 1);
        const shortageRisk = calculateShortageRisk({ stockCoverDays, expectedDelay });
        return { item, stockCoverDays, expectedDelay, shortageRisk };
      });

      const maxShortageRisk = Math.max(...cargoRisks.map(c => c.shortageRisk), 0);

      return {
        ...ship,
        cargoRisks,
        maxShortageRisk,
      };
    });

    console.log(`[${this.name}] Inventory analysis complete.`);
    return enriched;
  }
}

module.exports = new InventoryAgent();
