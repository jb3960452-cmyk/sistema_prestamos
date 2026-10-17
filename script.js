import { db } from './firebase.js';
import {
    collection, doc, setDoc, updateDoc, deleteDoc,
    onSnapshot, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

console.log("script.js cargado correctamente");

// ============================================================
// ESTADO
// ============================================================
let loans = [];
let activities = [];
const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================
// UTILIDADES
// ============================================================
const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const round2 = (n) => Math.round(n * 100) / 100;

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Convierte 'YYYY-MM-DD' a fecha local (sin desfase de zona horaria)
function parseLocalDate(str) {
    const [y, m, d] = String(str).split('-').map(Number);
    return new Date(y, m - 1, d);
}

function todayLocal() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function toISODate(d) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

async function addActivity(msg) {
    try {
        await setDoc(doc(db, "activities", Date.now().toString()), {
            text: msg,
            date: new Date().toLocaleString()
        });
    } catch (e) { console.error("Error actividad:", e); }
}

// ============================================================
// 1. NAVEGACIÓN + BOTONES (delegación de eventos)
//    Un solo listener maneja todo, así no depende de que
//    otras partes del código hayan cargado bien.
// ============================================================
document.addEventListener('click', (e) => {
    // --- Navegación lateral ---
    const nav = e.target.closest('.nav-btn');
    if (nav) {
        const sectionId = nav.getAttribute('data-section');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        nav.classList.add('active');
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        const target = $(sectionId);
        if (target) target.classList.add('active');
        const title = $('section-title');
        if (title) title.innerText = nav.innerText.trim();
        return;
    }

    // --- Cerrar modales ---
    if (e.target.closest('#close-modal')) { $('payment-modal')?.classList.remove('active'); return; }
    if (e.target.closest('#close-detail')) { $('detail-modal')?.classList.remove('active'); return; }

    // --- Botones de la tabla de préstamos ---
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    if (action === 'pay') openPayment(id);
    else if (action === 'detail') viewDetail(id);
    else if (action === 'interest') applyInterest(id);
    else if (action === 'delete') removeLoan(id);
});

// ============================================================
// 2. FIREBASE (tiempo real)
// ============================================================
try {
    onSnapshot(collection(db, "loans"), (snapshot) => {
        loans = [];
        snapshot.forEach(d => loans.push({ id: d.id, ...d.data() }));
        updateDashboard();
        renderLoans($('search-loan')?.value || '');
    }, (err) => console.error("Error loans:", err));

    const q = query(collection(db, "activities"), orderBy("date", "desc"), limit(20));
    onSnapshot(q, (snapshot) => {
        activities = [];
        snapshot.forEach(d => activities.push({ id: d.id, ...d.data() }));
        renderActivities();
    }, (err) => console.error("Error activities:", err));
} catch (e) {
    console.error("Error Firebase:", e);
}

// ============================================================
// 3. INTERÉS MANUAL (cada 15 días)
// ============================================================
async function applyInterest(id) {
    const loan = loans.find(l => l.id === id);
    if (!loan) return;

    const last = parseLocalDate(loan.lastInterestDate || loan.date);
    const diffDays = Math.floor((todayLocal() - last) / DAY_MS);

    if (diffDays < 15) {
        alert(`Faltan ${15 - diffDays} día(s) para el siguiente interés.`);
        return;
    }

    const periods = Math.floor(diffDays / 15);

    // Interés compuesto: cada periodo se calcula sobre el saldo ya actualizado
    let newBalance = Number(loan.balance);
    const entries = [];
    let total = 0;
    for (let i = 1; i <= periods; i++) {
        const amt = round2(newBalance * loan.rate);
        newBalance = round2(newBalance + amt);
        total += amt;
        entries.push({
            type: 'interes',
            amount: amt,
            date: new Date().toLocaleString(),
            text: `Interés periodo ${i}: +${money(amt)}`
        });
    }
    total = round2(total);

    const ok = confirm(
        `Se detectaron ${periods} periodo(s) de 15 días pendientes.\n` +
        `Total de interés: ${money(total)}\n\n¿Desea aplicarlos ahora?`
    );
    if (!ok) return;

    // Avanzamos la fecha solo los periodos cobrados (no se pierden los días sobrantes)
    const newLast = new Date(last);
    newLast.setDate(newLast.getDate() + periods * 15);

    try {
        await updateDoc(doc(db, "loans", id), {
            balance: newBalance,
            lastInterestDate: toISODate(newLast),
            history: [...(loan.history || []), ...entries]
        });
        await addActivity(`Interés (${periods} per.) aplicado a ${loan.client}: +${money(total)}`);
        alert('Intereses aplicados');
    } catch (e) {
        console.error(e);
        alert("Error al aplicar los intereses");
    }
}

// ============================================================
// 4. PRÉSTAMOS, ABONOS, DETALLE, ELIMINAR
// ============================================================
const loanForm = $('loan-form');
if (loanForm) {
    loanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = Date.now().toString();
        const val = parseFloat($('loan-amount').value);
        const newLoan = {
            client: $('client-name').value,
            initialAmount: val,
            balance: val,
            rate: parseFloat($('interest-rate').value),
            date: $('loan-date').value,
            lastInterestDate: toISODate(new Date()),
            history: [{
                type: 'creacion', amount: val,
                date: new Date().toLocaleString(),
                text: `Préstamo creado por ${money(val)}`
            }]
        };
        try {
            await setDoc(doc(db, "loans", id), newLoan);
            await addActivity(`Nuevo préstamo creado para ${newLoan.client} por ${money(val)}`);
            loanForm.reset();
            alert('Creado');
        } catch (err) { console.error(err); alert("Error al crear"); }
    });
}

