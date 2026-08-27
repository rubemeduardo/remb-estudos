/* Lógica de Controle da Sessão Ativa de Questões (Navegação, Filtros & Paginação) */

// Estado global da sessão activa
window.activeSessionQuestionIdx = 0;
window.sessionBancasFiltro = []; // Bancas ativas para filtrar na sessão
window.sessionAnosFiltro = [];    // Anos ativos para filtrar na sessão

// Preferência de quantidade de questões por página
window.sessionPageSize = parseInt(localStorage.getItem("remb_session_page_size")) || 20;
window.sessionCurrentPage = 0;

// Inicializar ou re-renderizar a sessão ativa
window.renderizarSessaoAtiva = function() {
    if (!window.cadernoQuestoes || window.cadernoQuestoes.length === 0) return;

    // Garantir que a barra de caneta não seja destruída se estiver dentro do activePanel antes de limpar!
    const bar = document.getElementById("stickyHighlighterBar");
    if (bar && bar.parentNode && bar.parentNode !== document.body) {
        document.body.appendChild(bar);
        bar.style.display = "none";
    }

    // 1. Ativar modo visual de sessão no layout
    document.body.classList.add("session-active");
    
    // Ajustar grid no app layout
    const appLayout = document.querySelector(".app-layout");
    if (appLayout) {
        appLayout.style.gridTemplateColumns = "1fr";
    }

    const setupPanel = document.getElementById("sala-setup-panel");
    const activePanel = document.getElementById("sala-active-panel");
    if (setupPanel) setupPanel.style.display = "none";
    
    if (activePanel) {
        activePanel.style.display = "flex";
        activePanel.style.flexDirection = "column";
        
        // Limpar completamente o active panel para evitar qualquer acúmulo de DOM duplicado!
        activePanel.innerHTML = "";
    } else {
        return;
    }

    // 2. Reconstruir a barra superior dark estilizada
    const darkBar = document.createElement("div");
    darkBar.className = "active-caderno-bar-dark";
    activePanel.appendChild(darkBar);

    // 3. Reconstruir o Split Layout
    const splitContainer = document.createElement("div");
    splitContainer.id = "active-session-split-container";
    splitContainer.className = "active-session-layout";
    activePanel.appendChild(splitContainer);

    // 4. Reconstruir e renderizar a sidebar no lado esquerdo do split
    const sessionSidebar = document.createElement("div");
    sessionSidebar.id = "active-session-sidebar-el";
    sessionSidebar.className = "active-session-sidebar";
    splitContainer.appendChild(sessionSidebar);

    // Lado Direito: Wrapper do container de questões + navegação
    const rightPane = document.createElement("div");
    rightPane.style.display = "flex";
    rightPane.style.flexDirection = "column";
    rightPane.style.gap = "20px";
    rightPane.style.flex = "1";
    splitContainer.appendChild(rightPane);

    // Mover a caneta para o split layout e mostrar (como terceira coluna estática!)
    if (bar) {
        splitContainer.appendChild(bar);
        bar.style.display = "flex";
        bar.classList.remove("minimized");
        bar.style.width = "280px";
        bar.style.left = "auto";
        bar.style.right = "auto";
        bar.style.top = "auto";
    }

    const questoesContainer = document.createElement("div");
    questoesContainer.id = "questoesContainer";
    questoesContainer.className = "questoes-list";
    rightPane.appendChild(questoesContainer);

    // Calcular dados filtrados
    const totalQuestoes = window.cadernoQuestoes.length;

    // Calcular estatísticas das bancas da sessão
    const bancaCounts = {};
    const anoCounts = {};
    window.cadernoQuestoes.forEach(q => {
        const bancaName = q.origem_questao?.banca || "FGV";
        bancaCounts[bancaName] = (bancaCounts[bancaName] || 0) + 1;
        
        if (q.origem_questao?.ano) {
            const anoVal = q.origem_questao.ano.toString().trim();
            if (anoVal) anoCounts[anoVal] = (anoCounts[anoVal] || 0) + 1;
        }
    });

    // Obter lista única de bancas e anos ordenados
    const bancasSessao = Object.keys(bancaCounts).sort();
    const anosSessao = Object.keys(anoCounts).sort((a,b) => b - a); // Decrescente

    // Determinar se a questão atual atende aos filtros da sessão
    const indexValido = (idx) => {
        const q = window.cadernoQuestoes[idx];
        if (!q) return false;
        
        // Filtro Banca
        if (window.sessionBancasFiltro.length > 0) {
            const b = q.origem_questao?.banca || "FGV";
            if (!window.sessionBancasFiltro.includes(b)) return false;
        }
        
        // Filtro Ano
        if (window.sessionAnosFiltro.length > 0) {
            const a = q.origem_questao?.ano ? q.origem_questao.ano.toString().trim() : "";
            if (!window.sessionAnosFiltro.includes(a)) return false;
        }
        
        return true;
    };

    // Obter apenas as questões válidas (que atendem aos filtros de banca/ano)
    const questoesValidas = [];
    const indexParaValidaMap = {}; // Mapeia índice original para o índice na lista filtrada
    window.cadernoQuestoes.forEach((q, idx) => {
        if (indexValido(idx)) {
            indexParaValidaMap[idx] = questoesValidas.length;
            questoesValidas.push({ q, idx });
        }
    });

    if (questoesValidas.length === 0) {
        questoesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary); width: 100%; background: var(--bg-card); border-radius:16px; border:1px solid var(--border);">
                <p style="font-weight: 700; font-size:1.1rem; color: var(--text-primary);">Nenhuma questão corresponde aos filtros selecionados na sidebar.</p>
                <p style="font-size:0.9rem; margin-top:5px;">Limpe ou altere as seleções de Bancas e Anos para voltar a estudar.</p>
            </div>
        `;
        renderSidebarHTML(sessionSidebar, bancasSessao, anosSessao, bancaCounts, anoCounts, indexValido, totalQuestoes, indexParaValidaMap);
        rebuildDarkBarHTML(darkBar);
        return;
    }

    // Certificar que activeSessionQuestionIdx é válido
    if (!indexValido(window.activeSessionQuestionIdx)) {
        window.activeSessionQuestionIdx = questoesValidas[0].idx;
    }

    // Ajustar a página atual caso a página exceda o novo total de páginas
    const totalValidas = questoesValidas.length;
    const totalPages = Math.ceil(totalValidas / window.sessionPageSize);
    
    // Achar em qual índice das questões válidas está a activeSessionQuestionIdx
    const validaActiveIdx = indexParaValidaMap[window.activeSessionQuestionIdx] !== undefined ? indexParaValidaMap[window.activeSessionQuestionIdx] : 0;
    
    if (window.sessionPageSize === 1) {
        window.sessionCurrentPage = validaActiveIdx;
    } else {
        window.sessionCurrentPage = Math.floor(validaActiveIdx / window.sessionPageSize);
    }

    // Renderizar a sidebar
    renderSidebarHTML(sessionSidebar, bancasSessao, anosSessao, bancaCounts, anoCounts, indexValido, totalQuestoes, indexParaValidaMap);

    // Renderizar a barra superior
    rebuildDarkBarHTML(darkBar);

    // Renderizar o conteúdo de questões (única ou lista de acordo com sessionPageSize)
    if (window.sessionPageSize === 1) {
        // MODO FOCO (1 questão)
        const activeQ = window.cadernoQuestoes[window.activeSessionQuestionIdx];
        if (activeQ) {
            const card = criarQuestaoCard(activeQ, false);
            questoesContainer.appendChild(card);
            
            // Inserir botões de navegação diretamente no rodapé original do card (questao-footer-card)
            const footerCard = card.querySelector(".questao-footer-card");
            if (footerCard) {
                const navActions = document.createElement("div");
                navActions.className = "session-nav-actions";
                navActions.style.display = "flex";
                navActions.style.gap = "8px";
                navActions.style.alignItems = "center";
                navActions.style.marginLeft = "12px";

                let temAnterior = (validaActiveIdx > 0);
                let temProxima = (validaActiveIdx < totalValidas - 1);

                navActions.innerHTML = `
                    <button class="btn btn-outline-secondary" onclick="window.navigateSessionQuestion(-1)" ${!temAnterior ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} style="font-weight: 700; padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; border: 1.5px solid var(--border); background: var(--bg-card); color: var(--text-secondary);">
                        &lt; Anterior
                    </button>
                    <button class="btn btn-primary" onclick="window.navigateSessionQuestion(1)" ${!temProxima ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} style="font-weight: 700; padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; color: #fff; background-color: var(--accent); border: none;">
                        Próxima &gt;
                    </button>
                `;
                
                // Inserir no container de ações à direita (segundo filho do questao-footer-card)
                const actionsContainer = footerCard.children[1] || footerCard;
                actionsContainer.appendChild(navActions);
            }
        }
    } else {
        // MODO LISTA (Múltiplas questões por página)
        const start = window.sessionCurrentPage * window.sessionPageSize;
        const end = start + window.sessionPageSize;
        const pageQuestionsSlice = questoesValidas.slice(start, end);

        pageQuestionsSlice.forEach(({ q, idx }) => {
            const card = criarQuestaoCard(q, false);
            
            // Highlight a questão "ativa" se for a selecionada pelo usuário
            if (idx === window.activeSessionQuestionIdx) {
                card.style.border = "2.5px solid var(--accent)";
                card.style.boxShadow = "0 4px 15px rgba(59, 130, 246, 0.15)";
            }
            
            questoesContainer.appendChild(card);
        });

        // Adicionar a barra de paginação no final da lista
        const pageNavigation = document.createElement("div");
        pageNavigation.className = "session-list-pagination";
        pageNavigation.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: var(--bg-card);
            border: 1px solid var(--border);
            box-shadow: var(--shadow);
            border-radius: 12px;
            padding: 15px 25px;
            margin-top: 15px;
        `;

        const temAnteriorPage = (window.sessionCurrentPage > 0);
        const temProximaPage = (window.sessionCurrentPage < totalPages - 1);

        pageNavigation.innerHTML = `
            <button class="btn btn-outline-secondary" onclick="window.changeSessionPage(${window.sessionCurrentPage - 1})" ${!temAnteriorPage ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} style="font-weight: 700; padding: 10px 20px; border-radius: 8px; font-size: 0.88rem; border: 1.5px solid var(--border); background-color: var(--bg-card); color: var(--text-secondary);">
                &lt; Anterior Página
            </button>
            <span style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">
                Página ${window.sessionCurrentPage + 1} de ${totalPages}
            </span>
            <button class="btn btn-primary" onclick="window.changeSessionPage(${window.sessionCurrentPage + 1})" ${!temProximaPage ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} style="font-weight: 700; padding: 10px 20px; border-radius: 8px; font-size: 0.88rem; color: #fff; background-color: var(--accent); border: none;">
                Próxima Página &gt;
            </button>
        `;
        questoesContainer.appendChild(pageNavigation);
    }

    // Suporte MathJax
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
        window.MathJax.typesetPromise();
    }
};

