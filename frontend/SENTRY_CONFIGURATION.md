# Sentry Configuration for Multiple Clients

This document explains how to configure Sentry with different DSNs for different clients/servers.

## Overview

The Sentry integration has been configured to support multiple clients/servers with different DSNs. This is achieved through Angular's environment configuration system.

## Configuration Structure

### Environment Files

The Sentry configuration is stored in environment files:

- `src/environments/environment.ts` - Development environment
- `src/environments/environment.prod.ts` - Production environment

You can create additional environment files for different clients:

- `src/environments/environment.client1.ts`
- `src/environments/environment.client2.ts`
- etc.

### Environment File Format

```typescript
export const environment = {
  production: true,
  sentry: {
    dsn: 'YOUR_SENTRY_DSN_HERE',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true
  }
};
```

## Setting Up Different DSNs for Different Clients

### Method 1: Using Environment Files (Recommended)

1. **Create a new environment file** for each client:

```bash
# Example: Create environment file for Client A
# frontend/src/environments/environment.clientA.ts
```

2. **Configure the client-specific DSN**:

```typescript
export const environment = {
  production: true,
  sentry: {
    dsn: 'https://your-client-A-dsn@sentry.io/project-id',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true
  }
};
```

3. **Update angular.json** to add a new build configuration:

```json
{
  "configurations": {
    "clientA": {
      "fileReplacements": [
        {
          "replace": "src/environments/environment.ts",
          "with": "src/environments/environment.clientA.ts"
        }
      ]
    }
  }
}
```

4. **Build for specific client**:

```bash
npm run build -- --configuration=clientA
```

### Method 2: Using Environment Variables (Docker/Runtime)

For Docker deployments, you can use environment variables:

1. **Modify environment.prod.ts** to read from window object:

```typescript
export const environment = {
  production: true,
  sentry: {
    dsn: (window as any).__SENTRY_DSN__ || 'default-dsn',
    // ... other settings
  }
};
```

2. **Inject at runtime** in your Docker container or server:

```html
<!-- In index.html -->
<script>
  window.__SENTRY_DSN__ = 'INJECT_DSN_AT_RUNTIME';
</script>
```

3. **Use environment variables** in your deployment script:

```bash
# In Docker entrypoint or deployment script
sed -i "s|INJECT_DSN_AT_RUNTIME|${SENTRY_DSN}|g" /path/to/index.html
```

## Building for Different Clients

### Build Commands

```bash
# Development build
npm run build

# Production build (default)
npm run build -- --configuration=production

# Client-specific builds (after configuring in angular.json)
npm run build -- --configuration=clientA
npm run build -- --configuration=clientB
```

### Example angular.json Configuration

Add to `projects > channel > architect > build > configurations`:

```json
{
  "clientA": {
    "fileReplacements": [
      {
        "replace": "src/environments/environment.ts",
        "with": "src/environments/environment.clientA.ts"
      }
    ],
    "optimization": true,
    "outputHashing": "all",
    "sourceMap": false,
    "namedChunks": false,
    "extractLicenses": true,
    "vendorChunk": false,
    "buildOptimizer": true
  },
  "clientB": {
    "fileReplacements": [
      {
        "replace": "src/environments/environment.ts",
        "with": "src/environments/environment.clientB.ts"
      }
    ],
    "optimization": true,
    "outputHashing": "all",
    "sourceMap": false,
    "namedChunks": false,
    "extractLicenses": true,
    "vendorChunk": false,
    "buildOptimizer": true
  }
}
```

## Sentry Configuration Options

### DSN (Data Source Name)
- **Required**: Yes
- **Description**: The unique identifier for your Sentry project
- **Example**: `https://abc123@o123456.ingest.sentry.io/456789`

### tracesSampleRate
- **Type**: Number (0.0 to 1.0)
- **Description**: Percentage of transactions to capture for performance monitoring
- **Recommended**: 
  - Development: 1.0 (100%)
  - Production: 0.1 (10%)

### replaysSessionSampleRate
- **Type**: Number (0.0 to 1.0)
- **Description**: Percentage of normal sessions to record
- **Recommended**:
  - Development: 0.1 (10%)
  - Production: 0.05 (5%)

### replaysOnErrorSampleRate
- **Type**: Number (0.0 to 1.0)
- **Description**: Percentage of sessions with errors to record
- **Recommended**: 1.0 (100%)

### enableLogs
- **Type**: Boolean
- **Description**: Enable sending console logs to Sentry
- **Recommended**: true

## Testing Sentry Integration

To test if Sentry is working correctly, you can trigger a test error:

```typescript
import * as Sentry from "@sentry/angular";

// Send a test log
Sentry.logger.info(Sentry.logger.fmt`User ${"test-user"} triggered test`, {
  action: "test_button_click",
});

// Trigger a test error
throw new Error("Sentry Test Error");
```

Check your Sentry dashboard at https://sentry.io to see if the error appears.

## Security Considerations

1. **Never commit DSNs** to version control if they contain sensitive information
2. **Use environment-specific DSNs** for different deployment environments
3. **Consider PII settings** - `sendDefaultPii: true` will send IP addresses
4. **Limit sample rates** in production to control costs and data volume

## Troubleshooting

### Sentry not capturing errors

1. Check that the DSN is correct
2. Verify network connectivity to Sentry
3. Check browser console for Sentry initialization errors
4. Ensure `ErrorHandler` is properly configured in `app.config.ts`

### Build fails after adding Sentry

1. Ensure `@sentry/angular` is installed: `npm install @sentry/angular`
2. Check TypeScript configuration for compatibility
3. Clear node_modules and reinstall: `rm -rf node_modules && npm install`

## Additional Resources

- [Sentry Angular Documentation](https://docs.sentry.io/platforms/javascript/guides/angular/)
- [Sentry Configuration Options](https://docs.sentry.io/platforms/javascript/configuration/)
- [Source Maps Upload](https://docs.sentry.io/platforms/javascript/sourcemaps/)
