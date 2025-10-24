# KasStamp Web Dashboard

Web dashboard for the KasStamp SDK with modern React/TypeScript frontend.

## Development Setup

### Prerequisites

- Node.js (v20 or higher)
- Built JS SDK (see build instructions below)

### Build Order

1. **Build the JS SDK first**:

   ```bash
   cd js/
   npm install
   npm run build
   ```

2. **Build the web dashboard**:
   ```bash
   cd web/
   npm install
   npm run build
   ```

### Development Server

Start the development server with HTTPS (recommended for mobile testing):

```bash
npm run dev
```

The app will run on `https://localhost:5174` with a self-signed certificate. Your browser will show a security warning - click "Advanced" → "Proceed to localhost" to continue.

**For HTTP instead of HTTPS:**

- Modify `vite.config.ts` and change `server.https` to `false`
- HTTP is useful for local development, HTTPS is recommended for testing on mobile devices with strict SSL requirements

### Mobile Testing

HTTPS is essential when testing the web app on mobile devices over your local network, as many mobile browsers have strict SSL policies.

## Code Style

Follow the project's coding standards as outlined in the main [CONTRIBUTING.md](../CONTRIBUTING.md) guide.
