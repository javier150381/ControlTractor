/**
 * AGROPRO MC - app.js
 * Sistema de Control de Operaciones
 */

'use strict';

const SB_URL = 'https://qstnmpbuzhezlpxhhdnx.supabase.co';
const SB_KEY = 'sb_publishable_TD_eHWolZt0VfOBSkSC8FA_Vk-ZlKAa';

const LOCAL_USERS = {
    'admin':    { password: '12345', role: 'admin',    userId: '00000000-0000-0000-0000-000000000001', display: 'Administrador' },
    'operador': { password: '12345', role: 'operator', userId: '00000000-0000-0000-0000-000000000002', display: 'Operador'       },
};
const OPERATOR_USER_ID = LOCAL_USERS.operador.userId;
const CLOSURE_COMMISSION_RATE = 0.20;

let sb = null;
function initSupabase() {
    try {
        sb = window.supabase.createClient(SB_URL, SB_KEY);
        return true;
    } catch (e) {
        console.error('Supabase init error:', e);
        return false;
    }
}

const STATE = {
    user: null,
    role: null,
    settings: { ratePerHour: 15.00, dieselPricePerGallon: 4.00 },
    jobs: [],
    diesel: [],
    advances: [],
    payments: [],
    clients: [],
    reportJobs: [],
    reportDiesel: [],
    reportAdvances: [],
    reportPayments: [],
    editingJobId: null,
    editingDieselId: null,
    reportPeriod: 'all',
    reportFrom: null,
    reportTo: null,
    deudoresPeriod: 'month',
    deudoresFrom: null,
    deudoresTo: null,
    dashboardFrom: null,
    dashboardTo: null,
    activeClosure: null
};

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    setCurrentDate();
    initSupabase();

    const saved = sessionStorage.getItem('tractor_session');
    if (saved) {
        try {
            const s = JSON.parse(saved);
            await enterApp(s.username, s.userId, s.role, s.display);
            return;
        } catch(e) {}
    }
    showLoginScreen();
});

function showLoginScreen() {
    $('login-screen').classList.remove('hidden');
    $('app').classList.add('hidden');
    lucide.createIcons();
}

$('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('login-email').value.trim().toLowerCase();
    const password = $('login-password').value;
    const errEl    = $('login-error');
    const btn      = $('login-btn');

    errEl.classList.add('hidden');
    const user = LOCAL_USERS[username];
    if (!user || user.password !== password) {
        errEl.textContent = 'Usuario o contraseña incorrectos.';
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    await enterApp(username, user.userId, user.role, user.display);
    btn.disabled = false;
});

async function enterApp(username, userId, role, display) {
    STATE.user = { username, userId, display };
    STATE.role = role;
    sessionStorage.setItem('tractor_session', JSON.stringify({ username, userId, role, display }));

    document.body.classList.remove('body-admin', 'body-operator');
    document.body.classList.add(role === 'admin' ? 'body-admin' : 'body-operator');

    $('user-avatar').textContent = display.charAt(0).toUpperCase();
    $('user-email-display').textContent = display;
    $('role-badge').textContent = role === 'admin' ? 'Administrador' : 'Operador';
    
    const indicator = $('role-indicator');
    if (indicator) {
        indicator.textContent = role === 'admin' ? 'Administrador' : 'Operador';
    }

    $$('.admin-only').forEach(el => el.style.display = role === 'admin' ? '' : 'none');
    $$('.operator-only').forEach(el => el.style.display = role === 'operator' ? '' : 'none');

    $('login-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    lucide.createIcons();

    await loadSettings();
    await loadClients();
    await loadJobs();
    await loadDiesel();
    await loadAdvances();
    await loadPayments();
    navigateTo('dashboard');
}

$('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('tractor_session');
    location.reload();
});

const VIEWS = ['dashboard', 'jobs', 'diesel', 'clients', 'reports', 'closure', 'deudores', 'adelantos', 'settings'];
const PAGE_TITLES = {
    dashboard: 'Dashboard',
    jobs: 'Registrar Trabajo',
    diesel: 'Compra de Diésel',
    clients: 'Catálogo de Clientes',
    reports: 'Reportes',
    closure: 'Cierre de Caja',
    deudores: 'Deudores / Cobros',
    adelantos: 'Entregas al Admin',
    settings: 'Configuración'
};

const ADMIN_ALLOWED_VIEWS = ['dashboard', 'reports', 'closure', 'adelantos', 'settings'];
const OPERATOR_ALLOWED_VIEWS = ['dashboard', 'jobs', 'diesel', 'deudores', 'adelantos'];

