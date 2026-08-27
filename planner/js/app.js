// StudyFlow - Application State Management & UI Controller

// Default State Configuration for the first load
const DEFAULT_STATE = {
  weeklyTemplate: {
    // 24 hours (0-23) for Monday (0) to Sunday (6)
    0: Array(24).fill('empty'), // Seg
    1: Array(24).fill('empty'), // Ter
    2: Array(24).fill('empty'), // Qua
    3: Array(24).fill('empty'), // Qui
    4: Array(24).fill('empty'), // Sex
    5: Array(24).fill('empty'), // Sáb
    6: Array(24).fill('empty')  // Dom
  },
  currentDayIndex: 0, // Mon = 0
  legendType: 'empty', // Default paint brush
  overrideDays: {}, // 'YYYY-MM-DD': { freeHours: N, reason: 'str' }
  disciplines: [
    { id: '1', name: 'Contabilidade Geral', hoursGoal: 10, questionsGoal: 100, priority: 'high' },
    { id: '2', name: 'Direito Administrativo', hoursGoal: 8, questionsGoal: 80, priority: 'medium' },
    { id: '3', name: 'Língua Portuguesa', hoursGoal: 6, questionsGoal: 60, priority: 'medium' },
    { id: '4', name: 'Raciocínio Lógico', hoursGoal: 4, questionsGoal: 40, priority: 'low' }
  ],
  currentCycle: {
    id: 'cycle-default',
    name: 'Ciclo Inicial - Preparação de Rotina',
    days: 7,
    start: '', // Will be set to today
    end: '',   // Will be set to today + 7 days
    hoursGoal: 28,
    questionsGoal: 280,
    active: true
  },
  studySessions: [], // Session history
  cycleHistory: [] // Previous cycle summaries
};

// Initialize default template slots to represent a normal day
// Work: 8-12 (4h) and 13-17 (4h) on Mon-Fri (0-4)
// Rest: 0-6 (7h) and 23-24 (1h) daily
// Gym: 18-19 (2h) on Mon, Wed, Fri
for (let day = 0; day < 5; day++) {
  // Mon-Fri
  for (let h = 0; h <= 6; h++) DEFAULT_STATE.weeklyTemplate[day][h] = 'rest';
  DEFAULT_STATE.weeklyTemplate[day][23] = 'rest';
  
  for (let h = 8; h <= 11; h++) DEFAULT_STATE.weeklyTemplate[day][h] = 'work';
  for (let h = 13; h <= 16; h++) DEFAULT_STATE.weeklyTemplate[day][h] = 'work';
  
  if (day === 0 || day === 2 || day === 4) {
    DEFAULT_STATE.weeklyTemplate[day][18] = 'gym';
    DEFAULT_STATE.weeklyTemplate[day][19] = 'gym';
  } else {
    DEFAULT_STATE.weeklyTemplate[day][18] = 'random'; // Random activities
  }
}
// Sat-Sun (5-6)
for (let day = 5; day <= 6; day++) {
  for (let h = 0; h <= 7; h++) DEFAULT_STATE.weeklyTemplate[day][h] = 'rest';
  for (let h = 22; h <= 23; h++) DEFAULT_STATE.weeklyTemplate[day][h] = 'rest';
  
  if (day === 5) {
    DEFAULT_STATE.weeklyTemplate[day][10] = 'gym';
    DEFAULT_STATE.weeklyTemplate[day][11] = 'gym';
    DEFAULT_STATE.weeklyTemplate[day][15] = 'random';
    DEFAULT_STATE.weeklyTemplate[day][16] = 'random';
  } else {
    DEFAULT_STATE.weeklyTemplate[day][12] = 'random';
    DEFAULT_STATE.weeklyTemplate[day][13] = 'random';
  }
}

// Global Application State variable
let state = {};

// Load State from LocalStorage
function loadState() {
  const saved = localStorage.getItem('studyflow_state');
  if (saved) {
    try {
      state = JSON.parse(saved);
      // Ensure all required fields exist
      if (!state.weeklyTemplate) state.weeklyTemplate = DEFAULT_STATE.weeklyTemplate;
      if (state.currentDayIndex === undefined) state.currentDayIndex = 0;
      if (!state.legendType) state.legendType = 'empty';
      if (!state.overrideDays) state.overrideDays = {};
      if (!state.disciplines) state.disciplines = [];
      if (!state.studySessions) state.studySessions = [];
      if (!state.cycleHistory) state.cycleHistory = [];
    } catch (e) {
      console.error("Erro ao carregar estado do localStorage, usando padrões.", e);
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  } else {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    // Set dates for default cycle based on current date
    const today = new Date();
    state.currentCycle.start = formatDate(today);
    const end = new Date();
    end.setDate(today.getDate() + 7);
    state.currentCycle.end = formatDate(end);
    saveState();
  }
}

// Save State to LocalStorage
function saveState() {
  localStorage.setItem('studyflow_state', JSON.stringify(state));
}

// Helper to format Date as YYYY-MM-DD
function formatDate(date) {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}

// Helper to format Date for pt-BR display (DD/MM/YYYY)
function displayDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// SPA Navigation (Switch Tabs)
function switchTab(tabName) {
  // Deactivate all nav items
  document.querySelectorAll('.nav-item, .planner-horizontal-nav-item').forEach(item => {
    item.classList.remove('active');
  });
  // Deactivate all views
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });

  // Activate selected nav item and view
  const navItem = document.getElementById(`nav-${tabName}`);
  const viewSection = document.getElementById(`view-${tabName}`);
  if (navItem && viewSection) {
    navItem.classList.add('active');
    viewSection.classList.add('active');
  }

  // Update dynamic content based on view
  if (tabName === 'dashboard') {
    renderDashboard();
  } else if (tabName === 'cycle') {
    renderCycleView();
  } else if (tabName === 'metrics') {
    renderMetricsView();
  }
}

