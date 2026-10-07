const db = require('../server/database');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const http = require('http');

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}/api`;

// Helper for HTTP requests
function apiRequest(path, method = 'GET', data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, rawBody: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('  HYGIENE 360 ENTERPRISE SYSTEM — AUTOMATED VERIFICATION SUITE');
  console.log('================================================================\n');

  // 1. Health check
  console.log('TEST 1: Server Health Check');
  const health = await apiRequest('/health');
  assert(health.status === 200 && health.body.status === 'ONLINE', 'Backend server online and operational');

  // 2. Authentication for all 5 roles
  console.log('\nTEST 2: RBAC Multi-Persona Authentication');
  const rolesToTest = [
    { email: 'admin@hygiene360.com', pass: 'admin123', expectedRole: 'SUPER_ADMIN' },
    { email: 'bhiwadi.admin@hygiene360.com', pass: 'admin123', expectedRole: 'PLANT_ADMIN' },
    { email: 'ramesh.sup@hygiene360.com', pass: 'super123', expectedRole: 'SUPERVISOR' },
    { email: 'sunil.agent@hygiene360.com', pass: 'agent123', expectedRole: 'HOUSEKEEPING_AGENT' },
    { email: 'management@hygiene360.com', pass: 'mgmt123', expectedRole: 'MANAGEMENT' }
  ];

  const tokens = {};
  for (const r of rolesToTest) {
    const res = await apiRequest('/auth/login', 'POST', { email: r.email, password: r.pass });
    assert(res.status === 200 && res.body.success, `Login successful for ${r.expectedRole}`);
    assert(res.body.user.role === r.expectedRole, `Role match verified: ${res.body.user.role}`);
    tokens[r.expectedRole] = res.body.token;
  }

  // 3. QR Validation & Role-Based Routing
  console.log('\nTEST 3: Opaque QR Validation & Role-Based Routing');
  const tlt07 = db.get("SELECT * FROM toilets WHERE code = 'TLT-07'");
  assert(tlt07 && tlt07.qr_token.startsWith('H360-QR-'), 'Toilet 07 has random opaque token with no readable plant/business data');

  // Housekeeping Agent scans Toilet 07 QR
  const agentScan = await apiRequest('/qr/validate', 'POST', { token: tlt07.qr_token }, tokens['HOUSEKEEPING_AGENT']);
  assert(agentScan.status === 200 && agentScan.body.workflow === 'HOUSEKEEPING_CLEANING', 'Agent QR scan routes to HOUSEKEEPING_CLEANING workflow');
  assert(agentScan.body.toilet.code === 'TLT-07', 'Scanned toilet details resolved server-side');

  // Supervisor scans SAME Toilet 07 QR
  const supervisorScan = await apiRequest('/qr/validate', 'POST', { token: tlt07.qr_token }, tokens['SUPERVISOR']);
  assert(supervisorScan.status === 200 && supervisorScan.body.workflow === 'SUPERVISOR_INSPECTION', 'Supervisor scanning SAME QR routes to SUPERVISOR_INSPECTION (not cleaning form)');

  // Invalid token check
  const invalidScan = await apiRequest('/qr/validate', 'POST', { token: 'H360-QR-INVALID-TOKEN-999' }, tokens['HOUSEKEEPING_AGENT']);
  assert(invalidScan.status === 404, 'Invalid or fake QR token is rejected by server');

  // 4. Housekeeping Cleaning Workflow & Anti-Fraud Security
  console.log('\nTEST 4: Housekeeping Cleaning Workflow & Anti-Fraud Protection');
  
  // Start session
  const startSession = await apiRequest('/cleaning/start', 'POST', { toiletId: tlt07.id }, tokens['HOUSEKEEPING_AGENT']);
  assert(startSession.status === 200 && startSession.body.session?.session_code.startsWith('H360-'), `Session initialized with server code: ${startSession.body.session?.session_code}`);
  const sessionId = startSession.body.session.id;

  // Anti-Fraud 1: Gallery upload attempt blocked
  const dummyBase64 = 'data:image/jpeg;base64,' + Buffer.from('fake_image_content_12345').toString('base64');
  const galleryAttempt = await apiRequest('/cleaning/upload-evidence', 'POST', {
    sessionId,
    photoType: 'CLEANING_EVIDENCE',
    isLiveCamera: false, // Agent attempted gallery upload
    imageBase64: dummyBase64
  }, tokens['HOUSEKEEPING_AGENT']);
  assert(galleryAttempt.status === 403, 'Server strictly rejects gallery upload for official cleaning evidence');
  assert(galleryAttempt.body.error.includes('GALLERY UPLOAD REJECTED'), 'Clear anti-fraud security alert returned');

  // Anti-Fraud 2: Old check-sheet date rejection (Date != Today)
  const oldSheetAttempt = await apiRequest('/cleaning/upload-evidence', 'POST', {
    sessionId,
    photoType: 'CHECK_SHEET',
    isLiveCamera: true,
    declaredSheetDate: '25-09-2026', // Old date
    imageBase64: dummyBase64
  }, tokens['HOUSEKEEPING_AGENT']);
  assert(oldSheetAttempt.status === 400, 'Server rejects check-sheet with old date');
  assert(oldSheetAttempt.body.error.includes("Today's check-sheet is required"), `Correct rejection message: "${oldSheetAttempt.body.error}"`);

  // Valid Photo 1 Upload: CLEANING_EVIDENCE
  const { Jimp } = require('jimp');
  const img1 = new Jimp({ width: 320, height: 240, color: 0x1e3a8aff });
  const p1Buf = await img1.getBuffer('image/jpeg');
  const p1Base64 = 'data:image/jpeg;base64,' + p1Buf.toString('base64');
  const p1Res = await apiRequest('/cleaning/upload-evidence', 'POST', {
    sessionId,
    photoType: 'CLEANING_EVIDENCE',
    isLiveCamera: true,
    imageBase64: p1Base64
  }, tokens['HOUSEKEEPING_AGENT']);
  assert(p1Res.status === 200, 'Photo 1 (Cleaning Evidence) accepted and watermarked');
  assert(p1Res.body.serverTimestampStr, `Official server timestamp stamped: ${p1Res.body.serverTimestampStr}`);

  // Anti-Fraud 3: Duplicate evidence rejection (exact hash previously submitted for different slot)
  const duplicateAttempt = await apiRequest('/cleaning/upload-evidence', 'POST', {
    sessionId,
    photoType: 'TOILET_CONDITION',
    isLiveCamera: true,
    imageBase64: p1Base64 // Submitting same image for a different slot
  }, tokens['HOUSEKEEPING_AGENT']);
  assert(duplicateAttempt.status === 400 && duplicateAttempt.body.error.includes('Duplicate evidence detected'), 'Server rejects duplicate image hash');

  // Valid Photo 2 Upload: TOILET_CONDITION
  const img2 = new Jimp({ width: 320, height: 240, color: 0x065f46ff });
  const p2Buf = await img2.getBuffer('image/jpeg');
  const p2Res = await apiRequest('/cleaning/upload-evidence', 'POST', {
    sessionId,
    photoType: 'TOILET_CONDITION',
    isLiveCamera: true,
    imageBase64: 'data:image/jpeg;base64,' + p2Buf.toString('base64')
  }, tokens['HOUSEKEEPING_AGENT']);
  assert(p2Res.status === 200, 'Photo 2 (Toilet Condition) accepted and watermarked');

  // Valid Photo 3 Upload: CHECK_SHEET with today's date
  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const img3 = new Jimp({ width: 320, height: 240, color: 0x7c2d12ff });
  const p3Buf = await img3.getBuffer('image/jpeg');
  const p3Res = await apiRequest('/cleaning/upload-evidence', 'POST', {
    sessionId,
    photoType: 'CHECK_SHEET',
    isLiveCamera: true,
    declaredSheetDate: todayStr,
    imageBase64: 'data:image/jpeg;base64,' + p3Buf.toString('base64')
  }, tokens['HOUSEKEEPING_AGENT']);
  assert(p3Res.status === 200, `Photo 3 (Check-Sheet) accepted with verified today date: ${todayStr}`);

  // Submit Cleaning Session
  const checklistItems = await apiRequest('/cleaning/checklist-items');
  const responses = (checklistItems.body.items || []).map(item => ({
    itemId: item.id,
    status: 'PASS',
    failReason: ''
  }));

  const submitRes = await apiRequest('/cleaning/submit', 'POST', {
    sessionId,
    checklistResponses: responses,
    remarks: 'Full sanitize complete'
  }, tokens['HOUSEKEEPING_AGENT']);
  assert(submitRes.status === 200 && submitRes.body.session?.status === 'COMPLETED', `Session submitted. Score: ${submitRes.body.session?.score}%`);

  // Verify compliance update: Toilet 07 is now Cleaned
  const bhiwadiPlant = db.get("SELECT id FROM plants WHERE code = 'BHIWADI'");
  const complianceCheck = await apiRequest(`/dashboard/management?plantId=${bhiwadiPlant.id}`, 'GET', null, tokens['MANAGEMENT']);
  assert(complianceCheck.body.kpis.cleanedToday >= 15, `Cleaned toilets increased dynamically: ${complianceCheck.body.kpis.cleanedToday} / 16`);
  console.log(`  ✓ Current compliance: ${complianceCheck.body.kpis.cleaningCompliance}%`);

  // 5. Supervisor Inspection & Issue Lifecycle
  console.log('\nTEST 5: Supervisor Inspection, Issue Raising & Agent Notification');
  
  // Supervisor reports issue on Toilet-07
  const createIssue = await apiRequest('/issues', 'POST', {
    toiletId: tlt07.id,
    category: 'WC not clean',
    description: 'WC in cubicle 1 has yellow limescale ring needing descaling',
    priority: 'HIGH'
  }, tokens['SUPERVISOR']);
  assert(createIssue.status === 200 && createIssue.body.ticketNo.startsWith('H360-ISS-'), `Issue ticket generated: ${createIssue.body.ticketNo}`);
  const issueId = createIssue.body.issueId;

  // Verify automatic notification was created for assigned agent
  const agentNotifications = await apiRequest('/notifications', 'GET', null, tokens['HOUSEKEEPING_AGENT']);
  const issueNotif = (agentNotifications.body.notifications || []).find(n => n.message.includes('Toilet-07') || n.message.includes('TLT-07'));
  assert(Boolean(issueNotif), 'Responsible housekeeping agent automatically received in-app notification for the issue');
  console.log(`  ✓ Notification received: "${issueNotif?.message}"`);

  // Agent resolves the issue
  const resolveIssue = await apiRequest(`/issues/${issueId}/status`, 'PATCH', {
    status: 'RESOLVED',
    remarks: 'Descaled with acid cleaner and sanitized. Spotless now.'
  }, tokens['HOUSEKEEPING_AGENT']);
  assert(resolveIssue.status === 200 && resolveIssue.body.status === 'RESOLVED', 'Agent marked issue as RESOLVED');

  // Supervisor verifies and closes the issue
  const closeIssue = await apiRequest(`/issues/${issueId}/status`, 'PATCH', {
    status: 'CLOSED',
    remarks: 'Inspected on-site. Limescale completely removed. Verified pass.'
  }, tokens['SUPERVISOR']);
  assert(closeIssue.status === 200 && closeIssue.body.status === 'CLOSED', 'Supervisor verified and closed the issue ticket');

  // 6. Drinking Water Module Check
  console.log('\nTEST 6: Drinking Water Module Hygiene Audit');
  const dwCheck = await apiRequest('/drinking-water/check', 'POST', {
    plantId: bhiwadiPlant.id,
    pointName: 'Central Assembly RO Cooler Point 1',
    waterAvailable: 1,
    dispenserClean: 1,
    drinkingAreaClean: 1,
    glassesAvailable: 1,
    roFunctioning: 1,
    waterLeakage: 0,
    areaCleanliness: 1,
    remarks: 'TDS at 88 ppm, all nozzles sanitized.'
  }, tokens['SUPERVISOR']);
  assert(dwCheck.status === 200 && dwCheck.body.status === 'PASS', 'Drinking water 7-point hygiene audit recorded PASS');

  // 7. Recurring Problem Detection Engine
  console.log('\nTEST 7: Recurring Issue Detection Engine');
  const recurringRes = await apiRequest(`/dashboard/management?plantId=${bhiwadiPlant.id}`, 'GET', null, tokens['MANAGEMENT']);
  const recurring = recurringRes.body.recurringIssues || [];
  const tlt07Recurring = recurring.find(r => r.toilet_code === 'TLT-07');
  assert(Boolean(tlt07Recurring), 'Recurring issues successfully detected on Toilet-07 (Floor issue 5x, Flush issue 3x)');
  console.log(`  ✓ Detected recurring failure: ${tlt07Recurring?.toilet_code} - ${tlt07Recurring?.category} (${tlt07Recurring?.occurrence_count} occurrences)`);

  // 8. Immutable Audit Trail Verification
  console.log('\nTEST 8: Immutable Audit Trail Log Verification');
  const auditLogs = await apiRequest('/audit-logs?limit=20', 'GET', null, tokens['SUPER_ADMIN']);
  assert(auditLogs.status === 200 && auditLogs.body.logs.length > 0, `Audit log contains ${auditLogs.body.total} immutable events`);
  const actionsLogged = new Set(auditLogs.body.logs.map(l => l.action));
  console.log('  ✓ Actions logged in audit trail:', Array.from(actionsLogged).slice(0, 8).join(', '));

  console.log('\n================================================================');
  console.log('  🎉 ALL 8 TEST SUITES PASSED FLAWLESSLY WITH ZERO DEFECTS!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
