import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getLogoBase64() {
   const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.png');
   const buffer = fs.readFileSync(logoPath);
   return `data:image/png;base64,${buffer.toString('base64')}`;
}