// ==================== DASHBOARD & SCHEDULE LOGIC ====================

// Select Day of the Week in Schedule Planner
function selectScheduleDay(dayIndex) {
  state.currentDayIndex = dayIndex;
  
  // Highlight active button
  const daySelector = document.getElementById('schedule-day-selector');
  const buttons = daySelector.getElementsByTagName('button');
  for (let i = 0; i < buttons.length; i++) {
    if (i === dayIndex) {
      buttons[i].classList.add('active');
    } else {
      buttons[i].classList.remove('active');
    }
  }

  renderCalendar();
  updateDashboardInsights();
}

// Select category brush from legend
function selectLegendType(type) {
  state.legendType = type;
  
  // Highlight selected legend item
  const legendItems = document.getElementById('schedule-legend').querySelectorAll('.legend-item');
  legendItems.forEach(item => {
    if (item.dataset.type === type) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// Drag paint state tracking
let isMouseDown = false;

// Render 24-hour visual calendar
function renderCalendar() {
  const container = document.getElementById('hours-timeline');
  container.innerHTML = '';

  const daySchedule = state.weeklyTemplate[state.currentDayIndex] || Array(24).fill('empty');
  
  const translations = {
    empty: 'Horário Vazio (Disponível para Estudo)',
    work: 'Trabalho / Emprego',
    gym: 'Academia / Atividade Física',
    rest: 'Descanso / Sono',
    random: 'Compromisso Aleatório / Consulta',
    study: 'Horário Reservado Exclusivo para Estudo'
  };

  for (let hour = 0; hour < 24; hour++) {
    const activityType = daySchedule[hour] || 'empty';
    
    const row = document.createElement('div');
    row.className = 'hour-row';

    const label = document.createElement('div');
    label.className = 'hour-label';
    label.textContent = `${String(hour).padStart(2, '0')}:00`;

    const block = document.createElement('div');
    block.className = `hour-block ${activityType}`;
    block.textContent = translations[activityType];
    block.dataset.hour = hour;

    // Click to paint single block
    block.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isMouseDown = true;
      paintBlock(hour);
    });

    // Enter to paint while dragging
    block.addEventListener('mouseenter', () => {
      if (isMouseDown) {
        paintBlock(hour);
      }
    });

    row.appendChild(label);
    row.appendChild(block);
    container.appendChild(row);
  }
}

// Paint specific hour block with selected type
function paintBlock(hour) {
  if (!state.weeklyTemplate[state.currentDayIndex]) {
    state.weeklyTemplate[state.currentDayIndex] = Array(24).fill('empty');
  }
  state.weeklyTemplate[state.currentDayIndex][hour] = state.legendType;
  saveState();
  
  // Re-render calendar and recalculate everything
  renderCalendar();
  updateSchedulesSummary();
  updateDashboardInsights();
  updateHeaderQuickStats();
}

// Calculate total hours by type per week
function calculateWeeklyHours() {
  const totals = { work: 0, gym: 0, rest: 0, random: 0, study: 0, empty: 0 };
  
  for (let day = 0; day < 7; day++) {
    const daySchedule = state.weeklyTemplate[day] || Array(24).fill('empty');
    daySchedule.forEach(slot => {
      if (totals[slot] !== undefined) {
        totals[slot]++;
      }
    });
  }
  
  return totals;
}

// Calculate remaining potential study hours for a specific week day
function getPotentialStudyHoursOfDay(dayIndex) {
  const daySchedule = state.weeklyTemplate[dayIndex] || Array(24).fill('empty');
  let potentialHours = 0;
  daySchedule.forEach(slot => {
    // Both 'empty' slots and direct 'study' slots count as study potential
    if (slot === 'empty' || slot === 'study') {
      potentialHours++;
    }
  });
  return potentialHours;
}

// Update the top 4 status cards with weekly aggregates
function updateSchedulesSummary() {
  const totals = calculateWeeklyHours();
  
  document.getElementById('summary-work-hours').textContent = `${totals.work.toFixed(1)}h`;
  document.getElementById('summary-rest-hours').textContent = `${totals.rest.toFixed(1)}h`;
  
  // Combine Gym & Random as "Academia & Outros"
  const gymAndRandom = totals.gym + totals.random;
  document.getElementById('summary-gym-hours').textContent = `${gymAndRandom.toFixed(1)}h`;
  
  // Study Potential is Empty slots + direct Study slots
  const potentialStudy = totals.empty + totals.study;
  document.getElementById('summary-study-hours').textContent = `${potentialStudy.toFixed(1)}h / sem`;
}

// Update the overview insights card on Dashboard
function updateDashboardInsights() {
  const todayPotential = getPotentialStudyHoursOfDay(state.currentDayIndex);
  const dayNames = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const dayName = dayNames[state.currentDayIndex];
  
  const container = document.getElementById('day-insight-content');
  
  let html = `<p style="margin-bottom: 0.75rem;">Para <strong>${dayName}</strong>, sua rotina tem:</p>`;
  html += `<ul>`;
  
  const daySchedule = state.weeklyTemplate[state.currentDayIndex] || Array(24).fill('empty');
  const dayTotals = { work: 0, gym: 0, rest: 0, random: 0, study: 0, empty: 0 };
  daySchedule.forEach(slot => dayTotals[slot]++);
  
  if (dayTotals.work > 0) html += `<li>💼 Trabalho: ${dayTotals.work}h</li>`;
  if (dayTotals.gym > 0) html += `<li>💪 Academia: ${dayTotals.gym}h</li>`;
  if (dayTotals.rest > 0) html += `<li>💤 Sono/Descanso: ${dayTotals.rest}h</li>`;
  if (dayTotals.random > 0) html += `<li>🎈 Compromissos/Outros: ${dayTotals.random}h</li>`;
  if (dayTotals.study > 0) html += `<li>🎯 Estudo Reservado: ${dayTotals.study}h</li>`;
  html += `</ul>`;
  
  html += `<p style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
    🔍 <strong>Potencial Real de Estudo:</strong> Sobram <span style="color: var(--secondary); font-weight: 700; font-size:1.15rem;">${todayPotential}h</span> para você dedicar aos seus estudos.
  </p>`;
  
  if (todayPotential === 0) {
    html += `<p style="margin-top: 0.5rem; color: var(--danger); font-size: 0.85rem;">
      ⚠️ Sua agenda deste dia está completamente lotada! Se precisar estudar, lembre-se de que é possível aproveitar brechas no horário de trabalho ou transporte.
    </p>`;
  } else if (todayPotential < 2) {
    html += `<p style="margin-top: 0.5rem; color: var(--warning); font-size: 0.85rem;">
      💡 Dia apertado! Tente focar em revisões rápidas ou resolver algumas questões nas brechas.
    </p>`;
  } else {
    html += `<p style="margin-top: 0.5rem; color: var(--success); font-size: 0.85rem;">
      🚀 Excelente! Você tem um ótimo bloco de horas livres. Planeje sessões focadas de teoria e prática!
    </p>`;
  }
  
  container.innerHTML = html;
}

// Render Dashboard main view
function renderDashboard() {
  updateSchedulesSummary();
  renderCalendar();
  updateDashboardInsights();
  updateHeaderQuickStats();
}

// Update header widgets
function updateHeaderQuickStats() {
  // Today's Date representation in Week
  const today = new Date();
  // Mon-Sun format index (in JS: Sun=0, Mon=1... -> convert to Mon=0, Tue=1... Sun=6)
  let jsDay = today.getDay();
  let indexMonSun = jsDay === 0 ? 6 : jsDay - 1;
  
  // Check if today has override
  const todayStr = formatDate(today);
  let todayFree = 0;
  if (state.overrideDays && state.overrideDays[todayStr] !== undefined) {
    todayFree = state.overrideDays[todayStr].freeHours;
  } else {
    todayFree = getPotentialStudyHoursOfDay(indexMonSun);
  }
  
  document.getElementById('quick-free-hours').textContent = `${todayFree.toFixed(1)}h`;
  
  // Cycle progress percentage
  if (state.currentCycle && state.currentCycle.active) {
    const progress = calculateCycleProgressInfo();
    document.getElementById('quick-cycle-progress').textContent = `${progress.percent}%`;
  } else {
    document.getElementById('quick-cycle-progress').textContent = 'N/A';
  }
}

// Global Mouse Up Listener for Drag Painting
window.addEventListener('mouseup', () => {
  isMouseDown = false;
});

// ==================== CYCLE LOGIC ====================

// Calculate cycle metrics (hours, questions, completion %)
function calculateCycleProgressInfo() {
  if (!state.currentCycle) return { percent: 0, hoursStudy: 0, questionsDone: 0, correct: 0, accuracy: 0 };
  
  const cycle = state.currentCycle;
  
  // Filter sessions that fall within cycle dates
  const cycleSessions = state.studySessions.filter(s => {
    return s.date >= cycle.start && s.date <= cycle.end;
  });
  
  let hoursStudy = 0;
  let questionsDone = 0;
  let correct = 0;
  
  cycleSessions.forEach(s => {
    hoursStudy += s.duration || 0;
    questionsDone += s.questions || 0;
    correct += s.correct || 0;
  });
  
  const accuracy = questionsDone > 0 ? Math.round((correct / questionsDone) * 100) : 0;
  
  // Composite progress percentage based on study hours vs cycle hours goal
  const progressRatio = cycle.hoursGoal > 0 ? (hoursStudy / cycle.hoursGoal) : 0;
  const percent = Math.min(100, Math.round(progressRatio * 100));
  
  return {
    percent,
    hoursStudy,
    questionsDone,
    correct,
    accuracy,
    sessionsCount: cycleSessions.length
  };
}

// Render the Study Cycle View (Tab 2)
function renderCycleView() {
  const cycle = state.currentCycle;
  const progressInfo = calculateCycleProgressInfo();
  
  const titleText = document.getElementById('cycle-title-text');
  const datesText = document.getElementById('cycle-dates-text');
  const btnEndCycle = document.getElementById('btn-end-cycle');
  
  if (cycle && cycle.active) {
    titleText.innerHTML = `<span style="color: var(--secondary)">${cycle.name}</span>`;
    datesText.textContent = `Duração: ${cycle.days} dias | De ${displayDate(cycle.start)} até ${displayDate(cycle.end)}`;
    btnEndCycle.style.display = 'inline-flex';
    
    // Calculate days elapsed
    const today = new Date();
    const start = new Date(cycle.start);
    const end = new Date(cycle.end);
    
    // Difference in days
    const diffTime = today - start;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const elapsed = Math.max(0, Math.min(cycle.days, diffDays));
    
    document.getElementById('cycle-days-elapsed').textContent = `Dia ${elapsed} de ${cycle.days} do Ciclo`;
    document.getElementById('cycle-progress-percent').textContent = `${progressInfo.percent}% de Horas Concluído`;
    document.getElementById('cycle-progress-bar').style.width = `${progressInfo.percent}%`;
    
    document.getElementById('cycle-hours-value').textContent = `${progressInfo.hoursStudy.toFixed(1)}h / ${cycle.hoursGoal}h`;
    document.getElementById('cycle-questions-value').textContent = `${progressInfo.questionsDone} q. (${progressInfo.correct} acertos)`;
    document.getElementById('cycle-accuracy-value').textContent = `${progressInfo.accuracy}%`;
    
    // Render Disciplines Cards
    renderDisciplinesList(cycleSessionsInPeriod(cycle.start, cycle.end));
    
    // Render Goals Checklist
    renderGoalsChecklist(progressInfo);
  } else {
    titleText.textContent = 'Nenhum Ciclo Ativo';
    datesText.textContent = 'Crie e configure um ciclo para começar a monitorar seus estudos.';
    btnEndCycle.style.display = 'none';
    
    document.getElementById('cycle-days-elapsed').textContent = 'Dia 0 de 0';
    document.getElementById('cycle-progress-percent').textContent = '0% Concluído';
    document.getElementById('cycle-progress-bar').style.width = '0%';
    document.getElementById('cycle-hours-value').textContent = '0h / 0h';
    document.getElementById('cycle-questions-value').textContent = '0 resolvidas';
    document.getElementById('cycle-accuracy-value').textContent = '0%';
    
    document.getElementById('disciplines-list').innerHTML = `
      <div style="grid-column: span 2; text-align: center; padding: 2rem; color: var(--text-secondary);">
        Nenhum ciclo ativo no momento. Adicione disciplinas e clique em "Configurar Novo Ciclo" acima!
      </div>`;
      
    document.getElementById('checklist-container').innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
        Nenhum checklist de metas disponível sem um ciclo ativo.
      </div>`;
  }
}

// Helper to filter study sessions for a date range
function cycleSessionsInPeriod(start, end) {
  return state.studySessions.filter(s => s.date >= start && s.date <= end);
}

// Render the list of disciplines inside the Cycle View
function renderDisciplinesList(cycleSessions) {
  const container = document.getElementById('disciplines-list');
  container.innerHTML = '';
  
  if (state.disciplines.length === 0) {
    container.innerHTML = `
      <div style="grid-column: span 2; text-align: center; padding: 2rem; color: var(--text-secondary);">
        Nenhuma disciplina cadastrada. Cadastre disciplinas para criar metas específicas!
      </div>`;
    return;
  }
  
  state.disciplines.forEach(subject => {
    // Find hours and questions done for this subject in current cycle
    const subjectSessions = cycleSessions.filter(s => s.subjectId === subject.id);
    let hoursDone = 0;
    let qDone = 0;
    let qCorrect = 0;
    
    subjectSessions.forEach(s => {
      hoursDone += s.duration || 0;
      qDone += s.questions || 0;
      qCorrect += s.correct || 0;
    });
    
    const acc = qDone > 0 ? Math.round((qCorrect / qDone) * 100) : 0;
    
    // Calculate progress ratio
    const hoursGoal = subject.hoursGoal || 1;
    const progressPercent = Math.min(100, Math.round((hoursDone / hoursGoal) * 100));
    
    const card = document.createElement('div');
    card.className = 'discipline-card';
    
    // Priority translation
    const priorityLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' };
    
    card.innerHTML = `
      <div class="discipline-header">
        <span class="discipline-name">${subject.name}</span>
        <span class="discipline-badge ${subject.priority}">${priorityLabels[subject.priority]}</span>
      </div>
      <div class="discipline-stats">
        <span>Horas: <strong>${hoursDone.toFixed(1)}h</strong> / ${hoursGoal}h</span>
        <span>Questões: <strong>${qDone}</strong> / ${subject.questionsGoal || 0}</span>
      </div>
      <div class="progress-bar-wrapper" style="margin-bottom:0;">
        <div class="progress-bar-outer" style="height:6px;">
          <div class="progress-bar-inner" style="width: ${progressPercent}%; background: linear-gradient(90deg, var(--secondary) 0%, var(--success) 100%);"></div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
        <span style="font-size:0.75rem; color: var(--text-secondary)">Aproveitamento: <strong style="color:var(--success)">${acc}%</strong></span>
        <button class="btn btn-secondary btn-sm btn-icon-only" onclick="openEditDisciplineModal('${subject.id}')" title="Editar Metas">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:2;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
      </div>
    `;
    
    container.appendChild(card);
  });
}

// Render the targets/goals checklist inside the Cycle View
function renderGoalsChecklist(progressInfo) {
  const container = document.getElementById('checklist-container');
  container.innerHTML = '';
  
  const cycle = state.currentCycle;
  if (!cycle) return;
  
  const checkList = [];
  
  // 1. General Hours Target
  checkList.push({
    text: `Bater a meta de horas gerais do ciclo: ${progressInfo.hoursStudy.toFixed(1)}h / ${cycle.hoursGoal}h`,
    meta: `${Math.round(Math.min(100, (progressInfo.hoursStudy / cycle.hoursGoal) * 100))}%`,
    checked: progressInfo.hoursStudy >= cycle.hoursGoal
  });
  
  // 2. General Questions Target
  checkList.push({
    text: `Resolver a meta de questões do ciclo: ${progressInfo.questionsDone} / ${cycle.questionsGoal} questões`,
    meta: `${Math.round(Math.min(100, (progressInfo.questionsDone / cycle.questionsGoal) * 100))}%`,
    checked: progressInfo.questionsDone >= cycle.questionsGoal
  });
  
  // 3. General Accuracy Target (>=70%)
  checkList.push({
    text: `Manter aproveitamento médio geral acima de 70% (Atual: ${progressInfo.accuracy}%)`,
    meta: 'Rendimento',
    checked: progressInfo.accuracy >= 70 && progressInfo.questionsDone >= 10 // Minimum 10 questions to qualify
  });
  
  // 4. Discipline Specific Targets
  const cycleSessions = cycleSessionsInPeriod(cycle.start, cycle.end);
  state.disciplines.forEach(subject => {
    const subSessions = cycleSessions.filter(s => s.subjectId === subject.id);
    let hDone = 0;
    let qDone = 0;
    
    subSessions.forEach(s => {
      hDone += s.duration || 0;
      qDone += s.questions || 0;
    });
    
    checkList.push({
      text: `Estudar ${subject.name}: ${hDone.toFixed(1)}h / ${subject.hoursGoal}h`,
      meta: 'Disciplina',
      checked: hDone >= subject.hoursGoal
    });
    
    if (subject.questionsGoal > 0) {
      checkList.push({
        text: `Questões de ${subject.name}: ${qDone} / ${subject.questionsGoal} q.`,
        meta: 'Questões',
        checked: qDone >= subject.questionsGoal
      });
    }
  });
  
  checkList.forEach(item => {
    const el = document.createElement('div');
    el.className = `checklist-item ${item.checked ? 'checked' : ''}`;
    
    el.innerHTML = `
      <div class="checklist-checkbox">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <span class="checklist-text">${item.text}</span>
      <span class="checklist-meta">${item.meta}</span>
    `;
    
    container.appendChild(el);
  });
}

// Close active cycle and save to history
function confirmEndCycle() {
  if (!state.currentCycle || !state.currentCycle.active) return;
  
  if (confirm(`Tem certeza de que deseja encerrar e fechar o ciclo "${state.currentCycle.name}"? Isso moverá os resultados consolidados para o histórico.`)) {
    const progressInfo = calculateCycleProgressInfo();
    
    const cycle = state.currentCycle;
    
    // Consolidate performance per discipline for the history record
    const cycleSessions = cycleSessionsInPeriod(cycle.start, cycle.end);
    const disciplinesPerformance = state.disciplines.map(d => {
      const subSessions = cycleSessions.filter(s => s.subjectId === d.id);
      let hours = 0;
      let qDone = 0;
      let qCorr = 0;
      subSessions.forEach(s => {
        hours += s.duration || 0;
        qDone += s.questions || 0;
        qCorr += s.correct || 0;
      });
      return {
        subjectName: d.name,
        hours,
        hoursGoal: d.hoursGoal,
        questions: qDone,
        questionsGoal: d.questionsGoal,
        correct: qCorr
      };
    });
    
    const cycleRecord = {
      id: cycle.id + '_' + Date.now(),
      name: cycle.name,
      start: cycle.start,
      end: cycle.end,
      days: cycle.days,
      hoursGoal: cycle.hoursGoal,
      questionsGoal: cycle.questionsGoal,
      totalHours: progressInfo.hoursStudy,
      totalQuestions: progressInfo.questionsDone,
      totalCorrect: progressInfo.correct,
      accuracy: progressInfo.accuracy,
      disciplinesPerformance
    };
    
    state.cycleHistory.unshift(cycleRecord); // Add to the top of history
    state.currentCycle = null; // No active cycle
    saveState();
    
    // Switch to metrics to see history
    switchTab('metrics');
  }
}

// ==================== METRICS & CHARTS LOGIC ====================

let hoursChartInstance = null;
let accuracyChartInstance = null;

// Initialize Chart.js reports
function renderMetricsView() {
  renderHistoryCyclesList();
  renderSessionsLogTable();
  
  // Prep Data for Charts
  const cycle = state.currentCycle;
  
  const labels = [];
  const hoursGoalData = [];
  const hoursActualData = [];
  const accuracyData = [];
  
  if (cycle) {
    const cycleSessions = cycleSessionsInPeriod(cycle.start, cycle.end);
    
    state.disciplines.forEach(d => {
      labels.push(d.name);
      hoursGoalData.push(d.hoursGoal);
      
      const subSessions = cycleSessions.filter(s => s.subjectId === d.id);
      let h = 0;
      let q = 0;
      let c = 0;
      subSessions.forEach(s => {
        h += s.duration || 0;
        q += s.questions || 0;
        c += s.correct || 0;
      });
      
      hoursActualData.push(h);
      accuracyData.push(q > 0 ? Math.round((c / q) * 100) : 0);
    });
  } else {
    // If no active cycle, use global historical averages
    state.disciplines.forEach(d => {
      labels.push(d.name);
      hoursGoalData.push(0);
      
      const subSessions = state.studySessions.filter(s => s.subjectId === d.id);
      let h = 0;
      let q = 0;
      let c = 0;
      subSessions.forEach(s => {
        h += s.duration || 0;
        q += s.questions || 0;
        c += s.correct || 0;
      });
      
      hoursActualData.push(h);
      accuracyData.push(q > 0 ? Math.round((c / q) * 100) : 0);
    });
  }
  
  // Render Hours Chart (Goal vs Actual)
  const hoursCtx = document.getElementById('hours-chart').getContext('2d');
  if (hoursChartInstance) {
    hoursChartInstance.destroy();
  }
  hoursChartInstance = new Chart(hoursCtx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Meta de Horas',
          data: hoursGoalData,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Horas Estudadas',
          data: hoursActualData,
          backgroundColor: 'rgba(99, 102, 241, 0.65)',
          borderColor: '#6366f1',
          borderWidth: 2,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#a1a1aa' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#a1a1aa' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f4f4f5', font: { family: 'Outfit' } }
        }
      }
    }
  });

  // Render Accuracy Chart
  const accuracyCtx = document.getElementById('accuracy-chart').getContext('2d');
  if (accuracyChartInstance) {
    accuracyChartInstance.destroy();
  }
  accuracyChartInstance = new Chart(accuracyCtx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '% Aproveitamento Médio',
        data: accuracyData,
        backgroundColor: 'rgba(16, 185, 129, 0.55)',
        borderColor: '#10b981',
        borderWidth: 2,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#a1a1aa', callback: value => value + '%' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#a1a1aa' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f4f4f5', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

// Render historical cycles list (Synthetic view)
function renderHistoryCyclesList() {
  const container = document.getElementById('history-cycles-list');
  container.innerHTML = '';
  
  if (state.cycleHistory.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
        Nenhum ciclo concluído no histórico ainda. Quando encerrar seu ciclo ativo, os resultados sintéticos aparecerão aqui.
      </div>`;
    return;
  }
  
  state.cycleHistory.forEach(record => {
    const card = document.createElement('div');
    card.className = 'history-card';
    
    // Build internal sub table details (Analytical toggle)
    let detailsHtml = '';
    if (record.disciplinesPerformance && record.disciplinesPerformance.length > 0) {
      detailsHtml = `
        <div style="margin-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 0.75rem; font-size: 0.85rem;">
          <h4 style="margin-bottom: 0.5rem; color: var(--secondary)">Desempenho por Matéria no Ciclo:</h4>
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem;">
      `;
      record.disciplinesPerformance.forEach(p => {
        const dAcc = p.questions > 0 ? Math.round((p.correct / p.questions) * 100) : 0;
        detailsHtml += `
          <div style="background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.03); padding: 0.5rem; border-radius:4px;">
            <strong>${p.subjectName}</strong><br>
            Horas: ${p.hours.toFixed(1)}h / ${p.hoursGoal}h<br>
            Questões: ${p.questions} (${p.correct} acertos)<br>
            Aproveitamento: <span style="color:var(--success); font-weight:600;">${dAcc}%</span>
          </div>
        `;
      });
      detailsHtml += `</div></div>`;
    }
    
    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-title">${record.name}</span>
        <span class="history-card-date">De ${displayDate(record.start)} a ${displayDate(record.end)} (${record.days} dias)</span>
      </div>
      <div class="history-stats-row">
        <div class="history-stat-item">
          <span class="history-stat-label">Total Horas</span>
          <span class="history-stat-value">${record.totalHours.toFixed(1)}h / ${record.hoursGoal}h</span>
        </div>
        <div class="history-stat-item">
          <span class="history-stat-label">Questões</span>
          <span class="history-stat-value">${record.totalQuestions} resolvidas</span>
        </div>
        <div class="history-stat-item">
          <span class="history-stat-label">Aproveitamento</span>
          <span class="history-stat-value" style="color: var(--success);">${record.accuracy}%</span>
        </div>
      </div>
      ${detailsHtml}
    `;
    
    container.appendChild(card);
  });
}

// Render study sessions log table (Analytical view)
function renderSessionsLogTable() {
  const container = document.getElementById('sessions-log-table-body');
  container.innerHTML = '';
  
  if (state.studySessions.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
          Nenhuma sessão de estudos registrada ainda. Use o painel para lançar novos estudos.
        </td>
      </tr>`;
    return;
  }
  
  // Sort sessions: newest first
  const sortedSessions = [...state.studySessions].sort((a, b) => {
    return b.date.localeCompare(a.date);
  });
  
  sortedSessions.forEach(session => {
    // Resolve subject name
    const subject = state.disciplines.find(d => d.id === session.subjectId);
    const subjectName = subject ? subject.name : 'Disciplina Excluída';
    
    const row = document.createElement('tr');
    
    const qCount = session.questions || 0;
    const qCorr = session.correct || 0;
    const acc = qCount > 0 ? Math.round((qCorr / qCount) * 100) + '%' : 'N/A';
    
    // Type translations
    const typeClasses = { theory: 'theory', questions: 'questions', revision: 'revision' };
    const typeLabels = { theory: 'Teoria', questions: 'Exercícios', revision: 'Revisão' };
    
    const starString = '⭐'.repeat(session.focus || 3);
    
    row.innerHTML = `
      <td>${displayDate(session.date)}</td>
      <td><strong>${subjectName}</strong></td>
      <td>${session.duration.toFixed(1)}h</td>
      <td>${qCount}</td>
      <td>${qCorr}</td>
      <td><span style="color: var(--success); font-weight:600;">${acc}</span></td>
      <td><span class="badge-study-type ${typeClasses[session.type]}">${typeLabels[session.type]}</span></td>
      <td><span class="star-rating">${starString}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm btn-icon-only btn-danger" onclick="deleteStudySession('${session.id}')" title="Excluir Lançamento">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:2;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </td>
    `;
    
    container.appendChild(row);
  });
}

// Delete study session
function deleteStudySession(sessionId) {
  if (confirm("Tem certeza que deseja excluir esta sessão de estudos?")) {
    state.studySessions = state.studySessions.filter(s => s.id !== sessionId);
    saveState();
    
    // Refresh current view if we are on metrics tab
    renderMetricsView();
    updateHeaderQuickStats();
  }
}

// ==================== MODALS & FORM ACTIONS ====================

// Open modal helper
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

// Close modal helper
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Open Form: Launch study session
function openStudyLogModal() {
  // Populate disciplines dropdown
  const select = document.getElementById('log-subject');
  select.innerHTML = '';
  
  if (state.disciplines.length === 0) {
    alert("Por favor, adicione pelo menos uma disciplina antes de lançar sessões de estudo.");
    switchTab('cycle');
    openAddDisciplineModal();
    return;
  }
  
  state.disciplines.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    select.appendChild(opt);
  });
  
  // Set date to today
  document.getElementById('log-date').value = formatDate(new Date());
  
  // Reset other values
  document.getElementById('log-duration').value = '';
  document.getElementById('log-questions').value = '';
  document.getElementById('log-correct').value = '';
  document.getElementById('log-notes').value = '';
  
  openModal('modal-study-log');
}

