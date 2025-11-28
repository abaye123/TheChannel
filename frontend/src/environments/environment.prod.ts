export const environment = {
  production: true,
  sentry: {
    // Replace this DSN with your production/client-specific DSN
    // For different clients, you can build with different environment files
    dsn: 'https://9f2dc84a014b595fc46046131d924185@o4510440159707136.ingest.us.sentry.io/4510440164098048',
    tracesSampleRate: 0.1, // Lower sample rate in production
    replaysSessionSampleRate: 0.05, // Lower replay rate in production
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true
  }
};
