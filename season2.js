let adminState = null;
let reportId = null;
let prestigeId = null;
let adminBusy = false;
const el = id => document.getElementById(id);
const option = (value, text) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;

function renderArchive() {
  el('archiveLeaderboard').innerHTML = appState.archive.map(p => `
    <div class="leaderboard-row"><div class="rank-number">#${Number(p.place)}</div>
    <div class="player-button">${avatarMarkup(p.player,p.avatarUrl)}<div class="player-info"><div class="player-name">${escapeHtml(p.player)}</div><div class="player-prestige">S1 ⭐ × ${Number(p.season1Prestige)||0}</div></div></div>
    <div class="wins-number">${Number(p.wins)||0}<span class="wins-label">Final wins</span></div></div>`).join('');
}
function status(message, error = false) {
  el('adminStatus').textContent = message;
  el('adminStatus').classList.toggle('error',error);
}
async function adminRequest(action, values = {}) {
  const response = await fetch('/api/admin', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({action,...values}) });
  const data = await response.json();
  if (!response.ok || !data.success) {
    if (response.status === 401 && action !== 'login') showLogin();
    throw new Error(data.error || 'Unable to save. Please try again.');
  }
  return data;
}
function showLogin() { adminState = null; el('adminWorkspace').hidden = true; el('adminLogin').hidden = false; }
function showAdmin(data) {
  adminState = data;
  el('adminLogin').hidden = true;
  el('adminWorkspace').hidden = false;
  el('adminGreeting').textContent = `Signed in as ${data.adminName}`;
  const active = data.players.filter(p => p.active);
  for (const id of ['playerOne','playerTwo']) {
    const previous = el(id).value;
    el(id).innerHTML = option('','Choose a player') + active.map(p => option(p.id,p.player)).join('');
    if (active.some(p => p.id === previous)) el(id).value = previous;
  }
  updateMatchPlayers();
  const eligible = active.filter(p => p.wins >= data.prestigeThreshold);
  el('prestigePlayer').innerHTML = option('',eligible.length ? 'Choose a player' : 'No players have 51 current wins yet') + eligible.map(p => option(p.id,`${p.player}: ${p.wins} W / ${p.losses} L`)).join('');
  el('prestigeForm').querySelector('button').disabled = !eligible.length;
  el('confirmPrestige').checked = false;
  el('newAvatar').innerHTML = option('','Assign an available avatar') + data.avatars.filter(a=>a.available).map(a=>option(a.id,a.id)).join('');
  el('newAvatarPreview').hidden = true;
  const selected = el('managePlayer').value;
  el('managePlayer').innerHTML = option('','Choose a player') + data.players.map(p=>option(p.id,p.player+(p.active?'':' (inactive)'))).join('');
  if (data.players.some(p=>p.id===selected)) el('managePlayer').value = selected;
  updateManagedPlayer();
  el('recentMatches').innerHTML = data.matches.length ? data.matches.map(m => `<div class="match-history-row ${m.status==='Voided'?'voided':''}"><div><strong>${escapeHtml(m.winner)} defeated ${escapeHtml(m.loser)}</strong><small>${escapeHtml(new Date(m.playedAt).toLocaleString())} · ${escapeHtml(m.submittedBy)} · ${escapeHtml(m.status)}</small></div>${m.status==='Confirmed'?`<button type="button" class="void-button" data-match="${escapeHtml(m.id)}">Void result</button>`:''}</div>`).join('') : '<p>No match reports yet. The first match starts the season.</p>';
  el('recentMatches').querySelectorAll('[data-match]').forEach(button=>button.addEventListener('click',async()=>{
    if (button.dataset.confirm !== 'yes') { button.dataset.confirm='yes'; button.textContent='Confirm void'; return; }
    await runAdmin(async()=>{ const data = await adminRequest('voidMatch',{matchId:button.dataset.match}); status(data.message); });
  }));
}
function updateMatchPlayers() {
  const one=el('playerOne').value,two=el('playerTwo').value;
  for(const id of ['playerOne','playerTwo']) for(const opt of el(id).options) opt.disabled=!!opt.value && opt.value === (id==='playerOne'?two:one);
  const previous=el('matchWinner').value;
  const selected=adminState ? adminState.players.filter(p=>p.id===one||p.id===two):[];
  el('matchWinner').innerHTML=option('','Choose the winner')+(one && two && one!==two ? selected.map(p=>option(p.id,p.player)).join(''):'');
  if(selected.some(p=>p.id===previous)) el('matchWinner').value=previous;
  updateMatchSummary();
}
function updateMatchSummary() {
  const winner=adminState?.players.find(p=>p.id===el('matchWinner').value);
  const loser=adminState?.players.find(p=>[el('playerOne').value,el('playerTwo').value].includes(p.id)&&p.id!==winner?.id);
  el('matchSummary').textContent=winner && loser ? `${winner.player} gets one win. ${loser.player} gets one loss.` : 'Choose two active players and the winner.';
}
function updateManagedPlayer() {
  const player=adminState?.players.find(p=>p.id===el('managePlayer').value);
  el('playerActive').checked=!!player?.active;
  el('manageAvatar').innerHTML=option('','Keep current avatar')+(adminState?.avatars||[]).filter(a=>a.available||a.id===player?.avatarId).map(a=>option(a.id,a.id+(a.id===player?.avatarId?' (current)':''))).join('');
  el('managePlayerForm').querySelector('button').disabled=!player;
}
async function refreshAdmin() { const data=await adminRequest('session'); showAdmin(data); return data; }
async function runAdmin(action) {
  if(adminBusy)return;
  adminBusy=true;
  el('adminWorkspace').querySelectorAll('button').forEach(b=>b.disabled=true);
  try { await action(); await refreshAdmin(); await loadLeagueData(); }
  catch(error){status(error.message,true);}
  finally {adminBusy=false; if(adminState) {el('adminWorkspace').querySelectorAll('button').forEach(b=>b.disabled=false); el('prestigeForm').querySelector('button').disabled=!adminState.players.some(p=>p.active&&p.wins>=adminState.prestigeThreshold); el('managePlayerForm').querySelector('button').disabled=!el('managePlayer').value;}}
}
el('adminLogin').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;status('Signing in…');
  try {await adminRequest('login',{password:el('adminPassword').value,adminName:el('adminName').value});el('adminPassword').value='';await refreshAdmin();status('Signed in. Ready for the next match.');}
  catch(error){status(error.message,true);}finally{button.disabled=false;}
});
for(const id of ['playerOne','playerTwo'])el(id).addEventListener('change',()=>{reportId=null;updateMatchPlayers();});
el('matchWinner').addEventListener('change',()=>{reportId=null;updateMatchSummary();});
el('matchForm').addEventListener('submit',event=>{
  event.preventDefault();
  const winnerId=el('matchWinner').value;const loserId=[el('playerOne').value,el('playerTwo').value].find(id=>id!==winnerId);
  if(!winnerId||!loserId||el('playerOne').value===el('playerTwo').value){status('Choose two different players and their winner.',true);return;}
  reportId ||= crypto.randomUUID();
  runAdmin(async()=>{const data=await adminRequest('match',{requestId:reportId,winnerId,loserId});reportId=null;el('matchForm').reset();status(data.message);});
});
el('prestigePlayer').addEventListener('change',()=>{prestigeId=null;el('confirmPrestige').checked=false;});
el('prestigeForm').addEventListener('submit',event=>{
  event.preventDefault();const p=adminState?.players.find(p=>p.id===el('prestigePlayer').value);if(!p||!el('confirmPrestige').checked)return;
  prestigeId ||=crypto.randomUUID();
  runAdmin(async()=>{const data=await adminRequest('prestige',{requestId:prestigeId,playerId:p.id,expectedCycle:p.season2Prestige});prestigeId=null;status(data.message);});
});
el('adminLogout').addEventListener('click',async()=>{try{await adminRequest('logout');showLogin();status('Signed out.');}catch(error){status(error.message,true);}});
el('adminRefresh').addEventListener('click',()=>runAdmin(async()=>{status('Refreshed.');}));
el('newAvatar').addEventListener('change',()=>{const a=adminState?.avatars.find(a=>a.id===el('newAvatar').value);el('newAvatarPreview').hidden=!a;if(a)el('newAvatarPreview').src=a.url;});
el('addPlayerForm').addEventListener('submit',event=>{event.preventDefault();runAdmin(async()=>{const data=await adminRequest('addPlayer',{playerName:el('newPlayerName').value,avatarId:el('newAvatar').value});el('addPlayerForm').reset();status(data.message);});});
el('managePlayer').addEventListener('change',updateManagedPlayer);
el('managePlayerForm').addEventListener('submit',event=>{event.preventDefault();runAdmin(async()=>{const data=await adminRequest('updatePlayer',{playerId:el('managePlayer').value,active:el('playerActive').checked,avatarId:el('manageAvatar').value});status(data.message);});});
let checkedSession=false;
document.querySelector('[data-view="admin"]').addEventListener('click',async()=>{
  if(checkedSession)return;checkedSession=true;
  try{const response=await fetch('/api/admin',{credentials:'same-origin'});const data=await response.json();if(response.ok&&data.success)showAdmin(data);}catch(error){checkedSession=false;}
});
renderArchive();