// Submit study session form
function submitStudyLog() {
  const subjectId = document.getElementById('log-subject').value;
  const duration = parseFloat(document.getElementById('log-duration').value);
  const date = document.getElementById('log-date').value;
  const questions = parseInt(document.getElementById('log-questions').value) || 0;
  const correct = parseInt(document.getElementById('log-correct').value) || 0;
  const type = document.getElementById('log-type').value;
  const focus = parseInt(document.getElementById('log-focus').value);
  const notes = document.getElementById('log-notes').value;
  
  if (!subjectId || isNaN(duration) || duration <= 0 || !date) {
    alert("Por favor preencha os campos obrigatórios: Disciplina, Tempo Estudado e Data.");
    return;
  }
  
  if (correct > questions) {
    alert("O número de acertos não pode ser maior que o número total de questões respondidas.");
    return;
  }
  
  const newSession = {
    id: 'session-' + Date.now(),
    subjectId,
    duration,
    date,
    questions,
    correct,
    type,
    focus,
    notes
  };
  
  state.studySessions.push(newSession);
  saveState();
  closeModal('modal-study-log');
  
  // Notify user and refresh dashboard
  alert("Sessão de estudos registrada com sucesso!");
  renderDashboard();
  updateHeaderQuickStats();
}

// Open Form: Configure new Cycle
function openConfigureCycleModal() {
  // Set default dates
  const today = new Date();
  document.getElementById('cycle-name').value = `Ciclo ${state.cycleHistory.length + 1} - Foco Contínuo`;
  document.getElementById('cycle-type-select').value = '7';
  document.getElementById('cycle-custom-days').value = '7';
  toggleCycleDaysInput();
  
  document.getElementById('cycle-hours-goal').value = '20';
  document.getElementById('cycle-questions-goal').value = '200';
  
  openModal('modal-configure-cycle');
}

