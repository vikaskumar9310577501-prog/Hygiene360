// Photo storage: Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, else server/uploads on disk.
// Files are always addressed by their public URL path, e.g. '/uploads/evidence/abc.jpg'.
const fs = require('fs');
const path = require('path');

const LOCAL_ROOT = path.join(__dirname, '..', 'uploads');
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let client = null;
function supabase() {
  if (!client) {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

// '/uploads/evidence/a.jpg' -> 'evidence/a.jpg'; rejects path traversal
function keyOf(urlPath) {
  if (!urlPath) return null;
  const clean = String(urlPath).split('?')[0].replace(/\\/g, '/').replace(/^\/+/, '').replace(/^(api\/)?uploads\//, '');
  if (!clean || clean.split('/').some(seg => seg === '..' || seg === '')) return null;
  return clean;
}

function contentTypeOf(key) {
  const ext = path.extname(key).toLowerCase();
  return { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/jpeg';
}

let bucketChecked = false;
async function ensureBucket() {
  if (bucketChecked) return;
  const { error } = await supabase().storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Could not create storage bucket "${BUCKET}": ${error.message}`);
  }
  bucketChecked = true;
}

async function save(urlPath, buffer, contentType) {
  const key = keyOf(urlPath);
  if (!key) throw new Error(`Invalid storage path: ${urlPath}`);
  if (useSupabase) {
    const upload = () => supabase().storage.from(BUCKET).upload(key, buffer, {
      contentType: contentType || contentTypeOf(key),
      upsert: true
    });
    let { error } = await upload();
    if (error && /bucket not found/i.test(error.message)) {
      await ensureBucket();
      ({ error } = await upload());
    }
    if (error) throw new Error(`Photo upload to storage failed: ${error.message}`);
    return urlPath;
  }
  const file = path.join(LOCAL_ROOT, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return urlPath;
}

async function read(urlPath) {
  const key = keyOf(urlPath);
  if (!key) return null;
  if (useSupabase) {
    const { data, error } = await supabase().storage.from(BUCKET).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  const file = path.join(LOCAL_ROOT, key);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

async function remove(urlPath) {
  const key = keyOf(urlPath);
  if (!key) return;
  try {
    if (useSupabase) await supabase().storage.from(BUCKET).remove([key]);
    else {
      const file = path.join(LOCAL_ROOT, key);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (e) {}
}

// Express handler for GET /uploads/* and /api/uploads/*
async function serve(req, res, next) {
  if (!useSupabase) return next();
  const key = keyOf(req.path);
  if (!key) return res.status(404).end();
  const buf = await read(key);
  if (!buf) return res.status(404).end();
  res.setHeader('Content-Type', contentTypeOf(key));
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(buf);
}

module.exports = { save, read, remove, serve, useSupabase, LOCAL_ROOT, keyOf };
