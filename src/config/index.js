import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: baseEnvPath });
console.log(`Loading base environment from: ${baseEnvPath}`);

const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = `.env.${nodeEnv}`;
const envPath = path.resolve(__dirname, `../../${envFile}`);

try {
   const result = dotenv.config({ path: envPath });
   if (result.parsed) {
      console.log(`Loading environment from: ${envPath}`);
   } else {
      console.log(`No overrides found in: ${envPath}`);
   }
} catch (err) {
   console.log(`Environment file not found (optional): ${envPath}`);
}