// Reconstrução do HTML da barra superior
function rebuildDarkBarHTML(darkBar) {
    const disctips = new Set(window.cadernoQuestoes.map(q => q.disciplina || "Sem Disciplina"));
    const discStr = Array.from(disctips).join(", ");

    const total = window.cadernoQuestoes.length;
    let resolvidas = 0;
    window.cadernoQuestoes.forEach(q => {
        if (progressoUsuario.respondidas[q.id]) {
            resolvidas++;
        }
    });
    const percent = Math.round((resolvidas / total) * 100);

    darkBar.innerHTML = `
        <!-- Lado Esquerdo: Título Questões + Divisor + Card de Sessão -->
        <div style="display: flex; align-items: center; gap: 15px; text-align: left;">
            <span style="font-family: 'Outfit', sans-serif; font-size: 1.15rem; font-weight: 850; letter-spacing: 0.5px; color: #ffffff;">Questões</span>
            <div style="width: 1px; height: 24px; background-color: rgba(255,255,255,0.15); margin: 0 5px;"></div>
            
            <!-- Card de Sessão em Resolução -->
            <div style="display: flex; align-items: center; gap: 12px; background-color: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px 16px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #ffffff;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 0.92rem; font-weight: 800; color: #ffffff; display: flex; align-items: center; gap: 6px;">
                        <span style="color: #10b981; font-size: 0.75rem;">●</span>
                        Sessão em Resolução
                    </span>
                    <span id="active-caderno-summary" style="font-size: 0.72rem; color: rgba(255,255,255,0.65); font-weight: 600;">Matérias incluídas: ${discStr}</span>
                </div>
            </div>
        </div>

        <!-- Meio: Progresso + Barra de Progresso + Contagem -->
        <div style="display: flex; align-items: center; gap: 15px; text-align: left;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <span style="font-size: 0.72rem; color: rgba(255,255,255,0.4); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Progresso</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 60px; height: 6px; background-color: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden; margin: 2px 0;">
                        <div id="fillActiveCadernoProgress" style="height: 100%; width: ${percent}%; background-color: var(--accent); transition: width 0.3s ease;"></div>
                    </div>
                    <span id="lblActiveCadernoCount" style="font-size: 0.95rem; font-weight: 800; color: #ffffff; font-family: 'Outfit', sans-serif;">${resolvidas}/${total}</span>
                </div>
            </div>
            <span id="lblActiveCadernoPercent" style="display: none;">${percent}%</span>
        </div>

        <!-- Lado Direito: Temporizador, Refazer Lista, Nova Sessão -->
        <div style="display: flex; align-items: center; gap: 12px;">
            <!-- Temporizador -->
            <div class="active-sessao-timer" style="display: flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; color: #ffffff; background: transparent; font-family: 'Inter', sans-serif;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #ffffff;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>TEMPO: <span id="timerDisplay" style="font-family: monospace; font-weight: 800; color: #ffffff;">00:00:00</span></span>
                <button id="playPauseBtn" onclick="toggleTimer()" style="background: none; border: none; font-size: 0.8rem; cursor: pointer; padding: 2px; line-height: 1; margin-left: 4px;" title="Pausar/Retomar">⏸️</button>
            </div>

            <!-- Botões de Ação -->
            <button class="btn btn-outline-danger" id="btnFinalizarSimulado" onclick="finalizarSimulado()" style="display: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; border: 1.5px solid #ef4444; color: #ef4444; background: transparent; transition: all 0.2s;">
                🏁 Finalizar Simulado
            </button>
            
            <button type="button" class="btn" onclick="window.refazerCadernoAtivo()" style="padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; border: 1.5px solid rgba(255,255,255,0.15); color: #ffffff; background: transparent; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; color: #ffffff;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                Refazer Lista
            </button>
            
            <button type="button" class="btn btn-primary" onclick="window.voltarParaConfiguracao()" style="padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; border: none; color: #ffffff; background-color: var(--accent); display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; color: #ffffff;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                Nova Sessão
            </button>
        </div>
    `;
    
    // Atualizar formato do cronômetro imediatamente
    window.atualizarCronometroTela();
}

