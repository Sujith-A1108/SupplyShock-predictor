/**
 * shipRoutes.js
 * Express routes for ship data endpoints
 */

const express = require('express');
const router = express.Router();
const shipService = require('../services/shipService');

// GET /api/ships - all ships
router.get('/', async (req, res) => {
  try {
    const ships = await shipService.getAllShips();
    res.json({ success: true, count: ships.length, data: ships });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ships/delayed - delayed ships only
router.get('/delayed', async (req, res) => {
  try {
    const ships = await shipService.getDelayedShips();
    res.json({ success: true, count: ships.length, data: ships });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ships/:id - single ship
router.get('/:id', async (req, res) => {
  try {
    const ship = await shipService.getShipById(req.params.id);
    res.json({ success: true, data: ship });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

module.exports = router;
