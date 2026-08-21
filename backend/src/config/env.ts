export function validateEnv(): void {
  const required = [
    'AUTH0_DOMAIN',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'AUTH0_BASE_URL',
    'AUTH0_SECRET',
    'SESSION_SECRET',
    'AUTH0_TOKEN_VAULT_URL',
    'AUTH0_AUDIENCE',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export const env = {
  auth0Domain: process.env.AUTH0_DOMAIN!,
  auth0ClientId: process.env.AUTH0_CLIENT_ID!,
  auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET!,
  auth0BaseUrl: process.env.AUTH0_BASE_URL || 'http://localhost:3001',
  auth0Secret: process.env.AUTH0_SECRET!,
  auth0Audience: process.env.AUTH0_AUDIENCE!,
  auth0TokenVaultUrl: process.env.AUTH0_TOKEN_VAULT_URL!,
  openaiApiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  epicFhirBaseUrl: process.env.EPIC_FHIR_BASE_URL || 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendBaseUrl: process.env.BACKEND_BASE_URL || `http://localhost:${process.env.PORT || 3001}`,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET!,
  // Explicit, independent toggle for demo/sandbox FHIR data. Previously this
  // was implicitly forced on whenever NODE_ENV === 'development', which meant
  // the real Epic Token Vault path was never exercised locally. Now it only
  // defaults to demo data when USE_DEMO_FHIR is unset AND no Epic client
  // credentials are configured, so setting real EPIC_CLIENT_ID/SECRET lets
  // you test the live integration in dev without extra flags.
  useDemoFhirDefault:
    process.env.USE_DEMO_FHIR !== undefined
      ? process.env.USE_DEMO_FHIR === 'true'
      : !process.env.EPIC_CLIENT_ID,
};