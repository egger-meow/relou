import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const id = process.argv[2];
if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) {
  console.error('Usage: npm run configure -- <REAL_CLOUDFLARE_D1_UUID>\nFirst run: npx wrangler d1 create relou');
  process.exit(1);
}
if (existsSync('wrangler.jsonc')) {
  console.error('wrangler.jsonc already exists; refusing to overwrite.');
  process.exit(1);
}
const template = readFileSync('wrangler.example.jsonc', 'utf8');
writeFileSync('wrangler.jsonc', template.replace('__REAL_D1_DATABASE_ID__', id), { flag: 'wx' });
console.log('Generated local wrangler.jsonc. Next: set secrets and apply D1 migrations. No deployment was performed.');
