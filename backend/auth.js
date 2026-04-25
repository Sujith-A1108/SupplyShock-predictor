/**
 * auth.js — Country-based login credentials and session middleware
 */

const COUNTRY_CREDENTIALS = {
  India: {
    userId: 'IN_OPERATOR',
    password: 'india@2026',
    countryCode: 'IN',
    flag: '🇮🇳',
    color: '#FF9933',
    accentColor: '#138808',
    apiKeys: {
      marinetraffic: process.env.MARINETRAFFIC_API_KEY_IN || 'DEMO_IN_MT_KEY',
      openweather:   process.env.OPENWEATHER_API_KEY     || 'DEMO_OW_KEY',
      portwatch:     process.env.PORTWATCH_API_KEY_IN    || 'DEMO_IN_PW_KEY',
    }
  },
  Iran: {
    userId: 'IR_OPERATOR',
    password: 'iran@2026',
    countryCode: 'IR',
    flag: '🇮🇷',
    color: '#239f40',
    accentColor: '#da0000',
    apiKeys: {
      marinetraffic: process.env.MARINETRAFFIC_API_KEY_IR || 'DEMO_IR_MT_KEY',
      openweather:   process.env.OPENWEATHER_API_KEY      || 'DEMO_OW_KEY',
      portwatch:     process.env.PORTWATCH_API_KEY_IR     || 'DEMO_IR_PW_KEY',
    }
  },
  USA: {
    userId: 'US_OPERATOR',
    password: 'usa@2026',
    countryCode: 'US',
    flag: '🇺🇸',
    color: '#3C3B6E',
    accentColor: '#B22234',
    apiKeys: {
      marinetraffic: process.env.MARINETRAFFIC_API_KEY_US || 'DEMO_US_MT_KEY',
      openweather:   process.env.OPENWEATHER_API_KEY      || 'DEMO_OW_KEY',
      portwatch:     process.env.PORTWATCH_API_KEY_US     || 'DEMO_US_PW_KEY',
    }
  },
  Russia: {
    userId: 'RU_OPERATOR',
    password: 'russia@2026',
    countryCode: 'RU',
    flag: '🇷🇺',
    color: '#003DA5',
    accentColor: '#D52B1E',
    apiKeys: {
      marinetraffic: process.env.MARINETRAFFIC_API_KEY_RU || 'DEMO_RU_MT_KEY',
      openweather:   process.env.OPENWEATHER_API_KEY      || 'DEMO_OW_KEY',
      portwatch:     process.env.PORTWATCH_API_KEY_RU     || 'DEMO_RU_PW_KEY',
    }
  }
};

// Simple session store (in-memory for demo)
const activeSessions = new Map();

function login(userId, password) {
  for (const [country, creds] of Object.entries(COUNTRY_CREDENTIALS)) {
    if (creds.userId === userId && creds.password === password) {
      const token = `${country}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      activeSessions.set(token, { country, userId, loginTime: new Date() });
      return { success: true, token, country, flag: creds.flag, color: creds.color, accentColor: creds.accentColor };
    }
  }
  return { success: false, error: 'Invalid credentials' };
}

function verifyToken(token) {
  return activeSessions.get(token) || null;
}

function logout(token) {
  activeSessions.delete(token);
}

function getApiKeys(country) {
  return COUNTRY_CREDENTIALS[country]?.apiKeys || {};
}

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  req.session = session;
  next();
}

module.exports = { login, verifyToken, logout, getApiKeys, authMiddleware, COUNTRY_CREDENTIALS };
