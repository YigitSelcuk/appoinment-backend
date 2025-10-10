// Environment Variables Validation
const requiredEnvVars = {
  production: [
    'DB_HOST',
    'DB_USER', 
    'DB_NAME',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'SESSION_SECRET',
    'FRONTEND_URL'
  ],
  development: [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'SESSION_SECRET'
  ]
};

const validateEnvironment = () => {
  const env = process.env.NODE_ENV || 'development';
  const required = requiredEnvVars[env] || requiredEnvVars.development;
  
  const missing = required.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
  }
  
  // JWT Secret güvenlik kontrolü
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters long for security.');
    process.exit(1);
  }
  
  if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 32) {
    console.error('❌ JWT_REFRESH_SECRET must be at least 32 characters long for security.');
    process.exit(1);
  }
  
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    console.error('❌ SESSION_SECRET must be at least 32 characters long for security.');
    process.exit(1);
  }
  
  console.log(`✅ Environment validation passed for ${env} mode`);
};

module.exports = { validateEnvironment };