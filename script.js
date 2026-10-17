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

document.addEventListener('DOMContentLoaded'), async () => {

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
    const detailHistoryList = document.getElementById('detail-history-list');

    // --- Cargar datos desde Firebase en tiempo real ---
    // Escuchar préstamos
    onSnapshot(collection(db, "loans"), (snapshot) => {
        loans = [];
        loanHistories = {};

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            loans.push({
                id: docSnap.id,
                ...data
            });
            if (data.history) {
                loanHistories[docSnap.id] = data.history;
            }
        });

        updateDashboard();
        renderLoans(searchInput.value);
    });

    // Escuchar actividades
    const activitiesQuery = query(collection(db, "activities"), orderBy("date", "desc"), limit(20));
    onSnapshot(activitiesQuery, (snapshot) => {
        activities = [];
        snapshot.forEach((docSnap) => {
            activities.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        renderActivities();
    });

    // --- Inicialización ---
    updateDate();
    processAutomaticInterests();

    // --- Navegación ---
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const sectionId = btn.getAttribute('data-section');
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
            sectionTitle.innerText = btn.innerText.trim();
        });
    });

    // --- Gestión de Préstamos ---
    loanForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = Date.now().toString();
        const newLoan = {
            client: document.getElementById('client-name').value,
            initialAmount: parseFloat(document.getElementById('loan-amount').value),
            balance: parseFloat(document.getElementById('loan-amount').value),
            rate: parseFloat(document.getElementById('interest-rate').value),
            date: document.getElementById('loan-date').value,
            lastInterestDate: new Date().toISOString().split('T')[0],
            history: [{
                type: 'creacion',
                amount: parseFloat(document.getElementById('loan-amount').value),
                date: new Date().toLocaleString(),
                text: `Préstamo creado por $${parseFloat(document.getElementById('loan-amount').value).toFixed(2)}`
            }]
        };

        try {
            await setDoc(doc(db, "loans", id), newLoan);
            await addActivity(`Nuevo préstamo creado para ${newLoan.client} por $${newLoan.initialAmount.toFixed(2)}`);
            loanForm.reset();
            alert('Préstamo creado exitosamente');
        } catch (error) {
            console.error("Error al crear préstamo:", error);
            alert("Error al guardar el préstamo");
        }
    });

    // --- Gestión de Abonos ---
    window.openPaymentModal = (id) => {
        const loan = loans.find(l => l.id === id);
        if (!loan) return;
        document.getElementById('payment-loan-id').value = id;
        document.getElementById('modal-client-name').innerText = `Cliente: ${loan.client}`;
        paymentModal.classList.add('active');
    };

    document.getElementById('close-modal').addEventListener('click', () => {
        paymentModal.classList.remove('active');
    });

    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('payment-loan-id').value;
        const amount = parseFloat(document.getElementById('payment-amount').value);

        const loan = loans.find(l => l.id === id);
        if (!loan) return;

        const newBalance = loan.balance - amount;
        const newHistory = [...(loan.history || [])];
        newHistory.push({
            type: 'abono',
            amount: -amount,
            date: new Date().toLocaleString(),
            text: `Abono realizado: -$${amount.toFixed(2)}`
        });

        try {
            await setDoc(doc(db, "loans", id), {
                ...loan,
                balance: newBalance,
                history: newHistory
            });
            await addActivity(`Abono de $${amount.toFixed(2)} realizado a ${loan.client}`);
            paymentModal.classList.remove('active');
            paymentForm.reset();
        } catch (error) {
            console.error("Error al realizar abono:", error);
            alert("Error al guardar el abono");
        }
    });

    window.deleteLoan = async (id) => {
        if (confirm('¿Estás seguro de eliminar este préstamo?')) {
            const loan = loans.find(l => l.id === id);
            try {
                await deleteDoc(doc(db, "loans", id));
                await addActivity(`Préstamo de ${loan.client} eliminado`);
            } catch (error) {
                console.error("Error al eliminar:", error);
                alert("Error al eliminar el préstamo");
            }
        }
    };

    // --- Detalle del Préstamo ---
    window.viewLoanDetail = (id) => {
        const loan = loans.find(l => l.id === id);
        if (!loan) return;

        const history = loan.history || [];

        document.getElementById('detail-client-name').innerText = `Cliente: ${loan.client}`;
        document.getElementById('detail-initial').innerText = `$${loan.initialAmount.toFixed(2)}`;
        document.getElementById('detail-rate').innerText = `${(loan.rate * 100)}%`;
        document.getElementById('detail-balance').innerText = `$${loan.balance.toFixed(2)}`;

        detailHistoryList.innerHTML = '';
        history.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span><span class="type-${item.type}">${item.text}</span></span>
                <span class="date">${item.date}</span>
            `;
            detailHistoryList.appendChild(li);
        });

        detailModal.classList.add('active');
    };

    document.getElementById('close-detail').addEventListener('click', () => {
        detailModal.classList.remove('active');
    });

    // --- Lógica de Intereses Automáticos ---
    async function processAutomaticInterests() {
        const today = new Date();
        const day = today.getDate();
        const todayStr = today.toISOString().split('T')[0];

        if (day === 15 || day === 30 || day === 31) {
            for (const loan of loans) {
                if (loan.lastInterestDate !== todayStr) {
                    const interestAmount = loan.balance * loan.rate;
                    const newBalance = loan.balance + interestAmount;
                    const newHistory = [...(loan.history || [])];
                    newHistory.push({
                        type: 'interes',
                        amount: interestAmount,
                        date: new Date().toLocaleString(),
                        text: `Interés ${(loan.rate * 100)}%: +$${interestAmount.toFixed(2)}`
                    });

                    try {
                        await setDoc(doc(db, "loans", loan.id), {
                            ...loan,
                            balance: newBalance,
                            lastInterestDate: todayStr,
                            history: newHistory
                        });
                        await addActivity(`Interés del ${(loan.rate * 100)}% aplicado a ${loan.client}: +$${interestAmount.toFixed(2)}`);
                    } catch (error) {
                        console.error("Error al aplicar interés:", error);
                    }
                }
            }
        }
    }

    // --- Utilidades ---
    async function addActivity(msg) {
        const id = Date.now().toString();
        const entry = {
            text: msg,
            date: new Date().toLocaleString()
        };
        try {
            await setDoc(doc(db, "activities", id), entry);
        } catch (error) {
            console.error("Error al guardar actividad:", error);
        }
    }

    function updateDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', options);
    }

    function updateDashboard() {
        const total = loans.reduce((sum, l) => sum + (l.balance || 0), 0);
        const activeClients = loans.length;
        document.getElementById('stat-total-amount').innerText = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        document.getElementById('stat-active-clients').innerText = activeClients;
        const pending = loans.reduce((sum, l) => sum + ((l.balance || 0) * (l.rate || 0)), 0);
        document.getElementById('stat-pending-interest').innerText = `$${pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    function renderLoans(filter = '') {
        loansTbody.innerHTML = '';
        const filteredLoans = loans.filter(l => l.client.toLowerCase().includes(filter.toLowerCase()));

        filteredLoans.forEach(loan => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${loan.client}</strong></td>
                <td>${loan.date}</td>
                <td>$${loan.initialAmount.toFixed(2)}</td>
                <td style="color: ${loan.balance > 0 ? 'var(--text-main)' : 'var(--success)'}">
                    $${loan.balance.toFixed(2)}
                </td>
                <td>${(loan.rate * 100)}%</td>
                <td>
                    <button class="btn-action btn-pay" onclick="openPaymentModal('${loan.id}')">
                        <i class="fa-solid fa-hand-holding-dollar"></i> Abono
                    </button>
                    <button class="btn-action" style="background:#e0e7ff; color:#4338ca;" onclick="viewLoanDetail('${loan.id}')">
                        <i class="fa-solid fa-eye"></i> Detalle
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteLoan('${loan.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            loansTbody.appendChild(tr);
        });

        if (filteredLoans.length === 0) {
            loansTbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No se encontraron préstamos.</td></tr>';
        }
    }

    function renderActivities() {
        activityLog.innerHTML = '';
        if (activities.length === 0) {
            activityLog.innerHTML = '<p class="empty-msg">No hay actividad reciente.</p>';
            return;
        }

        activities.forEach(act => {
            const div = document.createElement('div');
            div.className = 'activity-item';
            div.innerHTML = `
                <span>${act.text}</span>
                <span class="date">${act.date}</span>
            `;
            activityLog.appendChild(div);
        });
    }

    searchInput.addEventListener('input', (e) => {
        renderLoans(e.target.value);
    });
};