async function navigateTo(view) {
    const allowedViews = STATE.role === 'admin' ? ADMIN_ALLOWED_VIEWS : OPERATOR_ALLOWED_VIEWS;
    if (!allowedViews.includes(view)) {
        showNotification('Acceso no autorizado', 'error');
        return;
    }
    VIEWS.forEach(v => { const el = $(`view-${v}`); if (el) el.classList.add('hidden'); });
    const target = $(`view-${view}`);
    if (target) target.classList.remove('hidden');

    $$('.nav-item').forEach(i => i.classList.remove('active'));
    const navEl = $(`nav-${view}`);
    if (navEl) navEl.classList.add('active');

    // Cerrar sidebar en móvil
    document.body.classList.remove('sidebar-open');

    $('page-title').textContent = PAGE_TITLES[view] || view;
    $('search-box').classList.toggle('hidden', view !== 'dashboard');

    if (view === 'jobs') prepareJobForm();
    if (view === 'diesel') prepareDieselForm();
    if (view === 'reports') {
        await loadJobs(); await loadDiesel(); await loadAdvances(); await loadPayments();
        renderReport();
    }
    if (view === 'closure') {
        await loadJobs(); await loadDiesel(); await loadAdvances(); await loadPayments();
        await refreshMonthlyClosurePanel();
        lucide.createIcons();
    }
    if (view === 'deudores') {
        await loadJobs();
        await loadPayments();
        renderDeudoresTable();
        renderDeudoresPaymentsHistory();
    }
    if (view === 'adelantos') {
        await loadAdvances();
        renderAdvancesTable();
        if (STATE.role === 'admin') {
            const dateInput = $('admin-advance-date');
            if (dateInput && !dateInput.value) dateInput.value = todayISO();
        }
    }
}

$$('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); navigateTo(item.dataset.view); });
});

// --- SETTINGS ---
async function loadSettings() {
    const { data, error } = await sb.from('settings').select('*').eq('id', 1).single();
    if (!error && data) {
        STATE.settings.ratePerHour = parseFloat(data.rate_per_hour);
        STATE.settings.dieselPricePerGallon = parseFloat(data.diesel_price_per_gallon || 4.00);
    }
    if (STATE.role === 'admin') {
        $('rate-per-hour').value = STATE.settings.ratePerHour;
        $('diesel-default-price').value = STATE.settings.dieselPricePerGallon;
    }
}

$('settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const rate = parseFloat($('rate-per-hour').value);
    const dieselPrice = parseFloat($('diesel-default-price').value);
    if (isNaN(rate) || rate <= 0) return;
    const { error } = await sb.from('settings').update({ rate_per_hour: rate, diesel_price_per_gallon: dieselPrice }).eq('id', 1);
    if (!error) {
        STATE.settings.ratePerHour = rate;
        STATE.settings.dieselPricePerGallon = dieselPrice;
        showNotification('Configuración guardada', 'success');
    }
});

// --- CLIENTS ---
async function loadClients() {
    const { data, error } = await sb.from('clients').select('*').order('name');
    if (!error) {
        STATE.clients = data || [];
        renderClientsList();
        updateClientDatalist();
    }
}

function renderClientsList() {
    const tbody = $('clients-table-body');
    tbody.innerHTML = '';
    STATE.clients.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${c.name}</strong></td><td>${new Date(c.created_at).toLocaleDateString()}</td>
            <td><button class="action-btn delete-btn" data-id="${c.id}"><i data-lucide="trash-2"></i></button></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar cliente?')) { await sb.from('clients').delete().eq('id', btn.dataset.id); loadClients(); }
    }));
    lucide.createIcons();
}

function updateClientDatalist() {
    const dl = $('client-datalist');
    dl.innerHTML = '';
    STATE.clients.forEach(c => { const opt = document.createElement('option'); opt.value = c.name; dl.appendChild(opt); });
}

$('client-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('client-name').value.trim();
    if (!name) return;
    const { error } = await sb.from('clients').insert([{ name }]);
    if (!error) { $('client-name').value = ''; loadClients(); showNotification('Cliente agregado', 'success'); }
});

// --- JOBS ---
async function loadJobs() {
    let query = sb.from('job_entries').select('*').order('work_date', { ascending: false });
    if (STATE.role === 'operator') query = query.eq('user_id', STATE.user.userId);
    const { data, error } = await query;
    if (!error) { STATE.jobs = data || []; renderJobsTable(); updateDashboardStats(); }
}

