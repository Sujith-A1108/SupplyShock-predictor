/**
 * weatherRoutes.js
 */

const express = require('express');
const router = express.Router();
const weatherService = require('../services/weatherService');

router.get('/', async (req, res) => {
  try {
    const data = await weatherService.getAllWeather();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/high-risk', async (req, res) => {
  try {
    const data = await weatherService.getHighRiskWeather();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/route/:route', async (req, res) => {
  try {
    const data = await weatherService.getWeatherByRoute(req.params.route);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
