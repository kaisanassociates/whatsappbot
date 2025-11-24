// Minimal dashboard SPA logic
(function(){
  const apiBase = '';
  let dashboardKey = null;
  let selectedRegIds = new Set(); // Track selected registration IDs

  function setConnection(text, cls='text-muted'){
    const el = document.getElementById('connection-indicator');
    el.textContent = text;
    el.className = cls;
  }

  function authFetch(path, opts={}){
    opts.headers = opts.headers || {};
    opts.headers['Content-Type'] = 'application/json';
    opts.headers['x-dashboard-key'] = dashboardKey || '';
    return fetch(apiBase + path, opts);
  }

  async function loadHealth(){
    try{
      const res = await fetch('/health');
      const j = await res.json();
      if (j.whatsappClientReady) setConnection('✓ WhatsApp ready', 'text-success');
      else setConnection('⚠ WhatsApp NOT ready', 'text-warning');
      return j;
    }catch(e){ setConnection('✗ Health check failed', 'text-danger'); return null}
  }

  async function loadStats(){
    const res = await authFetch('/stats');
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Stats failed: ${text || res.statusText}`);
    }
    return res.json();
  }

  function renderStats(s){
    const row = document.getElementById('statsRow');
    row.innerHTML = '';
    const items = [
      {label:'Total',value:s.total,cls:'primary'},
      {label:'Confirmed',value:s.confirmed,cls:'success'},
      {label:'Pending',value:s.pending,cls:'warning'},
      {label:'Cancelled',value:s.cancelled,cls:'secondary'},
    ];
    items.forEach(it=>{
      const col = document.createElement('div'); col.className='col-md-3';
      col.innerHTML = `<div class="card p-3"><div class="d-flex justify-content-between"><div><div class="text-muted small">${it.label}</div><div class="h4 mt-1">${it.value}</div></div><div class="text-${it.cls} display-6">●</div></div></div>`;
      row.appendChild(col);
    })
  }

  async function loadRegistrations(q=''){
    const url = '/registrations' + (q?('?search='+encodeURIComponent(q)):'');
    const res = await authFetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Registrations failed: ${text || res.statusText}`);
    }
    const result = await res.json();
    // Handle both old format (array) and new format (object with data property)
    return Array.isArray(result) ? result : (result.data || []);
  }

  function makeMsgFlags(r){
    const parts = [];
    if (r.whatsappInitialSent) parts.push('<span class="badge bg-primary me-1">Init</span>');
    if (r.whatsappFollowUpSent) parts.push('<span class="badge bg-info text-dark me-1">Follow</span>');
    if (r.whatsappFinalReminderSent) parts.push('<span class="badge bg-warning text-dark me-1">Final</span>');
    if (r.whatsappConfirmedSent) parts.push('<span class="badge bg-success me-1">Confirmed</span>');
    if (r.whatsappTwoDayReminderSent) parts.push('<span class="badge bg-secondary me-1">2d</span>');
    return parts.join('');
  }

  function renderRegs(list){
    const tbody = document.querySelector('#regsTable tbody');
    tbody.innerHTML = '';
    list.forEach(r=>{
      const tr = document.createElement('tr');
      const isSelected = selectedRegIds.has(r.id);
      tr.innerHTML = `
        <td><input type="checkbox" class="reg-checkbox" data-id="${r.id}" ${isSelected?'checked':''}></td>
        <td>${escapeHtml(r.name||'')}</td>
        <td>${escapeHtml(r.email||'')}</td>
        <td>${escapeHtml(r.phone||'')}</td>
        <td><span class="badge bg-${r.paymentStatus==='confirmed'?'success':'warning'}">${escapeHtml(r.paymentStatus||'')}</span></td>
        <td>${makeMsgFlags(r)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" data-action="send" data-id="${r.id}">Send</button>
          <button class="btn btn-sm btn-outline-secondary me-1" data-action="custom" data-id="${r.id}">Custom</button>
          <select class="form-select form-select-sm d-inline-block me-1" style="width:120px" data-action="status" data-id="${r.id}">
            <option ${r.paymentStatus==='pending'?'selected':''} value="pending">pending</option>
            <option ${r.paymentStatus==='confirmed'?'selected':''} value="confirmed">confirmed</option>
            <option ${r.paymentStatus==='cancelled'?'selected':''} value="cancelled">cancelled</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateSelectedCount();
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]) }

  function updateSelectedCount(){
    const count = selectedRegIds.size;
    document.getElementById('selectedCount').textContent = `${count} selected`;
    document.getElementById('btnBulkSend').disabled = count === 0 || !document.getElementById('bulkMessageType').value;
  }

  async function loadOperationLogs(){
    if (!dashboardKey) {
      // Not authenticated yet, show empty logs
      renderLogs([]);
      return;
    }
    try {
      const res = await authFetch('/operation-logs');
      if (!res.ok) {
        // Auth failed or endpoint error, just show empty logs
        renderLogs([]);
        return;
      }
      const logs = await res.json();
      renderLogs(logs);
    } catch (e) {
      console.error('Error loading logs:', e);
      renderLogs([]);
    }
  }

  function renderLogs(logs){
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = '';
    logs.slice(0, 20).forEach(log=>{
      const tr = document.createElement('tr');
      const time = new Date(log.timestamp).toLocaleString();
      tr.innerHTML = `
        <td class="small">${time}</td>
        <td>${escapeHtml(log.action||'')}</td>
        <td>${escapeHtml(log.messageType||'-')}</td>
        <td>${log.successCount}/${log.targetCount}</td>
        <td class="small">${escapeHtml(log.details||'')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function refresh(){
    try{
      await loadHealth();
      if (dashboardKey) {
        // Only load protected data if authenticated
        const s = await loadStats(); 
        renderStats(s);
        const regs = await loadRegistrations(document.getElementById('search').value||'');
        renderRegs(regs);
        await loadOperationLogs();
        await loadSchedulerStatus();
      }
    }catch(e){ console.error(e); if (dashboardKey) alert('Error loading data: '+e.message) }
  }

  // Template management
  let currentTemplate = 'initial';
  let templatesData = {};

  async function loadTemplates(){
    try {
      const res = await authFetch('/templates');
      if (!res.ok) throw new Error('Failed to load templates');
      templatesData = await res.json();
      displayTemplate('initial');
    } catch (e) {
      console.error('Error loading templates:', e);
      alert('Failed to load templates: ' + e.message);
    }
  }

  function displayTemplate(templateType){
    currentTemplate = templateType;
    const content = templatesData[templateType] || '';
    document.getElementById('templateContent').value = content;
    document.querySelectorAll('#templateTabs button').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-template') === templateType);
    });
  }

  async function saveTemplate(){
    const content = document.getElementById('templateContent').value.trim();
    if (!content) {
      alert('Template content cannot be empty');
      return;
    }

    try {
      const res = await authFetch(`/templates/${currentTemplate}`, {
        method: 'PUT',
        body: JSON.stringify({ content })
      });

      if (!res.ok) throw new Error('Failed to save template');
      await res.json();
      alert(`Template "${currentTemplate}" saved successfully!`);
      await loadTemplates();
      await refresh();
    } catch (e) {
      alert('Error saving template: ' + e.message);
    }
  }

  // Scheduler management
  async function loadSchedulerStatus(){
    try {
      const res = await authFetch('/scheduler-status');
      if (!res.ok) throw new Error('Failed to load scheduler status');
      const data = await res.json();
      updateSchedulerDisplay(data.enabled);
    } catch (e) {
      console.error('Error loading scheduler status:', e);
    }
  }

  function updateSchedulerDisplay(isEnabled){
    const statusEl = document.getElementById('schedulerStatus');
    const btnEl = document.getElementById('btnToggleScheduler');
    if (isEnabled) {
      statusEl.textContent = '✓ ENABLED';
      statusEl.className = 'badge bg-success me-2';
      btnEl.textContent = 'Disable';
      btnEl.className = 'btn btn-sm btn-danger';
    } else {
      statusEl.textContent = '✗ DISABLED';
      statusEl.className = 'badge bg-secondary me-2';
      btnEl.textContent = 'Enable';
      btnEl.className = 'btn btn-sm btn-success';
    }
  }

  async function toggleScheduler(){
    try {
      const res = await authFetch('/scheduler-status');
      const currentStatus = await res.json();
      const newState = !currentStatus.enabled;

      if (!confirm(`${newState ? 'Enable' : 'Disable'} auto-schedulers? This will ${newState ? 'start' : 'stop'} automatic message sending.`)) {
        return;
      }

      const toggleRes = await authFetch('/scheduler-toggle', {
        method: 'POST',
        body: JSON.stringify({ enable: newState })
      });

      if (!toggleRes.ok) throw new Error('Failed to toggle scheduler');
      const result = await toggleRes.json();
      alert(result.message);
      await loadSchedulerStatus();
      await refresh();
    } catch (e) {
      alert('Error toggling scheduler: ' + e.message);
    }
  }

  document.getElementById('btnUnlock').addEventListener('click', function(){
    const key = document.getElementById('dashboardKey').value.trim();
    if(!key){ document.getElementById('loginMsg').textContent='Enter the key'; return }
    dashboardKey = key;
    sessionStorage.setItem('dashboardKey', key);
    authFetch('/stats').then(r=>{
      if (!r.ok) return r.json().then(j=>{throw new Error(j.error||'Unauthorized')});
      document.getElementById('login').style.display='none';
      document.getElementById('app').style.display='block';
      document.getElementById('loginMsg').textContent='';
      loadTemplates();
      refresh();
    }).catch(err=>{ document.getElementById('loginMsg').textContent = err.message });
  });

  document.getElementById('btnRefresh').addEventListener('click', ()=>refresh());
  document.getElementById('search').addEventListener('keyup', (e)=>{ if (e.key==='Enter') refresh() });

  // Template management event listeners
  document.querySelectorAll('#templateTabs button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      displayTemplate(btn.getAttribute('data-template'));
    });
  });

  document.getElementById('btnSaveTemplate').addEventListener('click', saveTemplate);

  // Scheduler toggle
  document.getElementById('btnToggleScheduler').addEventListener('click', toggleScheduler);

  // Bulk message type selection
  document.getElementById('bulkMessageType').addEventListener('change', updateSelectedCount);

  // Bulk send button
  document.getElementById('btnBulkSend').addEventListener('click', async function(){
    const messageType = document.getElementById('bulkMessageType').value;
    const ids = Array.from(selectedRegIds);

    if (!messageType || ids.length === 0) {
      alert('Select message type and at least one registration');
      return;
    }

    if (!confirm(`Send "${messageType}" to ${ids.length} registrations? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await authFetch('/bulk-send', {
        method: 'POST',
        body: JSON.stringify({ registrationIds: ids, messageType })
      });

      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'Bulk send failed');
      }

      const result = await res.json();
      
      // Build detailed message with reasons
      let message = `📊 Bulk Send Results\n\n`;
      message += `Total registrations: ${result.targetCount}\n`;
      message += `✅ Sent: ${result.successCount}\n`;
      message += `⏭️  Skipped (already sent): ${result.skippedDuplicates}\n`;
      message += `❌ Failed: ${result.failedCount}\n\n`;
      
      // Show detailed results if there are failures or skips
      if (result.results && result.results.length > 0) {
        message += `📝 Details:\n\n`;
        result.results.forEach(r => {
          const icon = r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
          message += `${icon} ${r.email} (${r.phone})\n`;
          message += `   └─ ${r.reason}\n`;
        });
      }
      
      alert(message);
      selectedRegIds.clear();
      refresh();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  });

  // Select all checkbox
  document.getElementById('selectAll').addEventListener('change', function(e){
    const checkboxes = document.querySelectorAll('.reg-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) {
        selectedRegIds.add(cb.getAttribute('data-id'));
      } else {
        selectedRegIds.delete(cb.getAttribute('data-id'));
      }
    });
    updateSelectedCount();
  });

  // Individual checkbox handling
  document.querySelector('#regsTable').addEventListener('change', (ev)=>{
    const cb = ev.target.closest('.reg-checkbox');
    if (!cb) return;
    const id = cb.getAttribute('data-id');
    if (cb.checked) {
      selectedRegIds.add(id);
    } else {
      selectedRegIds.delete(id);
      document.getElementById('selectAll').checked = false;
    }
    updateSelectedCount();
  });

  // Single send / custom send
  document.querySelector('#regsTable').addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action==='send'){
      const type = prompt('Message type (initial,followUp,finalReminder,confirmed,twoDayReminder):','initial');
      if (!type) return;
      try{
        const r = await authFetch('/registrations/'+id+'/send',{method:'POST',body:JSON.stringify({type})});
        if (!r.ok) throw new Error('Send failed');
        alert('Sent'); refresh();
      }catch(e){ alert(e.message) }
    } else if (action==='custom'){
      const msg = prompt('Custom message:'); if (!msg) return;
      try{
        const r = await authFetch('/registrations/'+id+'/send-custom',{method:'POST',body:JSON.stringify({message:msg})});
        if (!r.ok) throw new Error('Send failed');
        alert('Sent'); refresh();
      }catch(e){ alert(e.message) }
    }
  });

  // Status change
  document.querySelector('#regsTable').addEventListener('change', async (ev)=>{
    const sel = ev.target.closest('select'); if(!sel) return;
    const id = sel.getAttribute('data-id'); const val = sel.value;
    try{
      const r = await authFetch('/registrations/'+id+'/paymentStatus',{method:'PUT',body:JSON.stringify({paymentStatus:val})});
      if (!r.ok) throw new Error('Update failed');
      alert('Updated'); refresh();
    }catch(e){ alert(e.message) }
  });

  // restore key if present
  (function(){
    const k = sessionStorage.getItem('dashboardKey');
    if (k) {
      dashboardKey = k;
      document.getElementById('dashboardKey').value = k;
      // Directly authenticate instead of click
      authFetch('/stats').then(r => {
        if (!r.ok) return r.json().then(j => { throw new Error(j.error || 'Unauthorized') });
        document.getElementById('login').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadTemplates();
        refresh();
      }).catch(err => {
        document.getElementById('loginMsg').textContent = err.message;
        sessionStorage.removeItem('dashboardKey');
        dashboardKey = null;
        loadHealth();
      });
    } else {
      loadHealth();
    }
  })();

})();