function renderJobsTable() {
    const tbody = $('jobs-table-body');
    tbody.innerHTML = '';
    const from = STATE.dashboardFrom, to = STATE.dashboardTo;
    const filtered = STATE.jobs.filter(j => (!from || j.work_date >= from) && (!to || j.work_date <= to));
    
    if (!filtered.length) { $('jobs-empty').classList.remove('hidden'); return; }
    $('jobs-empty').classList.add('hidden');

    filtered.forEach(j => {
        const paid = toNumber(j.amount_paid);
        const revenue = toNumber(j.revenue);
        const balance = revenue - paid;
        const status = balance <= 0 ? '<span class="badge badge-plus">Pagado</span>' : (paid > 0 ? '<span class="badge badge-neutral">Parcial</span>' : '<span class="badge badge-minus">Pendiente</span>');
        
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${j.client_name}</strong></td><td>${formatDateSafe(j.work_date)}</td>
            <td>${j.description || '-'}</td><td>${toNumber(j.hours).toFixed(1)} h</td>
            <td>$${revenue.toFixed(2)}</td><td style="color:var(--emerald);">$${paid.toFixed(2)}</td>
            <td style="color:${balance > 0 ? 'var(--red)' : 'var(--emerald)'};">$${balance.toFixed(2)}</td>
            <td>${status}</td>
            <td class="admin-only">
                <button class="action-btn edit-btn" data-id="${j.id}"><i data-lucide="pencil"></i></button>
                <button class="action-btn delete-btn" data-id="${j.id}"><i data-lucide="trash-2"></i></button>
            </td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => editJob(btn.dataset.id)));
    tbody.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deleteJob(btn.dataset.id)));
    lucide.createIcons();
}

function updateDashboardStats() {
    const rev = STATE.jobs.reduce((s, j) => s + toNumber(j.revenue), 0);
    const cost = STATE.diesel.reduce((s, d) => s + toNumber(d.total_cost), 0);
    const hours = STATE.jobs.reduce((s, j) => s + toNumber(j.hours), 0);
    $('total-revenue').textContent = `$${rev.toFixed(2)}`;
    $('total-diesel-cost').textContent = `$${cost.toFixed(2)}`;
    $('total-hours').textContent = `${hours.toFixed(1)} h`;
    $('total-profit').textContent = `$${(rev - cost).toFixed(2)}`;
}

function prepareJobForm() {
    if (!STATE.editingJobId) { $('job-form').reset(); $('job-date').value = todayISO(); }
    updateJobPreview();
}

$('job-hours').addEventListener('input', updateJobPreview);
function updateJobPreview() {
    const h = parseFloat($('job-hours').value) || 0;
    $('preview-revenue').textContent = `$${(h * STATE.settings.ratePerHour).toFixed(2)}`;
}

$('job-form').addEventListener('submit', async e => {
    e.preventDefault();
    const client = $('job-client').value.trim();
    const date = $('job-date').value;
    const hours = parseFloat($('job-hours').value);
    const rev = hours * STATE.settings.ratePerHour;
    const paid = Math.min(parseFloat($('job-paid').value) || 0, rev);

    if (STATE.editingJobId) {
        await sb.from('job_entries').update({ client_name: client, work_date: date, hours, revenue: rev, amount_paid: paid }).eq('id', STATE.editingJobId);
    } else {
        const { data } = await sb.from('job_entries').insert([{ user_id: STATE.user.userId, client_name: client, work_date: date, hours, revenue: rev, amount_paid: paid }]).select();
        if (paid > 0 && data[0]) {
            await sb.from('job_payments').insert([{ job_id: data[0].id, client_name: client, amount: paid, payment_date: date }]);
        }
    }
    STATE.editingJobId = null;
    await loadJobs(); navigateTo('dashboard');
});

async function editJob(id) {
    const j = STATE.jobs.find(x => x.id === id);
    if (!j) return;
    STATE.editingJobId = id;
    navigateTo('jobs');
    $('job-client').value = j.client_name;
    $('job-date').value = j.work_date;
    $('job-hours').value = j.hours;
    $('job-paid').value = j.amount_paid;
    updateJobPreview();
}

async function deleteJob(id) {
    if (confirm('¿Eliminar registro?')) { await sb.from('job_entries').delete().eq('id', id); loadJobs(); }
}

// --- DIESEL ---
async function loadDiesel() {
    let query = sb.from('diesel_purchases').select('*').order('purchase_date', { ascending: false });
    const { data } = await query;
    STATE.diesel = data || [];
    renderDieselTable(); updateDashboardStats();
}

