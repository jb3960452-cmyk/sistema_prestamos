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
      // 1. NAVEGACIÓN (Súper Protegida)
      // ============================================================
      if (navBtns && navBtns.length > 0) {
          navBtns.forEach(btn => {
              btn.addEventListener('click', () => {
                  const sectionId = btn.getAttribute('data-section');
                  console.log("Navegando a:", sectionId);

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
      // 2. FIREBASE (Conexión Segura)
      // ============================================================
      async function initFirebase() {
          try {
              console.log("Conectando con Firestore...");

              onSnapshot(collection(db, "loans"), (snapshot) => {
                  loans = [];
                  loanHistories = {};
                  snapshot.forEach((docSnap) => {
                      const data = docSnap.data();
                      loans.push({ id: docSnap.id, ...data });
                      if (data.history) loanHistories[docSnap.id] =
  data.history;
                  });
                  updateDashboard();
                  renderLoans(searchInput ? searchInput.value : '');
              }, (err) => console.error("Error en préstamos:", err));

              const activitiesQuery = query(collection(db, "activities"),
  orderBy("date", "desc"), limit(20));
              onSnapshot(activitiesQuery, (snapshot) => {
                  activities = [];
                  snapshot.forEach((docSnap) => {
                      activities.push({ id: docSnap.id, ...docSnap.data()
  });
                  });
                  renderActivities();
              }, (err) => console.error("Error en actividades:", err));

              processAutomaticInterests();
          } catch (e) {
              console.error("Error crítico de Firebase:", e);
          }
      }

      initFirebase();

      // ============================================================
      // 3. LÓGICA DE INTERESES ACUMULADOS (La que pediste)
      // ============================================================
      async function processAutomaticInterests() {
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];

          for (const loan of loans) {
              if (!loan.lastInterestDate) continue;

              const lastDate = new Date(loan.lastInterestDate);
              const diffTime = Math.abs(today - lastDate);
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

              if (diffDays >= 15) {
                  const periods = Math.floor(diffDays / 15);
                  let totalInterestAccumulated = 0;
                  const historyEntries = [];

                  for (let i = 1; i <= periods; i++) {
                      const interestAmount = loan.balance * loan.rate;
                      totalInterestAccumulated += interestAmount;
                      historyEntries.push({
                          type: 'interes',
                          amount: interestAmount,
                          date: new Date().toLocaleString(),
                          text: `Interés acumulado periodo ${i}:
  +$${interestAmount.toFixed(2)}`
                      });
                  }

                  if (totalInterestAccumulated > 0) {
                      const newBalance = loan.balance +
  totalInterestAccumulated;
                      const newHistory = [...(loan.history || []),
  ...historyEntries];

                      try {
                          await setDoc(doc(db, "loans", loan.id), {
                              ...loan,
                              balance: newBalance,
                              lastInterestDate: todayStr,
                              history: newHistory
                          });
                          await addActivity(`Intereses acumulados
  (${periods} periodos) aplicados a ${loan.client}:
  +$${totalInterestAccumulated.toFixed(2)}`);
                      } catch (error) {
                          console.error("Error al aplicar intereses:",
  error);
                      }
                  }
              }
          }
      }

      // --- Otras Funciones ---
      async function addActivity(msg) {
          const id = Date.now().toString();
          try {
              await setDoc(doc(db, "activities", id), { text: msg, date: new
  Date().toLocaleString() });
          } catch (e) { console.error("Error actividad:", e); }
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

      // Eventos de Formularios y Modales
      if (loanForm) {
          loanForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const id = Date.now().toString();
              const newLoan = {
                  client: document.getElementById('client-name').value,
                  initialAmount:
  parseFloat(document.getElementById('loan-amount').value),
                  balance:
  parseFloat(document.getElementById('loan-amount').value),
                  rate:
  parseFloat(document.getElementById('interest-rate').value),
                  date: document.getElementById('loan-date').value,
                  lastInterestDate: new Date().toISOString().split('T')[0],
                  history: [{
                      type: 'creacion',
                      amount:
  parseFloat(document.getElementById('loan-amount').value),
                      date: new Date().toLocaleString(),
                      text: `Préstamo creado por
  $${parseFloat(document.getElementById('loan-amount').value).toFixed(2)}`
                  }]
              };
              try {
                  await setDoc(doc(db, "loans", id), newLoan);
                  await addActivity(`Nuevo préstamo creado para
  ${newLoan.client} por $${newLoan.initialAmount.toFixed(2)}`);
                  loanForm.reset();
                  alert('Préstamo creado exitosamente');
              } catch (error) {
                  alert("Error al guardar en Firebase");
              }
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
              } catch (error) { alert("Error al guardar el abono"); }
          });
      }

      window.deleteLoan = async (id) => {
          if (confirm('¿Estás seguro?')) {
              try {
                  await deleteDoc(doc(db, "loans", id));
                  alert("Eliminado");
              } catch (e) { alert("Error"); }
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

      if (searchInput) {
          searchInput.addEventListener('input', (e) =>
  renderLoans(e.target.value));
      }

      updateDate();
  });