/**
 * formatter.js
 * Output formatting helpers for SupplyShock Predictor
 */

/**
 * Format a risk score into a colored badge label
 */
function formatRiskBadge(score) {
  if (score >= 70) return { label: 'HIGH', color: '#ef4444' };
  if (score >= 40) return { label: 'MEDIUM', color: '#f59e0b' };
  return { label: 'LOW', color: '#22c55e' };
}

/**
 * Format currency amounts
 */
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date to readable string
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format delay days into a readable string
 */
function formatDelay(days) {
  if (days === 0) return 'On Schedule';
  if (days === 1) return '1 day delay';
  return `${days} days delay`;
}

/**
 * Format port load percentage with status
 */
function formatPortLoad(loadPercent) {
  if (loadPercent >= 90) return { text: `${loadPercent.toFixed(1)}% (Critical)`, color: '#ef4444' };
  if (loadPercent >= 75) return { text: `${loadPercent.toFixed(1)}% (High)`, color: '#f59e0b' };
  return { text: `${loadPercent.toFixed(1)}% (Normal)`, color: '#22c55e' };
}

/**
 * Build a summary alert message from risk data
 */
function buildAlertMessage({ ship, riskScore, riskLabel, reason }) {
  const urgency = riskLabel === 'High' ? '🔴 CRITICAL' : riskLabel === 'Medium' ? '🟡 WARNING' : '🟢 INFO';
  return `${urgency} | Ship: ${ship.name} (${ship.shipId}) | Route: ${ship.route} | Risk Score: ${riskScore} | Reason: ${reason}`;
}

/**
 * Format a recommendation action
 */
function formatRecommendation(action) {
  const icons = {
    'alternate_supplier': '🔄',
    'stock_increase': '📦',
    'route_change': '🗺️',
    'early_reorder': '⏰',
    'monitor': '👁️',
  };
  const icon = icons[action.type] || '📌';
  return `${icon} ${action.message}`;
}

/**
 * Truncate long strings for display
 */
function truncate(str, maxLen = 50) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

module.exports = {
  formatRiskBadge,
  formatCurrency,
  formatDate,
  formatDelay,
  formatPortLoad,
  buildAlertMessage,
  formatRecommendation,
  truncate,
};