function renderDieselTable() {
    const tbody = $("diesel-table-body");
    const empty = $('diesel-empty');
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!STATE.diesel.length) {
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    STATE.diesel.forEach(d => {
        const tr = document.createElement("tr");
        const canEdit = STATE.role === "admin" || STATE.role === "operator";
        const editBtn = canEdit
            ? `<button class="action-btn edit-btn" data-id="${d.id}" title="Editar"><i data-lucide="pencil"></i></button>`
            : "";
        const deleteBtn = STATE.role === "admin"
            ? `<button class="action-btn delete-btn" data-id="${d.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>`
            : "";
        tr.innerHTML = `<td>${formatDateSafe(d.purchase_date)}</td><td>${toNumber(d.gallons).toFixed(2)} gal</td>
            <td>$${toNumber(d.price_per_gallon).toFixed(2)}</td><td>$${toNumber(d.total_cost).toFixed(2)}</td>
            <td>${d.notes || "-"}</td><td>${editBtn}${deleteBtn}</td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll(".edit-btn").forEach(btn => btn.addEventListener("click", () => editDiesel(btn.dataset.id)));
    tbody.querySelectorAll(".delete-btn").forEach(btn => btn.addEventListener("click", async () => {
        if (confirm("¿Eliminar compra?")) {
            await sb.from("diesel_purchases").delete().eq("id", btn.dataset.id);
            await loadDiesel();
        }
    }));
    lucide.createIcons();
}

function prepareDieselForm() {
    const isEditing = !!STATE.editingDieselId;
    const title = $('diesel-form-title');
    const submitBtn = $('diesel-submit-btn');

    if (title) {
        title.innerHTML = isEditing
            ? '<i data-lucide="pencil"></i> Editar Compra de Diésel'
            : '<i data-lucide="fuel"></i> Registrar Compra de Diésel';
    }
    if (submitBtn) {
        submitBtn.innerHTML = isEditing
            ? '<i data-lucide="save"></i> Guardar Cambios'
            : '<i data-lucide="save"></i> Registrar Compra';
    }

    if (!isEditing) {
        $('diesel-form').reset();
        $('diesel-date').value = todayISO();
        $('diesel-price').value = STATE.settings.dieselPricePerGallon.toFixed(2);
    }

    updateDieselPreview();
    lucide.createIcons();
}

function updateDieselPreview() {
    const gallonsInput = $('diesel-gallons');
    const priceInput = $('diesel-price');
    const preview = $('preview-diesel-cost');
    if (!gallonsInput || !priceInput || !preview) return;

    const gallons = parseFloat(String(gallonsInput.value || '').replace(',', '.')) || 0;
    const price = parseFloat(String(priceInput.value || '').replace(',', '.')) || 0;
    const total = gallons * price;
    preview.textContent = `$${total.toFixed(2)}`;
}

$('diesel-gallons')?.addEventListener('input', updateDieselPreview);
$('diesel-price')?.addEventListener('input', updateDieselPreview);

async function editDiesel(id) {
    const row = STATE.diesel.find(d => d.id === id);
    if (!row) return;

    STATE.editingDieselId = id;
    await navigateTo('diesel');
    $('diesel-date').value = row.purchase_date;
    $('diesel-gallons').value = toNumber(row.gallons);
    $('diesel-price').value = toNumber(row.price_per_gallon);
    $('diesel-notes').value = row.notes || '';
    updateDieselPreview();
}

$('diesel-form').addEventListener('submit', async e => {
    e.preventDefault();
    const gal = parseFloat(String($('diesel-gallons').value || '').replace(',', '.'));
    const price = parseFloat(String($('diesel-price').value || '').replace(',', '.'));
    const date = $('diesel-date').value;
    const notes = $('diesel-notes').value;

    if (!date || !gal || gal <= 0 || !price || price <= 0) {
        showNotification('Completa fecha, galones y precio válidos.', 'warning');
        return;
    }

    const payload = {
        purchase_date: date,
        gallons: gal,
        price_per_gallon: price,
        notes
    };

    let error = null;
    if (STATE.editingDieselId) {
        ({ error } = await sb.from('diesel_purchases').update(payload).eq('id', STATE.editingDieselId));
    } else {
        ({ error } = await sb.from('diesel_purchases').insert([{ ...payload, user_id: STATE.user.userId }]));
    }

    if (error) {
        showNotification(`No se pudo guardar compra: ${error.message}`, 'error');
        return;
    }

    STATE.editingDieselId = null;
    await loadDiesel();
    await navigateTo('diesel');
});

$('diesel-cancel-btn')?.addEventListener('click', async () => {
    STATE.editingDieselId = null;
    await navigateTo('dashboard');
});

// --- ADVANCES (ENTREGAS) ---
async function loadAdvances() {
    let query = sb.from('operator_advances').select('*').order('advance_date', { ascending: false });
    if (STATE.role === 'operator') query = query.eq('user_id', STATE.user.userId);
    const { data, error } = await query;
    if (!error) STATE.advances = data || [];
}

function renderAdvancesTable() {
    const tbody = $('advances-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    STATE.advances.forEach(a => {
        const tr = document.createElement('tr');
        const actionCell = STATE.role === 'admin'
            ? `<button class="action-btn delete-btn" data-id="${a.id}"><i data-lucide="trash-2"></i></button>`
            : `<span style="color:var(--text-3);">Solo lectura</span>`;

        tr.innerHTML = `<td>${formatDateSafe(a.advance_date)}</td><td>$${toNumber(a.amount).toFixed(2)}</td><td>${a.payment_method}</td>
            <td>${actionCell}</td>`;
        tbody.appendChild(tr);
    });
    if (STATE.role === 'admin') {
        tbody.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', async () => {
            if (confirm('¿Eliminar entrega?')) {
                await sb.from('operator_advances').delete().eq('id', btn.dataset.id);
                await loadAdvances();
                renderAdvancesTable();
            }
        }));
    }
    lucide.createIcons();
}
const adminAdvanceForm = $('admin-advance-form');
if (adminAdvanceForm) {
    adminAdvanceForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (STATE.role !== 'admin') return;
        const date = $('admin-advance-date')?.value;
        const amount = parseFloat($('admin-advance-amount')?.value);
        const method = $('admin-advance-method')?.value || 'efectivo';
        const notes = $('admin-advance-notes')?.value?.trim() || null;
        if (!date || !amount || amount <= 0) {
            showNotification('Ingresa fecha y monto válido para la entrega.', 'warning');
            return;
        }
        const btn = $('admin-advance-submit-btn');
        if (btn) btn.disabled = true;
        const { error } = await sb.from('operator_advances').insert([{
            user_id: OPERATOR_USER_ID,
            amount,
            payment_method: method,
            notes,
            advance_date: date
        }]);
        if (btn) btn.disabled = false;
        if (error) {
            showNotification(`No se pudo guardar entrega: ${error.message}`, 'error');
            return;
        }
        showNotification('Entrega registrada correctamente.', 'success');
        adminAdvanceForm.reset();
        if ($('admin-advance-date')) $('admin-advance-date').value = todayISO();
        await loadAdvances();
        renderAdvancesTable();
    });
}

// --- DEUDORES ---
function getCurrentMonthRange() {
    const d = new Date();
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
}
function setDeudoresPeriodUI(period) {
    $$('.deudores-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.period === period));
    const customRange = $('deudores-custom-range');
    if (customRange) customRange.classList.toggle('hidden', period !== 'custom');
}
function ensureDeudoresDefaults() {
    const month = getCurrentMonthRange();
    if (!STATE.deudoresFrom) STATE.deudoresFrom = month.from;
    if (!STATE.deudoresTo) STATE.deudoresTo = month.to;
    const fromInput = $('deudores-range-from');
    const toInput = $('deudores-range-to');
    if (fromInput && !fromInput.value) fromInput.value = STATE.deudoresFrom;
    if (toInput && !toInput.value) toInput.value = STATE.deudoresTo;
    setDeudoresPeriodUI(STATE.deudoresPeriod || 'month');
}
function getDeudoresDateRange() {
    if (STATE.deudoresPeriod === 'month') return getCurrentMonthRange();
    if (STATE.deudoresPeriod === 'custom' && STATE.deudoresFrom && STATE.deudoresTo) return { from: STATE.deudoresFrom, to: STATE.deudoresTo };
    return { from: null, to: null };
}
function getFilteredDeudoresPayments() {
    const range = getDeudoresDateRange();
    const base = range.from ? STATE.payments.filter(p => p.payment_date >= range.from && p.payment_date <= range.to) : [...STATE.payments];
    return base.sort((a,b) => String(b.payment_date).localeCompare(String(a.payment_date)));
}
function renderDeudoresTable() {
    ensureDeudoresDefaults();
    const tbody = $('deudores-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const map = {};
    STATE.jobs.forEach(j => {
        const bal = toNumber(j.revenue) - toNumber(j.amount_paid);
        if (bal > 0) {
            if (!map[j.client_name]) map[j.client_name] = { total: 0, paid: 0, balance: 0, jobs: [] };
            map[j.client_name].total += toNumber(j.revenue);
            map[j.client_name].paid += toNumber(j.amount_paid);
            map[j.client_name].balance += bal;
            map[j.client_name].jobs.push(j);
        }
    });
    Object.keys(map).forEach(client => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${client}</td><td>$${map[client].total.toFixed(2)}</td><td>$${map[client].paid.toFixed(2)}</td>
            <td style="color:var(--red); font-weight:700;">$${map[client].balance.toFixed(2)}</td>
            <td><button class="primary-btn small pay-btn" data-client="${client}">Cobrar</button></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.pay-btn').forEach(btn => btn.addEventListener('click', () => openPaymentModal(btn.dataset.client, map[btn.dataset.client])));
}
function renderDeudoresPaymentsHistory() {
    ensureDeudoresDefaults();
    const rows = getFilteredDeudoresPayments();
    
    // Calcular totales
    const total = rows.reduce((sum, p) => sum + toNumber(p.amount), 0);
    const clients = new Set(rows.map(p => (p.client_name || '').trim()).filter(Boolean));
    
    // Mostrar en pantalla
    if ($('deudores-collected-total')) $('deudores-collected-total').textContent = `$${total.toFixed(2)}`;
    if ($('deudores-collected-count')) $('deudores-collected-count').textContent = rows.length;
    if ($('deudores-clients-count')) $('deudores-clients-count').textContent = clients.size;

    const tbody = $('deudores-payments-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${formatDateSafe(p.payment_date)}</td><td>${p.client_name || '-'}</td>
            <td style="color:var(--emerald); font-weight:700;">$${toNumber(p.amount).toFixed(2)}</td>`;
        tbody.appendChild(tr);
    });
}
function openPaymentModal(client, data) {
    $('payment-modal').classList.remove('hidden');
    $('payment-client-name').textContent = client;
    $('payment-amount').value = data.balance.toFixed(2);
    $('payment-job-id').value = data.jobs.map(j => j.id).join(',');
}
$('payment-form').addEventListener('submit', async e => {
    e.preventDefault();
    const jobIds = $('payment-job-id').value.split(',').filter(Boolean);
    const amount = parseFloat($('payment-amount').value);
    if (!amount || amount <= 0 || !jobIds.length) return;
    let remaining = amount;
    for (const jobId of jobIds) {
        if (remaining <= 0) break;
        const job = STATE.jobs.find(x => x.id === jobId);
        if (!job) continue;
        const balance = toNumber(job.revenue) - toNumber(job.amount_paid);
        if (balance <= 0) continue;
        const applied = Math.min(balance, remaining);
        await sb.from('job_payments').insert([{ job_id: jobId, client_name: job.client_name, amount: applied, payment_date: todayISO() }]);
        await sb.from('job_entries').update({ amount_paid: toNumber(job.amount_paid) + applied }).eq('id', jobId);
        remaining -= applied;
    }
    $('payment-modal').classList.add('hidden');
    await loadJobs(); await loadPayments(); renderDeudoresTable(); renderDeudoresPaymentsHistory(); renderReport();
});
$('cancel-payment-btn').addEventListener('click', () => $('payment-modal').classList.add('hidden'));