function openPayment(id) {
    const loan = loans.find(l => l.id === id);
    if (!loan) return;
    $('payment-loan-id').value = id;
    $('modal-client-name').innerText = `Cliente: ${loan.client}`;
    $('payment-modal').classList.add('active');
}

const paymentForm = $('payment-form');
if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('payment-loan-id').value;
        const amount = parseFloat($('payment-amount').value);
        const loan = loans.find(l => l.id === id);
        if (!loan || isNaN(amount)) return;
        try {
            await updateDoc(doc(db, "loans", id), {
                balance: round2(loan.balance - amount),
                history: [...(loan.history || []), {
                    type: 'abono', amount: -amount,
                    date: new Date().toLocaleString(),
                    text: `Abono: -${money(amount)}`
                }]
            });
            await addActivity(`Abono de ${money(amount)} realizado a ${loan.client}`);
            $('payment-modal').classList.remove('active');
            paymentForm.reset();
        } catch (err) { console.error(err); alert("Error al registrar el abono"); }
    });
}

async function removeLoan(id) {
    if (!confirm('¿Eliminar este préstamo?')) return;
    try {
        await deleteDoc(doc(db, "loans", id));
        alert("Eliminado");
    } catch (err) { console.error(err); alert("Error al eliminar"); }
}

function viewDetail(id) {
    const loan = loans.find(l => l.id === id);
    if (!loan) return;
    $('detail-client-name').innerText = `Cliente: ${loan.client}`;
    $('detail-initial').innerText = money(loan.initialAmount);
    $('detail-rate').innerText = `${(loan.rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
    $('detail-balance').innerText = money(loan.balance);

    const list = $('detail-history-list');
    list.innerHTML = '';
    (loan.history || []).forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<span><span class="type-${esc(item.type)}">${esc(item.text)}</span></span><span class="date">${esc(item.date)}</span>`;
        list.appendChild(li);
    });
    $('detail-modal').classList.add('active');
}

// ============================================================
// 5. RENDER
// ============================================================
function updateDashboard() {
    const total = loans.reduce((s, l) => s + (l.balance || 0), 0);
    const pending = loans.reduce((s, l) => s + (l.balance || 0) * (l.rate || 0), 0);
    const fmt = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if ($('stat-total-amount')) $('stat-total-amount').innerText = fmt(total);
    if ($('stat-active-clients')) $('stat-active-clients').innerText = loans.length;
    if ($('stat-pending-interest')) $('stat-pending-interest').innerText = fmt(pending);
}

function renderLoans(filter = '') {
    const tbody = $('loans-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = loans.filter(l =>
        String(l.client || '').toLowerCase().includes(filter.toLowerCase())
    );

    filtered.forEach(loan => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(loan.client)}</strong></td>
            <td>${esc(loan.date)}</td>
            <td>${money(loan.initialAmount)}</td>
            <td style="color: ${loan.balance > 0 ? 'var(--text-main)' : 'var(--success)'}">${money(loan.balance)}</td>
            <td>${(loan.rate * 100).toFixed(2).replace(/\.?0+$/, '')}%</td>
            <td>
                <button class="btn-action btn-pay" data-action="pay" data-id="${esc(loan.id)}">
                    <i class="fa-solid fa-hand-holding-dollar"></i> Abono
                </button>
                <button class="btn-action" style="background:#e0e7ff; color:#4338ca;" data-action="detail" data-id="${esc(loan.id)}">
                    <i class="fa-solid fa-eye"></i> Detalle
                </button>
                <button class="btn-action" style="background:#fef3c7; color:#92400e;" data-action="interest" data-id="${esc(loan.id)}">
                    <i class="fa-solid fa-clock"></i> Interés
                </button>
                <button class="btn-action btn-delete" data-action="delete" data-id="${esc(loan.id)}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No se encontraron préstamos.</td></tr>';
    }
}

function renderActivities() {
    const log = $('activity-log');
    if (!log) return;
    log.innerHTML = '';
    if (activities.length === 0) {
        log.innerHTML = '<p class="empty-msg">No hay actividad reciente.</p>';
        return;
    }
    activities.forEach(act => {
        const div = document.createElement('div');
        div.className = 'activity-item';
        div.innerHTML = `<span>${esc(act.text)}</span><span class="date">${esc(act.date)}</span>`;
        log.appendChild(div);
    });
}

const searchInput = $('search-loan');
if (searchInput) searchInput.addEventListener('input', (e) => renderLoans(e.target.value));

const dateEl = $('current-date');
if (dateEl) {
    dateEl.innerText = new Date().toLocaleDateString('es-ES',
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}