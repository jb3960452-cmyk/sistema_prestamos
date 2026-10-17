  import { db } from './firebase.js';
  import {
      collection,
      doc,
      getDocs,
      setDoc,
      deleteDoc,
      onSnapshot,
      query,
      orderBy,
      limit
  } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

  document.addEventListener('DOMContentLoaded', async () => {
      console.log("Iniciando aplicación...");

      // --- Estado de la aplicación ---
      let loans = [];
      let activities = [];
      let loanHistories = {};

      // Elementos del DOM
      const navBtns = document.querySelectorAll('.nav-btn');
      const sections = document.querySelectorAll('.content-section');
      const sectionTitle = document.getElementById('section-title');
      const loanForm = document.getElementById('loan-form');
      const loansTbody = document.getElementById('loans-tbody');
      const paymentModal = document.getElementById('payment-modal');
      const paymentForm = document.getElementById('payment-form');
      const activityLog = document.getElementById('activity-log');
      const searchInput = document.getElementById('search-loan');
      const detailModal = document.getElementById('detail-modal');
      const detailHistoryList =
  document.getElementById('detail-history-list');

      // ============================================================
      // 1. NAVEGACIÓN
      // ============================================================
      if (navBtns && navBtns.length > 0) {
          navBtns.forEach(btn => {
              btn.addEventListener('click', () => {
                  const sectionId = btn.getAttribute('data-section');
                  navBtns.forEach(b => b.classList.remove('active'));
                  btn.classList.add('active');
                  sections.forEach(s => s.classList.remove('active'));
                  const targetSection = document.getElementById(sectionId);
                  if (targetSection) {
                      targetSection.classList.add('active');
                      if (sectionTitle) sectionTitle.innerText =
  btn.innerText.trim();
                  }
              });
          });
      }

      // ============================================================
      // 2. FIREBASE
      // ============================================================
      async function initFirebase() {
          try {
              onSnapshot(collection(db, "loans"), (snapshot) => {
                  loans = [];
                  snapshot.forEach((docSnap) => {
                      loans.push({ id: docSnap.id, ...docSnap.data() });
                  });
                  updateDashboard();
                  renderLoans(searchInput ? searchInput.value : '');
              }, (err) => console.error("Error loans:", err));

              const activitiesQuery = query(collection(db, "activities"),
  orderBy("date", "desc"), limit(20));
              onSnapshot(activitiesQuery, (snapshot) => {
                  activities = [];
                  snapshot.forEach((docSnap) => {
                      activities.push({ id: docSnap.id, ...docSnap.data()
  });
                  });
                  renderActivities();
              }, (err) => console.error("Error activities:", err));

              processAutomaticInterests();
          } catch (e) {
              console.error("Error Firebase:", e);
          }
      }

      initFirebase();

      // ============================================================
      // 3. INTERESES (Automático y Manual)
      // ============================================================
      async function processAutomaticInterests() {
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];
          for (const loan of loans) {
              if (!loan.lastInterestDate) continue;
              const lastDate = new Date(loan.lastInterestDate);
              const diffDays = Math.ceil(Math.abs(today - lastDate) / (1000
  * 60 * 60 * 24));
              if (diffDays >= 15) {
                  const periods = Math.floor(diffDays / 15);
                  let total = 0;
                  const entries = [];
                  for (let i = 1; i <= periods; i++) {
                      const amt = loan.balance * loan.rate;
                      total += amt;
                      entries.push({ type: 'interes', amount: amt, date: new
  Date().toLocaleString(), text: `Interés acumulado p${i}:
  +$${amt.toFixed(2)}` });
                  }
                  if (total > 0) {
                      try {
                          await setDoc(doc(db, "loans", loan.id), {
                              ...loan,
                              balance: loan.balance + total,
                              lastInterestDate: todayStr,
                              history: [...(loan.history || []), ...entries]
                          });
                          await addActivity(`Intereses automáticos
  (${periods} per.) aplicados a ${loan.client}: +$${total.toFixed(2)}`);
                      } catch (e) { console.error(e); }
                  }
              }
          }
      }

      window.manualApplyInterests = async (id) => {
          const loan = loans.find(l => l.id === id);
          if (!loan) return;
          const today = new Date();
          const lastDate = new Date(loan.lastInterestDate);
          const diffDays = Math.ceil(Math.abs(today - lastDate) / (1000 * 60
  * 60 * 24));

          if (diffDays < 15) {
              alert(`Faltan ${15 - diffDays} días para el siguiente
  interés.`);
              return;
          }

          const periods = Math.floor(diffDays / 15);
          const amtPerPeriod = loan.balance * loan.rate;
          const total = amtPerPeriod * periods;

          if (confirm(`Se detectaron ${periods} periodos pendientes. Total:
  $${total.toFixed(2)}. ¿Aplicar ahora?`)) {
              const entries = [];
              for (let i = 1; i <= periods; i++) {
                  entries.push({ type: 'interes', amount: amtPerPeriod,
  date: new Date().toLocaleString(), text: `Interés manual p${i}:
  +$${amtPerPeriod.toFixed(2)}` });
              }
              try {
                  await setDoc(doc(db, "loans", id), {
                      ...loan,
                      balance: loan.balance + total,
                      lastInterestDate: today.toISOString().split('T')[0],
                      history: [...(loan.history || []), ...entries]
                  });
                  await addActivity(`Carga manual de ${periods} intereses
  para ${loan.client}: +$${total.toFixed(2)}`);
                  alert('Intereses aplicados');
                  // Forzar actualización local
                  const idx = loans.findIndex(l => l.id === id);
                  loans[idx].balance += total;
                  renderLoans(searchInput ? searchInput.value : '');
                  updateDashboard();
              } catch (e) { alert("Error al aplicar"); }
          }
      };

      // --- Gestión de Préstamos, Abonos y Resto ---
      if (loanForm) {
          loanForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const id = Date.now().toString();
              const val =
  parseFloat(document.getElementById('loan-amount').value);
              const newLoan = {
                  client: document.getElementById('client-name').value,
                  initialAmount: val,
                  balance: val,
                  rate:
  parseFloat(document.getElementById('interest-rate').value),
                  date: document.getElementById('loan-date').value,
                  lastInterestDate: new Date().toISOString().split('T')[0],
                  history: [{ type: 'creacion', amount: val, date: new
  Date().toLocaleString(), text: `Préstamo creado por $${val.toFixed(2)}` }]
              };
              try {
                  await setDoc(doc(db, "loans", id), newLoan);
                  await addActivity(`Nuevo préstamo creado para
  ${newLoan.client} por $${val.toFixed(2)}`);
                  loanForm.reset();
                  alert('Creado');
              } catch (e) { alert("Error"); }
          });
      }

      window.openPaymentModal = (id) => {
          const loan = loans.find(l => l.id === id);
          if (!loan) return;
          document.getElementById('payment-loan-id').value = id;
          document.getElementById('modal-client-name').innerText = `Cliente:
  ${loan.client}`;
          paymentModal.classList.add('active');
      };

      if (document.getElementById('close-modal')) {
          document.getElementById('close-modal').addEventListener('click',
  () => paymentModal.classList.remove('active'));
      }

      if (paymentForm) {
          paymentForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const id = document.getElementById('payment-loan-id').value;
              const amount =
  parseFloat(document.getElementById('payment-amount').value);
              const loan = loans.find(l => l.id === id);
              if (!loan) return;
              const newBalance = loan.balance - amount;
              const newHistory = [...(loan.history || []), { type: 'abono',
  amount: -amount, date: new Date().toLocaleString(), text: `Abono
  realizado: -$${amount.toFixed(2)}` }];
              try {
                  await setDoc(doc(db, "loans", id), { ...loan, balance:
  newBalance, history: newHistory });
                  await addActivity(`Abono de $${amount.toFixed(2)}
  realizado a ${loan.client}`);
                  paymentModal.classList.remove('active');
                  paymentForm.reset();
              } catch (e) { alert("Error"); }
          });
      }

      window.deleteLoan = async (id) => {
          if (confirm('¿Eliminar?')) {
              try { await deleteDoc(doc(db, "loans", id));
  alert("Eliminado"); } catch (e) { alert("Error"); }
          }
      };

      window.viewLoanDetail = (id) => {
          const loan = loans.find(l => l.id === id);
          if (!loan) return;
          document.getElementById('detail-client-name').innerText =
  `Cliente: ${loan.client}`;
          document.getElementById('detail-initial').innerText =
  `$${loan.initialAmount.toFixed(2)}`;
          document.getElementById('detail-rate').innerText = `${(loan.rate *
  100)}%`;
          document.getElementById('detail-balance').innerText =
  `$${loan.balance.toFixed(2)}`;
          detailHistoryList.innerHTML = '';
          (loan.history || []).forEach(item => {
              const li = document.createElement('li');
              li.innerHTML = `<span><span
  class="type-${item.type}">${item.text}</span></span><span
  class="date">${item.date}</span>`;
              detailHistoryList.appendChild(li);
          });
          detailModal.classList.add('active');
      };

      if (document.getElementById('close-detail')) {
          document.getElementById('close-detail').addEventListener('click',
  () => detailModal.classList.remove('active'));
      }

      async function addActivity(msg) {
          const id = Date.now().toString();
          try { await setDoc(doc(db, "activities", id), { text: msg, date:
  new Date().toLocaleString() }); } catch (e) {}
      }

      function updateDate() {
          const options = { weekday: 'long', year: 'numeric', month: 'long',
  day: 'numeric' };
          const dateEl = document.getElementById('current-date');
          if (dateEl) dateEl.innerText = new
  Date().toLocaleDateString('es-ES', options);
      }

      function updateDashboard() {
          const total = loans.reduce((sum, l) => sum + (l.balance || 0), 0);
          const activeClients = loans.length;
          const statTotal = document.getElementById('stat-total-amount');
          const statActive = document.getElementById('stat-active-clients');
          const statPending =
  document.getElementById('stat-pending-interest');
          if (statTotal) statTotal.innerText =
  `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          if (statActive) statActive.innerText = activeClients;
          const pending = loans.reduce((sum, l) => sum + ((l.balance || 0) *
  (l.rate || 0)), 0);
          if (statPending) statPending.innerText =
  `$${pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      }

      function renderLoans(filter = '') {
          if (!loansTbody) return;
          loansTbody.innerHTML = '';
          const filteredLoans = loans.filter(l =>
  l.client.toLowerCase().includes(filter.toLowerCase()));
          filteredLoans.forEach(loan => {
              const tr = document.createElement('tr');
              tr.innerHTML = `
                  <td><strong>${loan.client}</strong></td>
                  <td>${loan.date}</td>
                  <td>$${loan.initialAmount.toFixed(2)}</td>
                  <td style="color: ${loan.balance > 0 ? 'var(--text-main)'
  : 'var(--success)'}">$${loan.balance.toFixed(2)}</td>
                  <td>${(loan.rate * 100)}%</td>
                  <td>
                      <button class="btn-action btn-pay"
  onclick="openPaymentModal('${loan.id}')"><i class="fa-solid
  fa-hand-holding-dollar"></i> Abono</button>
                      <button class="btn-action" style="background:#e0e7ff;
  color:#4338ca;" onclick="viewLoanDetail('${loan.id}')"><i class="fa-solid
  fa-eye"></i> Detalle</button>
                      <button class="btn-action" style="background:#fef3c7;
  color:#92400e;" onclick="manualApplyInterests('${loan.id}')"><i
  class="fa-solid fa-clock"></i> Interés</button>
                      <button class="btn-action btn-delete"
  onclick="deleteLoan('${loan.id}')"><i class="fa-solid
  fa-trash"></i></button>
                  </td>
              `;
              loansTbody.appendChild(tr);
          });
          if (filteredLoans.length === 0) {
              loansTbody.innerHTML = '<tr><td colspan="6"
  class="empty-msg">No se encontraron préstamos.</td></tr>';
          }
      }

      function renderActivities() {
          if (!activityLog) return;
          activityLog.innerHTML = '';
          if (activities.length === 0) {
              activityLog.innerHTML = '<p class="empty-msg">No hay actividad
  reciente.</p>';
              return;
          }
          activities.forEach(act => {
              const div = document.createElement('div');
              div.className = 'activity-item';
              div.innerHTML = `<span>${act.text}</span><span
  class="date">${act.date}</span>`;
              activityLog.appendChild(div);
          });
      }

      if (searchInput) {
          searchInput.addEventListener('input', (e) =>
  renderLoans(e.target.value));
      }

      updateDate();
  });