// --- REPORTS ---
function renderReport() {
    const filteredJobs = filterData(STATE.jobs, 'work_date');
    const filteredDiesel = filterData(STATE.diesel, 'purchase_date');
    const filteredAdvances = filterData(STATE.advances, 'advance_date');
    const filteredPayments = filterData(STATE.payments, 'payment_date');
    const rev = filteredJobs.reduce((s, j) => s + toNumber(j.revenue), 0);
    const hours = filteredJobs.reduce((s, j) => s + toNumber(j.hours), 0);
    const cost = filteredDiesel.reduce((s, d) => s + toNumber(d.total_cost), 0);
    const adv = filteredAdvances.reduce((s, a) => s + toNumber(a.amount), 0);
    const pending = filteredJobs.reduce((s, j) => s + (toNumber(j.revenue) - toNumber(j.amount_paid)), 0);
    const collected = filteredPayments.reduce((s, p) => s + toNumber(p.amount), 0);
    const operatorCash = collected - cost - adv;
    $('report-revenue').textContent = `$${rev.toFixed(2)}`;
    $('report-hours').textContent = `${hours.toFixed(1)} h`;
    $('report-diesel').textContent = `$${cost.toFixed(2)}`;
    $('report-profit').textContent = `$${(rev - cost).toFixed(2)}`;
    $('report-advances').textContent = `$${adv.toFixed(2)}`;
    $('report-cash').textContent = `$${operatorCash.toFixed(2)}`;
    $('report-payments').textContent = `$${pending.toFixed(2)}`;
    renderSimpleTable('report-jobs-body', filteredJobs, j => `<td>${j.client_name}</td><td>${formatDateSafe(j.work_date)}</td><td>${toNumber(j.hours).toFixed(1)} h</td><td>$${toNumber(j.revenue).toFixed(2)}</td>`);
    renderSimpleTable('report-diesel-body', filteredDiesel, d => `<td>${formatDateSafe(d.purchase_date)}</td><td>${toNumber(d.gallons).toFixed(2)} gal</td><td>$${toNumber(d.total_cost).toFixed(2)}</td>`);
    renderSimpleTable('report-advances-body', filteredAdvances, a => `<td>${formatDateSafe(a.advance_date)}</td><td>$${toNumber(a.amount).toFixed(2)}</td><td>${a.payment_method}</td>`);
    renderSimpleTable('report-payments-body', filteredPayments, p => `<td>${formatDateSafe(p.payment_date)}</td><td>${p.client_name}</td><td>$${toNumber(p.amount).toFixed(2)}</td>`);
}
function filterData(rows, dateField) {
    const range = getDateRange();
    if (!range.from) return rows;
    return rows.filter(r => r[dateField] >= range.from && r[dateField] <= range.to);
}
function getDateRange() {
    if (STATE.reportPeriod === 'today') return { from: todayISO(), to: todayISO() };
    if (STATE.reportPeriod === 'month') {
        const d = new Date();
        const f = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
        return { from: f, to: todayISO() };
    }
    if (STATE.reportPeriod === 'custom') return { from: STATE.reportFrom, to: STATE.reportTo };
    return { from: null, to: null };
}
function renderSimpleTable(id, rows, fn) {
    const b = $(id); if (!b) return; b.innerHTML = '';
    rows.forEach(r => { const tr = document.createElement('tr'); tr.innerHTML = fn(r); b.appendChild(tr); });
}

