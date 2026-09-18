// Runs inside every Jest worker before any test file (and therefore before
// any app module) is loaded, so config/db.js and everything else picks up
// the test database/secrets instead of the real .env.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });
