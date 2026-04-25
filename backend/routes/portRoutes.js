/**
 * portRoutes.js
 */

const express = require('express');
const router = express.Router();
const portService = require('../services/portService');

router.get('/', async (req, res) => {
  try {
    const data = await portService.getAllPorts();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/congested', async (req, res) => {
  try {
    const data = await portService.getCongestedPorts();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await portService.getPortById(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Port not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
