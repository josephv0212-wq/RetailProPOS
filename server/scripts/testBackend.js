/**
 * Lightweight backend smoke test.
 *
 * Goal: verify the backend can be imported (no syntax/module errors) without
 * requiring a running DB or external services.
 */

import 'dotenv/config';

const modulesToImport = [
  // entrypoints (avoid importing server.js because it starts listening)
  '../config/db.js',
  '../models/index.js',
  '../middleware/auth.js',
  '../middleware/errorHandler.js',
  '../middleware/requestId.js',
  '../middleware/validation.js',
  '../utils/logger.js',
  '../utils/responseHelper.js',

  // routes
  '../routes/authRoutes.js',
  '../routes/salesRoutes.js',
  '../routes/zohoRoutes.js',
  '../routes/itemRoutes.js',
  '../routes/customerRoutes.js',
  '../routes/printerRoutes.js',
  '../routes/valorApiRoutes.js',

  // controllers
  '../controllers/authController.js',
  '../controllers/salesController.js',
  '../controllers/zohoController.js',
  '../controllers/itemController.js',
  '../controllers/customerController.js',

  // services
  '../services/zohoService.js',
  '../services/authorizeNetService.js',
  '../services/printerService.js',
  '../services/valorApiService.js'
];

async function main() {
  const failures = [];

  for (const mod of modulesToImport) {
    try {
      await import(mod);
    } catch (err) {
      failures.push({ mod, err });
    }
  }

  if (failures.length > 0) {
    console.error(`Backend smoke test failed (${failures.length} module(s) could not be imported):`);
    for (const f of failures) {
      console.error(`- ${f.mod}`);
      console.error(`  ${f.err?.message || f.err}`);
    }
    process.exit(1);
  }

  console.log(`Backend smoke test passed (${modulesToImport.length} modules imported).`);
}

main().catch((err) => {
  console.error('Backend smoke test error:', err?.message || err);
  process.exit(1);
});