// Show custom day field if "custom" is selected in cycle dropdown
function toggleCycleDaysInput() {
  const val = document.getElementById('cycle-type-select').value;
  const container = document.getElementById('cycle-custom-days-container');
  if (val === 'custom') {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}

// Submit cycle config form
function submitConfigureCycle() {
  const name = document.getElementById('cycle-name').value;
  const typeVal = document.getElementById('cycle-type-select').value;
  let days = parseInt(typeVal);
  if (typeVal === 'custom') {
    days = parseInt(document.getElementById('cycle-custom-days').value);
  }
  
  const hoursGoal = parseFloat(document.getElementById('cycle-hours-goal').value);
  const questionsGoal = parseInt(document.getElementById('cycle-questions-goal').value);
  
  if (!name || isNaN(days) || days <= 0 || isNaN(hoursGoal) || hoursGoal <= 0 || isNaN(questionsGoal) || questionsGoal <= 0) {
    alert("Por favor preencha todos os campos da configuração do ciclo.");
    return;
  }
  
  const today = new Date();
  const endDate = new Date();
  endDate.setDate(today.getDate() + days);
  
  const newCycle = {
    id: 'cycle-' + Date.now(),
    name,
    days,
    start: formatDate(today),
    end: formatDate(endDate),
    hoursGoal,
    questionsGoal,
    active: true
  };
  
  state.currentCycle = newCycle;
  saveState();
  closeModal('modal-configure-cycle');
  
  // Refresh and show
  renderCycleView();
  updateHeaderQuickStats();
  alert(`Ciclo "${name}" iniciado com sucesso!`);
}

// Open Form: Override specific day schedule
function openOverrideDayModal() {
  // Pre-fill today's date
  document.getElementById('override-date').value = formatDate(new Date());
  
  // Find current potential as helper
  const today = new Date();
  let jsDay = today.getDay();
  let indexMonSun = jsDay === 0 ? 6 : jsDay - 1;
  const standardFree = getPotentialStudyHoursOfDay(indexMonSun);
  
  document.getElementById('override-free-hours').value = standardFree;
  document.getElementById('override-reason').value = '';
  
  openModal('modal-override-day');
}

// Submit override day form
function submitOverrideDay() {
  const date = document.getElementById('override-date').value;
  const freeHours = parseFloat(document.getElementById('override-free-hours').value);
  const reason = document.getElementById('override-reason').value;
  
  if (!date || isNaN(freeHours) || freeHours < 0 || freeHours > 24) {
    alert("Preencha a data e insira um valor válido de horas livres (0 a 24).");
    return;
  }
  
  state.overrideDays[date] = { freeHours, reason };
  saveState();
  closeModal('modal-override-day');
  
  // Refresh stats
  renderDashboard();
  updateHeaderQuickStats();
  alert("Alteração pontual de rotina salva com sucesso!");
}

// Open Form: Add Discipline
function openAddDisciplineModal() {
  document.getElementById('discipline-modal-title').textContent = 'Nova Disciplina';
  document.getElementById('discipline-edit-id').value = '';
  document.getElementById('subject-name').value = '';
  document.getElementById('subject-hours-goal').value = '5';
  document.getElementById('subject-questions-goal').value = '50';
  document.getElementById('subject-priority').value = 'medium';
  
  document.getElementById('btn-delete-discipline').style.display = 'none';
  
  openModal('modal-discipline');
}

// Open Form: Edit Discipline
function openEditDisciplineModal(id) {
  const subject = state.disciplines.find(d => d.id === id);
  if (!subject) return;
  
  document.getElementById('discipline-modal-title').textContent = 'Editar Disciplina';
  document.getElementById('discipline-edit-id').value = subject.id;
  document.getElementById('subject-name').value = subject.name;
  document.getElementById('subject-hours-goal').value = subject.hoursGoal || '5';
  document.getElementById('subject-questions-goal').value = subject.questionsGoal || '50';
  document.getElementById('subject-priority').value = subject.priority || 'medium';
  
  document.getElementById('btn-delete-discipline').style.display = 'inline-flex';
  
  openModal('modal-discipline');
}

// Submit Discipline Form (Add or Edit)
function submitDiscipline() {
  const editId = document.getElementById('discipline-edit-id').value;
  const name = document.getElementById('subject-name').value;
  const hoursGoal = parseFloat(document.getElementById('subject-hours-goal').value);
  const questionsGoal = parseInt(document.getElementById('subject-questions-goal').value);
  const priority = document.getElementById('subject-priority').value;
  
  if (!name || isNaN(hoursGoal) || hoursGoal < 0 || isNaN(questionsGoal) || questionsGoal < 0) {
    alert("Por favor preencha os campos com valores numéricos válidos.");
    return;
  }
  
  if (editId) {
    // Edit existing
    const subject = state.disciplines.find(d => d.id === editId);
    if (subject) {
      subject.name = name;
      subject.hoursGoal = hoursGoal;
      subject.questionsGoal = questionsGoal;
      subject.priority = priority;
    }
  } else {
    // Add new
    const newSub = {
      id: 'sub-' + Date.now(),
      name,
      hoursGoal,
      questionsGoal,
      priority
    };
    state.disciplines.push(newSub);
  }
  
  saveState();
  closeModal('modal-discipline');
  
  // Refresh cycle view to show changes
  if (document.getElementById('view-cycle').classList.contains('active')) {
    renderCycleView();
  }
  updateHeaderQuickStats();
}

// Delete Discipline
function deleteDiscipline() {
  const editId = document.getElementById('discipline-edit-id').value;
  if (!editId) return;
  
  if (confirm("Tem certeza que deseja excluir esta disciplina? As sessões de estudo já registradas para ela serão mantidas, mas sem o nome da disciplina associada.")) {
    state.disciplines = state.disciplines.filter(d => d.id !== editId);
    saveState();
    closeModal('modal-discipline');
    
    // Refresh cycle view
    if (document.getElementById('view-cycle').classList.contains('active')) {
      renderCycleView();
    }
    updateHeaderQuickStats();
  }
}

// ==================== BACKUP & DATA RESET LOGIC ====================

// Export all state data as JSON file
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  const downloadAnchor = document.createElement('a');
  
  const timestamp = formatDate(new Date()).replace(/-/g, '');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `studyflow_backup_${timestamp}.json`);
  
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Import all state data from JSON file
function importData(event) {
  const fileReader = new FileReader();
  const file = event.target.files[0];
  
  if (!file) return;
  
  fileReader.onload = function(e) {
    try {
      const importedState = JSON.parse(e.target.result);
      
      // Simple verification of critical properties
      if (importedState.weeklyTemplate && importedState.disciplines && importedState.studySessions) {
        state = importedState;
        saveState();
        alert("Backup restaurado com sucesso! A página será atualizada.");
        window.location.reload();
      } else {
        alert("Erro: O arquivo de backup selecionado não é válido ou está corrompido.");
      }
    } catch (err) {
      alert("Falha ao analisar o arquivo JSON do backup.");
      console.error(err);
    }
  };
  
  fileReader.readAsText(file);
}

// Reset all application data
function resetAllData() {
  if (confirm("🚨 ATENÇÃO: Esta ação apagará permanentemente todos os seus horários cadastrados, metas, disciplinas e histórico de estudos de sessões passadas. Deseja continuar?")) {
    if (confirm("Deseja mesmo redefinir tudo? Esta é a última confirmação.")) {
      localStorage.removeItem('studyflow_state');
      alert("Dados limpos! A página será recarregada.");
      window.location.reload();
    }
  }
}

// ==================== APP INITIALIZATION ====================

window.addEventListener('DOMContentLoaded', () => {
  loadState();
  // Initially load Dashboard view
  switchTab('dashboard');
});
