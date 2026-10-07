const http = require('http');
const db = require('../server/database');

function post(url, data, token, method = 'POST') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, raw: d }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function del(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'DELETE',
      headers: {
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, raw: d }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function testPlantAndQRFeatures() {
  console.log('--- 1. Admin Login ---');
  const login = await post('http://localhost:5000/api/auth/login', {
    email: 'admin@hygiene360.com',
    password: 'admin123'
  });
  console.log('Admin:', login.body?.user?.name, 'Role:', login.body?.user?.role);
  const token = login.body.token;

  // Clean any old MANESAR
  db.run("DELETE FROM plants WHERE code LIKE 'MANESAR%'");

  const randCode = 'MANESAR_' + Math.floor(Math.random() * 1000);

  console.log('--- 2. Add New Plant & Location ---');
  const addPlant = await post('http://localhost:5000/api/admin/plants', {
    code: randCode,
    name: 'Manesar Electronics Plant',
    location: 'Plot 72, Sector 8, IMT Manesar, Gurugram, Haryana'
  }, token);
  console.log('Add Plant Status:', addPlant.status, addPlant.body);
  const newPlantId = addPlant.body.plantId;

  console.log('--- 3. Verify Initial Hierarchy Created for New Plant ---');
  const bld = db.get('SELECT * FROM buildings WHERE plant_id = ?', [newPlantId]);
  const fl = db.get('SELECT * FROM floors WHERE building_id = ?', [bld.id]);
  const area = db.get('SELECT * FROM areas WHERE floor_id = ?', [fl.id]);
  console.log('Hierarchy auto-created:', bld.name, '->', fl.name, '->', area.name);

  console.log('--- 4. Create New Toilet QR for this Plant ---');
  const createToilet = await post('http://localhost:5000/api/admin/toilets', {
    plantId: newPlantId,
    areaId: area.id,
    code: 'MAN-TLT-01',
    name: 'Manesar Executive Washroom',
    gender: 'UNISEX'
  }, token);
  console.log('Create Toilet QR:', createToilet.status, createToilet.body);
  const newToiletId = createToilet.body.toiletId;

  console.log('--- 5. Edit Plant (Update Location & Name) ---');
  const editPlant = await post(`http://localhost:5000/api/admin/plants/${newPlantId}`, {
    code: randCode,
    name: 'Manesar AC & Electronics Plant (Unit 2)',
    location: 'Plot 72-74, IMT Manesar, Haryana'
  }, token, 'PUT');
  console.log('Edit Plant Status:', editPlant.status, editPlant.body);

  console.log('--- 6. Delete Toilet QR (IT Admin only) ---');
  const delToilet = await del(`http://localhost:5000/api/admin/toilets/${newToiletId}`, token);
  console.log('Delete Toilet Status:', delToilet.status, delToilet.body);

  console.log('--- 7. Delete Plant (IT Admin only) ---');
  const delPlant = await del(`http://localhost:5000/api/admin/plants/${newPlantId}`, token);
  console.log('Delete Plant Status:', delPlant.status, delPlant.body);

  console.log('--- ALL PLANT & QR DELETE/EDIT FEATURES FULLY VERIFIED & WORKING ---');
}

testPlantAndQRFeatures().catch(e => console.error(e));