// Renderização estrita do HTML da Sidebar da Sessão
function renderSidebarHTML(container, bancas, anos, bancaCounts, anoCounts, indexValido, total, indexParaValidaMap) {
    // Obter apenas as questões válidas (que atendem aos filtros de banca/ano)
    const questoesValidas = [];
    window.cadernoQuestoes.forEach((q, idx) => {
        if (indexValido(idx)) {
            questoesValidas.push({ q, idx });
        }
    });

    // Determinar quais questões exibir na barra lateral de navegação
    let pageQuestionsSlice = [];
    if (window.sessionPageSize === 1) {
        // Em modo foco (1 questão por página), mantemos todas as válidas para navegação direta rápida
        pageQuestionsSlice = questoesValidas;
    } else {
        // Em modo lista (múltiplas por página), exibimos apenas os círculos das questões da página atual
        const start = window.sessionCurrentPage * window.sessionPageSize;
        const end = start + window.sessionPageSize;
        pageQuestionsSlice = questoesValidas.slice(start, end);
    }

    let circlesHTML = "";
    pageQuestionsSlice.forEach(({ q, idx }) => {
        const num = idx + 1;
        const respondida = progressoUsuario.respondidas[q.id];
        const isFavorita = progressoUsuario.favoritas.includes(q.id);
        const isActive = (idx === window.activeSessionQuestionIdx);

        let classes = "session-nav-circle";
        if (isActive) {
            classes += " active";
        } else if (respondida) {
            const isCorrect = (respondida.selecionada === q.gabarito);
            classes += isCorrect ? " correct" : " wrong";
        } else {
            classes += " unanswered";
        }

        let inlineStyle = "";
        if (window.sessionPageSize > 1) {
            if (isActive) {
                inlineStyle = "border: 2px solid var(--accent);";
            }
        }

        circlesHTML += `
            <div class="${classes}" style="${inlineStyle}" onclick="window.jumpToSessionQuestion(${idx})">
                ${num}
                ${isFavorita ? '<span class="star-badge">★</span>' : ''}
            </div>
        `;
    });

    // HTML de Bancas
    let bancasHTML = "";
    bancas.forEach(b => {
        const activeClass = window.sessionBancasFiltro.includes(b) ? "active" : "";
        const checkedAttr = window.sessionBancasFiltro.includes(b) ? "checked" : "";
        bancasHTML += `
            <div class="session-filter-item ${activeClass}" onclick="window.toggleSessionBancaFilter('${b}')">
                <div class="session-filter-item-left">
                    <input type="checkbox" ${checkedAttr} style="pointer-events: none;">
                    <span>${b}</span>
                </div>
                <span class="session-filter-count">${bancaCounts[b]}</span>
            </div>
        `;
    });

    // HTML de Anos
    let anosHTML = "";
    anos.forEach(a => {
        const activeClass = window.sessionAnosFiltro.includes(a) ? "active" : "";
        anosHTML += `
            <button class="session-year-btn ${activeClass}" onclick="window.toggleSessionAnoFilter('${a}')">
                ${a}
            </button>
        `;
    });

    container.innerHTML = `
        <!-- Card 1: Navegação -->
        <div class="sidebar-card">
            <h3 class="sidebar-card-title" style="margin: 0 0 10px 0;">Navegação</h3>
            <div class="session-navigation-grid" style="margin-top: 0;">
                ${circlesHTML}
            </div>
        </div>
        
        <!-- Card 2: Filtros de Origem -->
        <div class="sidebar-card">
            <h4 class="sidebar-card-heading">Filtros de Origem</h4>
            <div class="session-filter-list">
                ${bancasHTML || '<p style="font-size:0.8rem; color:var(--text-secondary);">Sem bancas na sessão</p>'}
            </div>
        </div>
        
        <!-- Card 3: Ano -->
        <div class="sidebar-card">
            <h4 class="sidebar-card-heading">Ano</h4>
            <div class="session-year-buttons">
                ${anosHTML || '<p style="font-size:0.8rem; color:var(--text-secondary);">Sem anos na sessão</p>'}
            </div>
        </div>

        <!-- Card 4: Legenda -->
        <div class="sidebar-card">
            <h4 class="sidebar-card-heading" style="border-bottom: 1.5px solid var(--border); padding-bottom: 8px;">Legenda</h4>
            <div class="session-legend-container" style="display: flex; flex-direction: column; gap: 8px; margin-top: 5px;">
                <div class="session-legend-item" style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);"><span class="session-legend-dot green" style="background-color: var(--correta); width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span> Correta</div>
                <div class="session-legend-item" style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);"><span class="session-legend-dot red" style="background-color: var(--errada); width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span> Errada</div>
                <div class="session-legend-item" style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);"><span class="session-legend-dot grey" style="background-color: #cbd5e1; width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span> Não respondida</div>
            </div>
        </div>
    `;
}

