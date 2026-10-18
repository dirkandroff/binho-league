const CONFIG = { season: 'S2', roster: 'Season 2', archive: 'Season 1 Archive', matches: 'Match Reports', prestiges: 'Prestige Log', threshold: 51, refreshSeconds: 15 };

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(message, status) {
  const error = new Error(message);
  error.status = status || 400;
  throw error;
}
function rows_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) fail_('The season sheet is not ready.', 503);
  return sheet.getDataRange().getValues().slice(1).filter(row => String(row[0]).trim());
}
function text_(value, limit) {
  const text = String(value || '').trim();
  if (!text || text.length > limit || /[\u0000-\u001f]/.test(text)) fail_('Please check the supplied text.');
  return text;
}
function safeCell_(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }
function digest_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function same_(a, b) { let diff = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return diff === 0; }

function roster_() {
  return rows_(CONFIG.roster).map((r, i) => ({ id: String(r[0]), player: String(r[1]), active: r[2] === true || String(r[2]).toLowerCase() === 'true', avatarId: String(r[3] || ''), avatarUrl: String(r[4] || ''), season1Prestige: Number(r[5]) || 0, season2Prestige: Number(r[6]) || 0, wins: Number(r[7]) || 0, losses: Number(r[8]) || 0, seasonWins: Number(r[9]) || 0, seasonLosses: Number(r[10]) || 0, legacyWins: Number(r[12]) || 0, row: i + 2 }));
}
function getLeaderboardData() {
  const roster = roster_();
  const players = roster.filter(p => p.active).sort((a,b) => b.wins-a.wins || a.losses-b.losses || a.player.localeCompare(b.player)).map((p,i) => { const value = Object.assign({}, p, { place: i+1 }); delete value.row; return value; });
  const archive = rows_(CONFIG.archive).map(r => ({ place: Number(r[0]), player: String(r[1]), wins: Number(r[2]) || 0, season1Prestige: Number(r[3]) || 0, avatarId: String(r[4] || ''), avatarUrl: String(r[5] || ''), rawName: String(r[6] || '') }));
  return { success: true, season: 'S2', seasonName: 'Season 2', prestigeThreshold: CONFIG.threshold, players, archive, updatedAt: new Date().toISOString(), refreshSeconds: CONFIG.refreshSeconds };
}
function doGet(e) {
  try {
    if (e && e.parameter && String(e.parameter.api) === '1') return json_(getLeaderboardData());
    return HtmlService.createHtmlOutputFromFile('Index').setTitle('Binho League').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch(error) { return json_({ success: false, error: error.message, status: error.status || 503, players: [] }); }
}

function session_(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) fail_('Please sign in.', 401);
  const props = PropertiesService.getScriptProperties();
  const key = 'session_' + digest_(token);
  const raw = props.getProperty(key);
  if (!raw) fail_('Your session has expired. Please sign in.', 401);
  const session = JSON.parse(raw);
  if (session.expires < Date.now()) { props.deleteProperty(key); fail_('Your session has expired. Please sign in.', 401); }
  return session;
}
function login_(body) {
  const props = PropertiesService.getScriptProperties();
  const configured = props.getProperty('ADMIN_PASSWORD');
  if (!configured || configured.length < 12) fail_('Admin access is awaiting password setup.', 503);
  const now = Date.now();
  let attempts = JSON.parse(props.getProperty('login_attempts') || '{"count":0,"until":0}');
  if (attempts.until < now) attempts = { count: 0, until: now + 600000 };
  if (attempts.count >= 12) fail_('Too many sign in attempts. Try again in 10 minutes.', 429);
  const password = String(body.password || '');
  if (password.length > 128 || !same_(digest_(password), digest_(configured))) {
    attempts.count++;
    props.setProperty('login_attempts', JSON.stringify(attempts));
    fail_('Incorrect admin password.', 401);
  }
  props.deleteProperty('login_attempts');
  const label = text_(body.adminName, 40);
  const all = props.getProperties();
  Object.keys(all).filter(k => k.indexOf('session_') === 0).forEach(k => { try { if(JSON.parse(all[k]).expires < now) props.deleteProperty(k); } catch(e) { props.deleteProperty(k); } });
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  props.setProperty('session_' + digest_(token), JSON.stringify({ name: label, expires: now + 21600000 }));
  return { success: true, token, adminName: label };
}
function matchRecord_(r) { return { id: String(r[0]), season: String(r[1]), playedAt: r[2] instanceof Date ? r[2].toISOString() : String(r[2]), winnerId: String(r[3]), winner: String(r[4]), loserId: String(r[5]), loser: String(r[6]), winnerCycle: Number(r[7]), loserCycle: Number(r[8]), status: String(r[9]), submittedBy: String(r[10]) }; }
function adminData_(session) {
  const players = roster_().map(p => { delete p.row; return p; });
  const used = new Set(players.map(p => p.avatarId));
  const avatars = rowsBank_().map(r => ({ id: String(r[0]), url: String(r[2]), available: !used.has(String(r[0])) }));
  const matches = rows_(CONFIG.matches).slice(-40).reverse().map(matchRecord_);
  return { success: true, adminName: session.name, players, avatars, matches, prestigeThreshold: CONFIG.threshold };
}
function rowsBank_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Avatar Bank');
  return s.getDataRange().getValues().filter(r => /^AV-\d+$/.test(String(r[0])));
}
function id_(body) { const id = String(body.requestId || ''); if (!/^[a-f0-9-]{36}$/.test(id)) fail_('Invalid report ID. Refresh and try again.'); return id; }
function findPlayer_(players, id, requireActive) { const p = players.find(p => p.id === id); if (!p || (requireActive && !p.active)) fail_('Choose an active player.', 409); return p; }
function logMatch_(body, session) {
  const id = id_(body);
  const existing = rows_(CONFIG.matches).find(r => r[0] === id);
  if (existing) {
    if (existing[3] !== body.winnerId || existing[5] !== body.loserId) fail_('This report ID was already used for another match.', 409);
    return { success: true, duplicate: true, message: 'This match was already saved.' };
  }
  const players = roster_();
  const winner = findPlayer_(players, String(body.winnerId), true);
  const loser = findPlayer_(players, String(body.loserId), true);
  if (winner.id === loser.id) fail_('Choose two different players.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.matches);
  sheet.appendRow([id, CONFIG.season, new Date().toISOString(), winner.id, safeCell_(winner.player), loser.id, safeCell_(loser.player), winner.season2Prestige, loser.season2Prestige, 'Confirmed', safeCell_(session.name), '', '']);
  SpreadsheetApp.flush();
  return { success: true, message: winner.player + ' defeated ' + loser.player + '. Match saved.' };
}
function prestige_(body, session) {
  const id = id_(body);
  if (rows_(CONFIG.prestiges).some(r => r[0] === id)) return { success: true, duplicate: true, message: 'This prestige was already saved.' };
  const p = findPlayer_(roster_(), String(body.playerId), true);
  if (p.season2Prestige !== Number(body.expectedCycle)) fail_('This player has already prestiged. Refresh the page.', 409);
  if (p.wins < CONFIG.threshold) fail_('Prestige requires at least ' + CONFIG.threshold + ' current wins.', 409);
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.prestiges).appendRow([id, CONFIG.season, p.id, safeCell_(p.player), new Date().toISOString(), p.season2Prestige+1, p.wins, p.losses, 'Confirmed', safeCell_(session.name)]);
  SpreadsheetApp.flush();
  return { success: true, message: p.player + ' earned Season 2 prestige ' + (p.season2Prestige+1) + '. Current wins and losses reset to zero.' };
}
function voidMatch_(body, session) {
  const records = rows_(CONFIG.matches);
  const index = records.findIndex(r => r[0] === body.matchId);
  if (index < 0) fail_('Match not found.');
  const r = records[index];
  if (r[9] === 'Voided') return { success: true, message: 'This match is already voided.' };
  const players = roster_();
  if (findPlayer_(players,String(r[3]),false).season2Prestige !== Number(r[7]) || findPlayer_(players,String(r[5]),false).season2Prestige !== Number(r[8])) fail_('A participant has prestiged since this match. This correction needs a season history review.', 409);
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.matches).getRange(index+2,10,1,4).setValues([['Voided',r[10],new Date().toISOString(),safeCell_(session.name)]]);
  SpreadsheetApp.flush();
  return { success: true, message: 'Match voided. Its history remains saved.' };
}
function formulas_(row) {
  return [
    '=IFNA(VLOOKUP(D'+row+',\'Avatar Bank\'!A:C,3,FALSE),"")',
    '=COUNTIFS(\'Prestige Log\'!B:B,"S2",\'Prestige Log\'!C:C,A'+row+',\'Prestige Log\'!I:I,"Confirmed")',
    '=COUNTIFS(\'Match Reports\'!B:B,"S2",\'Match Reports\'!D:D,A'+row+',\'Match Reports\'!H:H,G'+row+',\'Match Reports\'!J:J,"Confirmed")',
    '=COUNTIFS(\'Match Reports\'!B:B,"S2",\'Match Reports\'!F:F,A'+row+',\'Match Reports\'!I:I,G'+row+',\'Match Reports\'!J:J,"Confirmed")',
    '=COUNTIFS(\'Match Reports\'!B:B,"S2",\'Match Reports\'!D:D,A'+row+',\'Match Reports\'!J:J,"Confirmed")',
    '=COUNTIFS(\'Match Reports\'!B:B,"S2",\'Match Reports\'!F:F,A'+row+',\'Match Reports\'!J:J,"Confirmed")',
    '=IFERROR(H'+row+'/(H'+row+'+I'+row+'),0)'
  ];
}
function addPlayer_(body, session) {
  const name = text_(body.playerName,60);
  const players = roster_();
  if (players.some(p => p.player.toLocaleLowerCase() === name.toLocaleLowerCase())) fail_('A player with this name already exists.', 409);
  const used = new Set(players.map(p => p.avatarId));
  const avatar = rowsBank_().filter(r => !used.has(String(r[0]))).sort((a,b) => String(b[0]).localeCompare(String(a[0]))).find(r => !body.avatarId || r[0] === body.avatarId);
  if (!avatar) fail_('Choose an available avatar.', 409);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.roster);
  const row = sheet.getLastRow()+1;
  const f = formulas_(row);
  sheet.getRange(row,1,1,13).setValues([['P'+Utilities.getUuid().replace(/-/g,'').slice(0,12),safeCell_(name),true,String(avatar[0]),f[0],0,f[1],f[2],f[3],f[4],f[5],f[6],0]]);
  sheet.getRange(row,3).insertCheckboxes();
  sheet.getRange(row,3).setValue(true);
  sheet.getRange(row,12).setNumberFormat('0.0%');
  SpreadsheetApp.flush();
  return { success: true, message: name+' added with an available avatar.' };
}
function updatePlayer_(body, session) {
  const players = roster_();
  const player = findPlayer_(players,String(body.playerId),false);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.roster);
  if (body.avatarId) {
    if (!rowsBank_().some(r => r[0] === body.avatarId) || players.some(p => p.id !== player.id && p.avatarId === body.avatarId)) fail_('That avatar is already assigned or unavailable.',409);
  }
  if (typeof body.active === 'boolean') sheet.getRange(player.row,3).setValue(body.active);
  if (body.avatarId) sheet.getRange(player.row,4).setValue(body.avatarId);
  SpreadsheetApp.flush();
  return { success: true, message: 'Player updated.' };
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 8192) fail_('Invalid request.');
    const body = JSON.parse(raw);
    if (!lock.tryLock(10000)) fail_('Another report is being saved. Please retry.',503);
    if (body.action === 'login') return json_(login_(body));
    const session = session_(body.token);
    if (body.action === 'logout') { PropertiesService.getScriptProperties().deleteProperty('session_'+digest_(body.token)); return json_({success:true}); }
    if (body.action === 'session') return json_(adminData_(session));
    const actions = { match: logMatch_, prestige: prestige_, voidMatch: voidMatch_, addPlayer: addPlayer_, updatePlayer: updatePlayer_ };
    if (!Object.prototype.hasOwnProperty.call(actions,body.action)) fail_('Unknown action.');
    return json_(actions[body.action](body,session));
  } catch(error) { return json_({success:false,error:error.message || 'Unable to save the report.',status:error.status || 400}); }
  finally { if(lock.hasLock()) lock.releaseLock(); }
}