// --- MONTHLY CLOSURE ---
function getMonthBounds(monthStr) {
    if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
    const [yearRaw, monthRaw] = monthStr.split('-');
    const year = parseInt(yearRaw, 10);
    const month = parseInt(monthRaw, 10);
    if (!year || !month || month < 1 || month > 12) return null;
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { year, month, from, to };
}

function filterByFixedRange(rows, dateField, from, to) {
    return rows.filter(row => {
        let raw = row?.[dateField];
        if (!raw) return false;
        let val = String(raw).split('T')[0].split(' ')[0];
        return (!from || val >= from) && (!to || val <= to);
    });
}

function getClosureMonthValue() {
    const el = $('closure-month');
    if (!el) return null;
    if (!el.value) el.value = todayISO().slice(0, 7);
    return el.value;
}

function setClosureStatusBadge(statusText, tone = 'info') {
    const badge = $('closure-status-badge');
    if (!badge) return;
    badge.textContent = statusText;
    const colorMap = { success: 'var(--emerald)', warning: 'var(--amber)', error: 'var(--red)', info: 'var(--indigo)' };
    badge.style.color = colorMap[tone] || 'var(--indigo)';
}

function setClosureCardValues(values) {
    const set = (id, val) => { const el = $(id); if (el) el.textContent = `$${toNumber(val).toFixed(2)}`; };
    set('closure-collected', values.cobrado_mes);
    set('closure-expenses', values.gastos_mes);
    set('closure-advances', values.adelantos_mes);
    set('closure-base', values.base_comision || values.cobrado_mes);
    set('closure-commission', values.comision_operador || (values.cobrado_mes * 0.20));
    set('closure-balance', values.saldo_a_entregar_admin);
}

