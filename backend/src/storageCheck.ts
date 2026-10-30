import { checkStorage } from './lib/storage.js';

// `docker compose exec backend node dist/storageCheck.js`: prints whether the bucket is reachable for every operation the app uses.
const result = await checkStorage();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
