document.addEventListener('DOMContentLoaded', () => {
    // --- Estado de la aplicación ---
    let loans = JSON.parse(localStorage.getItem('loans')) || [];
    let activities = JSON.parse(localStorage.getItem('loan_activities')) || [];
    // Nueva estructura para guardar el historial detallado de cada préstamo
    let loanHistories = JSON.parse(localStorage.getItem('loan_histories')) || {};

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

    // Elementos Modal Detalle
    const detailModal = document.getElementById('detail-modal');
    const detailHistoryList = document.getElementById('detail-history-list');

    // --- Inicialización ---
    updateDate();
    processAutomaticInterests();
    updateDashboard();
    renderLoans();
    renderActivities();

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
    loanForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const newLoan = {
            id: Date.now(),
            client: document.getElementById('client-name').value,
            initialAmount: parseFloat(document.getElementById('loan-amount').value),
            balance: parseFloat(document.getElementById('loan-amount').value),
            rate: parseFloat(document.getElementById('interest-rate').value),
            date: document.getElementById('loan-date').value,
            lastInterestDate: new Date().toISOString().split('T')[0]
        };

        loans.push(newLoan);

        // Inicializar historial para este préstamo
        loanHistories[newLoan.id] = [{
            type: 'creacion',
            amount: newLoan.initialAmount,
            date: new Date().toLocaleString(),
            text: `Préstamo creado por $${newLoan.initialAmount.toFixed(2)}`
        }];

        saveData();
        addActivity(`Nuevo préstamo creado para ${newLoan.client} por $${newLoan.initialAmount.toFixed(2)}`);
        loanForm.reset();
        alert('Préstamo creado exitosamente');
        updateDashboard();
        renderLoans();
        renderActivities();
    });

    // --- Gestión de Abonos ---
    window.openPaymentModal = (id) => {
        const loan = loans.find(l => l.id === id);
        document.getElementById('payment-loan-id').value = id;
        document.getElementById('modal-client-name').innerText = `Cliente: ${loan.client}`;
        paymentModal.classList.add('active');
    };

    document.getElementById('close-modal').addEventListener('click', () => {
        paymentModal.classList.remove('active');
    });

    paymentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('payment-loan-id').value);
        const amount = parseFloat(document.getElementById('payment-amount').value);

        const loanIndex = loans.findIndex(l => l.id === id);
        if (loanIndex !== -1) {
            const loan = loans[loanIndex];
            loan.balance -= amount;

            // Agregar al historial detallado
            if (!loanHistories[id]) loanHistories[id] = [];
            loanHistories[id].push({
                type: 'abono',
                amount: -amount,
                date: new Date().toLocaleString(),
                text: `Abono realizado: -$${amount.toFixed(2)}`
            });

            addActivity(`Abono de $${amount.toFixed(2)} realizado a ${loan.client}`);
            saveData();
            paymentModal.classList.remove('active');
            paymentForm.reset();
            updateDashboard();
            renderLoans();
            renderActivities();
        }
    });

    window.deleteLoan = (id) => {
        if (confirm('¿Estás seguro de eliminar este préstamo?')) {
            const loan = loans.find(l => l.id === id);
            addActivity(`Préstamo de ${loan.client} eliminado`);
            loans = loans.filter(l => l.id !== id);
            delete loanHistories[id];
            saveData();
            updateDashboard();
            renderLoans();
            renderActivities();
        }
    };

    // --- Detalle del Préstamo ---
    window.viewLoanDetail = (id) => {
        const loan = loans.find(l => l.id === id);
        const history = loanHistories[id] || [];

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
    function processAutomaticInterests() {
        const today = new Date();
        const day = today.getDate();
        const todayStr = today.toISOString().split('T')[0];

        if (day === 15 || day === 30 || (day === 31)) {
            let interestAppliedCount = 0;

            loans.forEach(loan => {
                if (loan.lastInterestDate !== todayStr) {
                    const interestAmount = loan.balance * loan.rate;
                    loan.balance += interestAmount;
                    loan.lastInterestDate = todayStr;
                    interestAppliedCount++;

                    // Agregar al historial detallado
                    if (!loanHistories[loan.id]) loanHistories[loan.id] = [];
                    loanHistories[loan.id].push({
                        type: 'interes',
                        amount: interestAmount,
                        date: new Date().toLocaleString(),
                        text: `Interés ${(loan.rate * 100)}%: +$${interestAmount.toFixed(2)}`
                    });

                    addActivity(`Interés del ${(loan.rate * 100)}% aplicado a ${loan.client}: +$${interestAmount.toFixed(2)}`);
                }
            });

            if (interestAppliedCount > 0) {
                saveData();
                updateDashboard();
                renderLoans();
                renderActivities();
            }
        }
    }

    // --- Utilidades ---
    function saveData() {
        localStorage.setItem('loans', JSON.stringify(loans));
        localStorage.setItem('loan_activities', JSON.stringify(activities));
        localStorage.setItem('loan_histories', JSON.stringify(loanHistories));
    }

    function addActivity(msg) {
        const entry = {
            id: Date.now(),
            text: msg,
            date: new Date().toLocaleString()
        };
        activities.unshift(entry);
        if (activities.length > 20) activities.pop();
        saveData();
    }

    function updateDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', options);
    }

    function updateDashboard() {
        const total = loans.reduce((sum, l) => sum + l.balance, 0);
        const activeClients = loans.length;
        document.getElementById('stat-total-amount').innerText = `$${total.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        document.getElementById('stat-active-clients').innerText = activeClients;
        const pending = loans.reduce((sum, l) => sum + (l.balance * l.rate), 0);
        document.getElementById('stat-pending-interest').innerText = `$${pending.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
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
                    <button class="btn-action btn-pay" onclick="openPaymentModal(${loan.id})">
                        <i class="fa-solid fa-hand-holding-dollar"></i> Abono
                    </button>
                    <button class="btn-action" style="background:#e0e7ff; color:#4338ca;" onclick="viewLoanDetail(${loan.id})">
                        <i class="fa-solid fa-eye"></i> Detalle
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteLoan(${loan.id})">
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
});