async function refreshMonthlyClosurePanel() {
    const monthStr = getClosureMonthValue();
    if (!monthStr) return;
    const calc = computeMonthlyClosure(monthStr);
    if (!calc) return;

    const { data: existing } = await sb.from('monthly_closures').select('*').eq('operator_user_id', OPERATOR_USER_ID).eq('period_year', calc.year).eq('period_month', calc.month).maybeSingle();
    
    if (existing && existing.status === 'confirmado') {
        setClosureCardValues(existing);
        setClosureStatusBadge('CONFIRMADO', 'success');
        $('closure-confirm-btn').disabled = true;
    } else {
        setClosureCardValues(calc);
        setClosureStatusBadge('BORRADOR', 'info');
        $('closure-confirm-btn').disabled = false;
    }
}

function computeMonthlyClosure(monthStr) {
    const b = getMonthBounds(monthStr);
    if (!b) return null;
    const p = filterByFixedRange(STATE.payments, 'payment_date', b.from, b.to).reduce((s,x)=>s+toNumber(x.amount),0);
    const d = filterByFixedRange(STATE.diesel, 'purchase_date', b.from, b.to).reduce((s,x)=>s+toNumber(x.total_cost),0);
    const a = filterByFixedRange(STATE.advances, 'advance_date', b.from, b.to).reduce((s,x)=>s+toNumber(x.amount),0);
    const com = p * CLOSURE_COMMISSION_RATE;
    return { ...b, cobrado_mes:p, gastos_mes:d, adelantos_mes:a, comision_operador:com, saldo_a_entregar_admin: p - d - com - a };
}

