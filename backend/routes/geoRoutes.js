/**
 * geoRoutes.js
 */

const express = require('express');
const router = express.Router();
const geoService = require('../services/geoService');

router.get('/', async (req, res) => {
  try {
    const data = await geoService.getAllGeoRisks();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/high-severity', async (req, res) => {
  try {
    const data = await geoService.getHighSeverityEvents();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/route/:route', async (req, res) => {
  try {
    const data = await geoService.getGeoRiskByRoute(req.params.route);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