// Alterar tamanho da página da sessão
window.changeSessionPageSize = function(size) {
    const val = parseInt(size, 10);
    window.sessionPageSize = val;
    localStorage.setItem("remb_session_page_size", val);
    
    // Reset da página ativa ao alterar o tamanho
    window.sessionCurrentPage = 0;
    window.renderizarSessaoAtiva();
};

// Alterar página de exibição
window.changeSessionPage = function(pageIdx) {
    window.sessionCurrentPage = pageIdx;
    
    // Achar o índice correspondente no caderno
    const totalQuestoes = window.cadernoQuestoes.length;
    const indexValido = (idx) => {
        const q = window.cadernoQuestoes[idx];
        if (!q) return false;
        if (window.sessionBancasFiltro.length > 0 && !window.sessionBancasFiltro.includes(q.origem_questao?.banca || "FGV")) return false;
        if (window.sessionAnosFiltro.length > 0 && !window.sessionAnosFiltro.includes(q.origem_questao?.ano ? q.origem_questao.ano.toString().trim() : "")) return false;
        return true;
    };
    
    const questoesValidas = [];
    for (let i = 0; i < totalQuestoes; i++) {
        if (indexValido(i)) questoesValidas.push(i);
    }
    
    const targetIdx = pageIdx * window.sessionPageSize;
    if (questoesValidas[targetIdx] !== undefined) {
        window.activeSessionQuestionIdx = questoesValidas[targetIdx];
    }
    
    window.renderizarSessaoAtiva();
    
    // Rolar para o topo da lista
    setTimeout(() => {
        const topEl = document.getElementById("questoesContainer");
        if (topEl) topEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
};

// Navegação de questões na sessão (+1 ou -1)
window.navigateSessionQuestion = function(direction) {
    const totalQuestoes = window.cadernoQuestoes.length;
    const indexValido = (idx) => {
        const q = window.cadernoQuestoes[idx];
        if (!q) return false;
        if (window.sessionBancasFiltro.length > 0 && !window.sessionBancasFiltro.includes(q.origem_questao?.banca || "FGV")) return false;
        if (window.sessionAnosFiltro.length > 0 && !window.sessionAnosFiltro.includes(q.origem_questao?.ano ? q.origem_questao.ano.toString().trim() : "")) return false;
        return true;
    };

    const questoesValidas = [];
    for (let i = 0; i < totalQuestoes; i++) {
        if (indexValido(i)) questoesValidas.push(i);
    }

    const currentValidaIdx = questoesValidas.indexOf(window.activeSessionQuestionIdx);
    const targetValidaIdx = currentValidaIdx + direction;
    
    if (targetValidaIdx >= 0 && targetValidaIdx < questoesValidas.length) {
        window.activeSessionQuestionIdx = questoesValidas[targetValidaIdx];
        window.renderizarSessaoAtiva();
    }
};

// Jump direto para uma questão ao clicar no círculo
window.jumpToSessionQuestion = function(index) {
    window.activeSessionQuestionIdx = index;
    window.renderizarSessaoAtiva();
    
    // Se estiver em modo lista, rola suavemente para o card correspondente
    if (window.sessionPageSize > 1) {
        setTimeout(() => {
            const q = window.cadernoQuestoes[index];
            const targetCard = document.getElementById(`card-${q.id}`);
            if (targetCard) {
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 120);
    }
};

// Toggles de filtros da sessão
window.toggleSessionBancaFilter = function(banca) {
    const idx = window.sessionBancasFiltro.indexOf(banca);
    if (idx > -1) {
        window.sessionBancasFiltro.splice(idx, 1);
    } else {
        window.sessionBancasFiltro.push(banca);
    }
    window.renderizarSessaoAtiva();
};

window.toggleSessionAnoFilter = function(ano) {
    const idx = window.sessionAnosFiltro.indexOf(ano);
    if (idx > -1) {
        window.sessionAnosFiltro.splice(idx, 1);
    } else {
        window.sessionAnosFiltro.push(ano);
    }
    window.renderizarSessaoAtiva();
};

// Retornar para tela de configuração (Finalizar Estudos / Sair da Sessão)
window.voltarParaConfiguracao = function() {
    // 1. Remover classe de sessão do layout
    document.body.classList.remove("session-active");
    
    // Restaurar layout original da sidebar
    const appLayout = document.querySelector(".app-layout");
    const appSidebar = document.querySelector(".app-sidebar");
    if (appLayout) {
        appLayout.style.gridTemplateColumns = ""; // Volta ao padrão do CSS
    }
    if (appSidebar) {
        appSidebar.style.display = ""; // Volta ao padrão
    }

    // 2. Destruir o split container e mover o questoesContainer de volta
    const splitContainer = document.getElementById("active-session-split-container");
    if (splitContainer) {
        const activePanel = document.getElementById("sala-active-panel");
        if (activePanel) activePanel.innerHTML = "";
        
        // Re-injetar a estrutura de active-caderno-bar inicial vazia
        const placeholderBar = document.createElement("div");
        placeholderBar.className = "active-caderno-bar";
        if (activePanel) activePanel.appendChild(placeholderBar);

        const placeholderContainer = document.createElement("div");
        placeholderContainer.id = "questoesContainer";
        placeholderContainer.className = "questoes-list";
        if (activePanel) activePanel.appendChild(placeholderContainer);
    }

    // 3. Ocultar active panel e mostrar setup
    const activePanel = document.getElementById("sala-active-panel");
    const setupPanel = document.getElementById("sala-setup-panel");
    if (activePanel) activePanel.style.display = "none";
    if (setupPanel) setupPanel.style.display = "block";

    // 4. Limpar estados globais de sessão
    window.cadernoGerado = false;
    window.cadernoQuestoes = [];
    localStorage.removeItem("remb_caderno_ativo");
    window.activeSessionQuestionIdx = 0;
    window.sessionBancasFiltro = [];
    window.sessionAnosFiltro = [];

    // Ocultar barra de canetas
    const penBar = document.getElementById("stickyHighlighterBar");
    if (penBar) penBar.style.display = "none";
    
    // Atualizar/Remover banner de continuação
    if (typeof window.checkActiveSessionBanner === 'function') {
        window.checkActiveSessionBanner();
    }
};

// Hook e redefinir funções de inicialização de sessão no app.js
setTimeout(() => {
    // Hook na função gerarCadernoQuestoes para direcionar para nossa renderizarSessaoAtiva
    const originalGerar = window.gerarCadernoQuestoes;
    if (originalGerar) {
        window.gerarCadernoQuestoes = function() {
            originalGerar();
            if (window.cadernoGerado) {
                window.activeSessionQuestionIdx = 0;
                window.sessionBancasFiltro = [];
                window.sessionAnosFiltro = [];
                window.renderizarSessaoAtiva();
            }
        };
    }

    // Hook na função refazerCadernoAtivo
    const originalRefazer = window.refazerCadernoAtivo;
    if (originalRefazer) {
        window.refazerCadernoAtivo = function() {
            originalRefazer();
            window.activeSessionQuestionIdx = 0;
            window.sessionBancasFiltro = [];
            window.sessionAnosFiltro = [];
            window.renderizarSessaoAtiva();
        };
    }

    // Hook na função abrirQuestoesNaSala para suportar Provas e Listas
    const originalAbrirNaSala = window.abrirQuestoesNaSala;
    if (originalAbrirNaSala) {
        window.abrirQuestoesNaSala = function(questoes, limitMinutes = 0) {
            originalAbrirNaSala(questoes, limitMinutes);
            if (window.cadernoGerado) {
                window.activeSessionQuestionIdx = 0;
                window.sessionBancasFiltro = [];
                window.sessionAnosFiltro = [];
                window.renderizarSessaoAtiva();
            }
        };
    }
}, 500);

// Sobrescrever formatador do cronômetro para exibir no formato HH:MM:SS
window.atualizarCronometroTela = function() {
    const totalSegs = Math.max(0, typeof timerSegundos !== 'undefined' ? timerSegundos : 0);
    const hrs = String(Math.floor(totalSegs / 3600)).padStart(2, '0');
    const min = String(Math.floor((totalSegs % 3600) / 60)).padStart(2, '0');
    const seg = String(totalSegs % 60).padStart(2, '0');
    const display = document.getElementById("timerDisplay");
    if (display) {
        display.innerText = `${hrs}:${min}:${seg}`;
    }
};

// Interceptação de renderização da lista para manter o estado da sessão ativa consistente
setTimeout(() => {
    const originalRenderizarLista = window.renderizarListaQuestoes;
    if (originalRenderizarLista) {
        window.renderizarListaQuestoes = function(lista, container, isFoco = false, key = "sala") {
            if (key === "sala" && window.cadernoGerado && document.body.classList.contains("session-active")) {
                window.renderizarSessaoAtiva();
            } else {
                originalRenderizarLista(lista, container, isFoco, key);
            }
        };
    }
}, 600);

// Controle de continuação explícita de sessão
window.forceResumeSession = false;

window.continuarSessaoAtiva = function() {
    if (window.cadernoGerado && window.cadernoQuestoes && window.cadernoQuestoes.length > 0) {
        window.forceResumeSession = true;
        
        // Achar o índice da primeira questão não respondida nesta sessão
        let firstUnansweredIdx = 0;
        for (let i = 0; i < window.cadernoQuestoes.length; i++) {
            const q = window.cadernoQuestoes[i];
            if (!progressoUsuario.respondidas[q.id]) {
                firstUnansweredIdx = i;
                break;
            }
        }
        window.activeSessionQuestionIdx = firstUnansweredIdx;
        
        // Ativar layout antes de navegar
        document.body.classList.add("session-active");
        const appLayout = document.querySelector(".app-layout");
        if (appLayout) appLayout.style.gridTemplateColumns = "1fr";
        
        window.navegarPara('questoes');
    }
};

// Função para verificar se há sessão ativa e exibir o banner no painel de configuração
window.checkActiveSessionBanner = function() {
    const setupPanel = document.getElementById("sala-setup-panel");
    if (!setupPanel) return;

    let banner = document.getElementById("active-session-resume-banner");
    
    if (window.cadernoGerado && window.cadernoQuestoes && window.cadernoQuestoes.length > 0) {
        if (!banner) {
            banner = document.createElement("div");
            banner.id = "active-session-resume-banner";
            banner.className = "resume-session-card";
            banner.style.cssText = `
                background-color: var(--bg-card);
                border: 1.5px solid var(--accent);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 25px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                box-shadow: var(--shadow);
            `;
            
            banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px; text-align: left;">
                    <div style="background-color: rgba(59, 130, 246, 0.1); padding: 12px; border-radius: 50%; color: var(--accent); display: flex; align-items: center; justify-content: center;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                    </div>
                    <div>
                        <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--text-primary);">Sessão de Estudos em Andamento</h4>
                        <p style="margin: 4px 0 0 0; font-size: 0.88rem; color: var(--text-secondary);">Você possui uma sessão aberta anteriormente com questões pendentes.</p>
                    </div>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-primary" onclick="window.continuarSessaoAtiva()" style="font-weight: 700; padding: 10px 20px; border-radius: 8px; color: #fff; background-color: var(--accent); border: none;">
                        🚀 Continuar de Onde Parou
                    </button>
                    <button class="btn btn-outline-danger" onclick="window.voltarParaConfiguracao()" style="font-weight: 700; padding: 10px 20px; border-radius: 8px; border: 1.5px solid #ef4444; color: #ef4444; background: transparent;">
                        Descartar e Nova Sessão
                    </button>
                </div>
            `;
            setupPanel.insertBefore(banner, setupPanel.firstChild);
        }
    } else {
        if (banner) {
            banner.remove();
        }
    }
};

// Hook na navegação geral (navegarPara) para gerenciar visibilidade da sidebar e transições de sessão focado/config
setTimeout(() => {
    const originalNavegarPara = window.navegarPara;
    if (originalNavegarPara) {
        window.navegarPara = function(id) {
            const wasForced = window.forceResumeSession;
            
            if (id !== "questoes" || !window.cadernoGerado) {
                // Ao navegar para qualquer outra aba ou se o caderno for limpo, remove o visual focado
                document.body.classList.remove("session-active");
                const appLayout = document.querySelector(".app-layout");
                const appSidebar = document.querySelector(".app-sidebar");
                if (appLayout) appLayout.style.gridTemplateColumns = "";
                if (appSidebar) appSidebar.style.display = "";
            } else if (id === "questoes" && window.cadernoGerado) {
                if (wasForced) {
                    // Se foi solicitado explicitamente para continuar estudos (Dashboard ou Banner)
                    document.body.classList.add("session-active");
                    const appLayout = document.querySelector(".app-layout");
                    if (appLayout) appLayout.style.gridTemplateColumns = "1fr";
                    window.renderizarSessaoAtiva();
                } else {
                    // Se navegou pelo menu "Questões" normal do sidebar, exibe o painel de setup com o banner
                    document.body.classList.remove("session-active");
                    const appLayout = document.querySelector(".app-layout");
                    const appSidebar = document.querySelector(".app-sidebar");
                    if (appLayout) appLayout.style.gridTemplateColumns = "";
                    if (appSidebar) appSidebar.style.display = "";
                }
            }
            originalNavegarPara(id);
            
            // Sobrescrever a lógica de app.js que esconde o setup panel se o caderno estiver gerado
            if (id === "questoes" && window.cadernoGerado && !wasForced) {
                const setupPanel = document.getElementById("sala-setup-panel");
                const activePanel = document.getElementById("sala-active-panel");
                if (setupPanel) setupPanel.style.display = "block";
                if (activePanel) activePanel.style.display = "none";
            }
            
            // Limpar a flag de força
            window.forceResumeSession = false;
            
            // Forçar verificação do banner após atualizar a tela
            setTimeout(() => { window.checkActiveSessionBanner(); }, 80);
        };
    }
}, 500);

// Hook nos botões do dashboard para carregar a sessão ativa direto
setTimeout(() => {
    const attachDashboardResumeHooks = () => {
        const btn = document.getElementById("btn-home-continue-action");
        if (btn) {
            const originalClick = btn.onclick;
            btn.onclick = function(e) {
                window.forceResumeSession = true;
                if (typeof originalClick === 'function') {
                    originalClick.call(btn, e);
                } else {
                    window.continuarSessaoAtiva();
                }
            };
        }
        const detBtn = document.getElementById("btn-home-continue-details");
        if (detBtn) {
            const originalClickDet = detBtn.onclick;
            detBtn.onclick = function(e) {
                window.forceResumeSession = true;
                if (typeof originalClickDet === 'function') {
                    originalClickDet.call(detBtn, e);
                } else {
                    window.continuarSessaoAtiva();
                }
            };
        }
    };
    
    // Executa no load e atrela à navegação para re-aplicar os escutadores quando o Dashboard for carregado
    attachDashboardResumeHooks();
    
    const originalNavegar = window.navegarPara;
    if (originalNavegar) {
        window.navegarPara = function(id) {
            originalNavegar(id);
            setTimeout(attachDashboardResumeHooks, 150);
        };
    }
}, 700);

// Hook de Page Load para restaurar estados adequados e o banner na tela de setup
setTimeout(() => {
    window.checkActiveSessionBanner();
    
    const activeSection = document.querySelector(".content-section.active");
    if (window.cadernoGerado && activeSection && activeSection.id === "section-questoes" && !window.forceResumeSession) {
        document.body.classList.remove("session-active");
        const appLayout = document.querySelector(".app-layout");
        const appSidebar = document.querySelector(".app-sidebar");
        if (appLayout) appLayout.style.gridTemplateColumns = "";
        if (appSidebar) appSidebar.style.display = "";
        
        const setupPanel = document.getElementById("sala-setup-panel");
        const activePanel = document.getElementById("sala-active-panel");
        if (setupPanel) setupPanel.style.display = "block";
        if (activePanel) activePanel.style.display = "none";
    }
}, 900);
