const JWT_SECRET = process.env.JWT_SECRET || 'ecobite_local_dev_secret_change_me';

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set. Using a local development fallback secret.');
}

module.exports = { JWT_SECRET };