async function confirmMonthlyClosure() {
    const monthStr = getClosureMonthValue();
    const calc = computeMonthlyClosure(monthStr);
    if (!calc) return;
    const payload = {
        operator_user_id: OPERATOR_USER_ID, period_year: calc.year, period_month: calc.month, period_start: calc.from, period_end: calc.to,
        status: 'confirmado', cobrado_mes: calc.cobrado_mes, gastos_mes: calc.gastos_mes, adelantos_mes: calc.adelantos_mes,
        base_comision: calc.cobrado_mes, comision_operador: calc.comision_operador, saldo_a_entregar_admin: calc.saldo_a_entregar_admin,
        confirmed_at: new Date().toISOString()
    };
    const { error } = await sb.from('monthly_closures').upsert([payload]);
    if (!error) { 
        showNotification('Cierre confirmado exitosamente', 'success'); 
        await loadAdvances(); // Para ver la entrega final registrada
        await refreshMonthlyClosurePanel(); 
    }
}

async function reopenMonthlyClosure() {
    if (STATE.role !== 'admin') return;
    const monthStr = getClosureMonthValue();
    const calc = getMonthBounds(monthStr);
    if (!calc) return;

    if (!confirm('¿Deseas reabrir este mes? Se anulará el cierre y podrás hacer cambios.')) return;

    const { error } = await sb.from('monthly_closures')
        .update({ status: 'anulado', confirmed_at: null })
        .eq('operator_user_id', OPERATOR_USER_ID)
        .eq('period_year', calc.year)
        .eq('period_month', calc.month);

    if (!error) {
        showNotification('Cierre reabierto. Ya puedes editar datos del mes.', 'warning');
        await refreshMonthlyClosurePanel();
    }
}

// --- UTILS ---
function todayISO() { return new Date().toISOString().split('T')[0]; }
function toNumber(v) { return parseFloat(v) || 0; }
function formatDateSafe(v) { if(!v) return '-'; return new Date(v + 'T12:00:00').toLocaleDateString(); }
function setCurrentDate() { $('current-date').textContent = new Date().toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' }); }
function showNotification(m, t) { alert(m); }

async function loadPayments() {
    let query = sb.from('job_payments').select('*').order('payment_date', { ascending: false });
    const { data, error } = await query;
    if (!error) STATE.payments = data || [];
}

// --- EVENTOS ---
document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('#mobile-toggle-btn');
    if (toggleBtn) {
        document.body.classList.toggle('sidebar-open');
    }
    if (e.target.closest('.nav-item')) {
        document.body.classList.remove('sidebar-open');
    }
});

$$('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        STATE.reportPeriod = tab.dataset.period;
        $('custom-range').classList.toggle('hidden', STATE.reportPeriod !== 'custom');
        if (STATE.reportPeriod !== 'custom') renderReport();
    });
});
$('apply-range-btn')?.addEventListener('click', () => { STATE.reportFrom = $('range-from').value; STATE.reportTo = $('range-to').value; renderReport(); });

$('closure-month')?.addEventListener('change', refreshMonthlyClosurePanel);
$('closure-refresh-btn')?.addEventListener('click', async () => {
    // Forzar recarga de datos antes de recalcular
    await loadJobs(); await loadDiesel(); await loadAdvances(); await loadPayments();
    await refreshMonthlyClosurePanel();
    showNotification('Datos actualizados', 'success');
});
$('closure-confirm-btn')?.addEventListener('click', confirmMonthlyClosure);
$('closure-reopen-btn')?.addEventListener('click', reopenMonthlyClosure);
