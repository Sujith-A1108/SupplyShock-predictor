/**
 * weatherAgent.js
 * Fetches weather risk data and maps to routes
 */

const weatherService = require('../backend/services/weatherService');

class WeatherAgent {
  constructor() {
    this.name = 'WeatherAgent';
  }

  async run(ships) {
    console.log(`[${this.name}] Fetching weather data for ${ships.length} ships...`);
    const allWeather = await weatherService.getAllWeather();

    const enriched = ships.map(ship => {
      const weather = allWeather.find(w =>
        w.affectedRoutes.some(r => r.toLowerCase().includes(ship.route.toLowerCase()))
      );
      return {
        ...ship,
        weatherData: weather || { riskLevel: 'Low', conditions: 'Clear', windSpeed: 10, waveHeight: 1 },
      };
    });

    console.log(`[${this.name}] Weather enrichment complete.`);
    return enriched;
  }
}

module.exports = new WeatherAgent();
