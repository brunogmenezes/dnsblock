      <script>
        // --- Dashboard State & Constants ---
        const hasPermDomainsDelete = <%= hasPermission('domains.delete') %>;
        const hasPermNoticesDelete = <%= hasPermission('notices.delete_full') %>;

        const state = {
          notices: { page: 1, limit: 10, total: 0, search: '', activeId: null },
          domains: { page: 1, limit: 50, total: 0, search: '', noticeId: null },
          global: { page: 1, limit: 10, total: 0, search: '' }
        };

        // --- Utility Functions ---
        function formatDate(dateStr) {
          if (!dateStr) return '-';
          return new Date(dateStr).toLocaleString('pt-BR');
        }

        function getStatusColor(status) {
          switch(status) {
            case 'informed': case 'Respondido': return '#10b981';
            case 'blocked': case 'Bloqueado': return '#3b82f6';
            default: return '#64748b';
          }
        }

        function translateStatus(status) {
          switch(status) {
            case 'informed': return 'Respondido';
            case 'blocked': return 'Bloqueado';
            case 'registered': return 'Cadastrado';
            default: return status;
          }
        }

        // --- Core Loading Functions ---
        async function loadNotices() {
          const container = document.getElementById('notice-list-container');
          container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Buscando ofícios...</div>';

          try {
            const res = await fetch(`/api/notices?page=${state.notices.page}&limit=${state.notices.limit}&search=${encodeURIComponent(state.notices.search)}`);
            const data = await res.json();
            
            state.notices.total = data.total;
            document.getElementById('notices-total-badge').textContent = data.total;
            
            if (data.notices.length === 0) {
              container.innerHTML = '<div class="detail-empty-state"><p>Nenhum ofício encontrado.</p></div>';
            } else {
              container.innerHTML = data.notices.map(n => `
                <div class="notice-item ${state.notices.activeId === n.id ? 'active' : ''}" onclick="selectNotice(${n.id}, '${n.notice_code}')">
                  <div class="notice-item-top">
                    <span class="notice-item-code">${n.notice_code}</span>
                    <span class="notice-item-status" style="background: ${getStatusColor(n.status)}20; color: ${getStatusColor(n.status)}">
                      ${translateStatus(n.status)}
                    </span>
                  </div>
                  <div class="notice-item-meta">
                    <span>${formatDate(n.created_at)}</span>
                    <span style="font-weight: 600;">${n.active_domains} domínios</span>
                  </div>
                </div>
              `).join('');
            }
            updatePagination('notice', state.notices);
          } catch (err) {
            container.innerHTML = '<div class="alert alert-error">Erro ao carregar ofícios.</div>';
          }
        }

        async function loadDomains() {
          if (!state.domains.noticeId) return;
          const container = document.getElementById('domain-list-container');
          container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Carregando domínios...</div>';

          try {
            const res = await fetch(`/api/notices/${state.domains.noticeId}/domains?page=${state.domains.page}&limit=${state.domains.limit}&search=${encodeURIComponent(state.domains.search)}`);
            const data = await res.json();
            state.domains.total = data.total;
            
            if (data.domains.length === 0) {
              container.innerHTML = '<div class="detail-empty-state"><p>Nenhum domínio ativo neste ofício.</p></div>';
            } else {
              container.innerHTML = `
                <table class="table-compact">
                  <thead>
                    <tr>
                      <th>Domínio</th>
                      <th>Última Execução</th>
                      <th style="text-align: center;">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.domains.map(d => `
                      <tr>
                        <td><strong>${d.domain_name}</strong></td>
                        <td>${formatDate(d.executed_at)}</td>
                        <td style="text-align: center;">
                          ${hasPermDomainsDelete ? `
                            <form method="post" action="/domains/delete/by-domain" class="delete-form" data-confirm="Excluir domínio ${d.domain_name}?" style="margin:0;">
                              <input type="hidden" name="domainName" value="${d.domain_name}" />
                              <button type="submit" class="btn-danger" title="Excluir" style="padding: 4px;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                            </form>
                          ` : '-'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `;
            }
            updatePagination('domain', state.domains);
          } catch (err) {
            container.innerHTML = '<div class="alert alert-error">Erro ao carregar domínios.</div>';
          }
        }

        async function loadGlobal() {
          const tbody = document.getElementById('global-domains-body');
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Buscando dados globais...</td></tr>';

          try {
            const res = await fetch(`/api/domains/global?page=${state.global.page}&limit=${state.global.limit}&search=${encodeURIComponent(state.global.search)}`);
            const data = await res.json();
            state.global.total = data.total;
            
            if (data.domains.length === 0) {
              tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Nenhum domínio encontrado.</td></tr>';
            } else {
              tbody.innerHTML = data.domains.map(d => `
                <tr>
                  <td><strong>${d.domain_name}</strong></td>
                  <td><span class="badge" style="background: var(--bg-soft); color: var(--text);">${d.notice_code || 'Sem ofício'}</span></td>
                  <td>${formatDate(d.created_at)}</td>
                  <td>${formatDate(d.executed_at)}</td>
                  <td style="text-align: center;">
                    <div class="action-buttons">
                      ${hasPermDomainsDelete ? `
                        <form method="post" action="/domains/delete/by-domain" class="delete-form" data-confirm="Excluir domínio ${d.domain_name}?" style="margin:0;">
                          <input type="hidden" name="domainName" value="${d.domain_name}" />
                          <button type="submit" class="btn-danger" title="Excluir" style="padding: 4px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                        </form>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('');
            }
            updatePagination('global', state.global);
          } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Erro ao carregar dados.</td></tr>';
          }
        }

        // --- Interaction Logic ---
        function selectNotice(id, code) {
          state.notices.activeId = id;
          state.domains.noticeId = id;
          state.domains.page = 1;
          
          document.querySelectorAll('.notice-item').forEach(el => el.classList.remove('active'));
          const item = document.querySelector(`.notice-item[onclick*="selectNotice(${id}"]`);
          if (item) item.classList.add('active');

          document.querySelector('#detail-header h3').textContent = `Ofício: ${code}`;
          document.getElementById('domain-search-container').style.display = 'block';
          document.getElementById('domain-pagination').style.display = 'flex';
          
          const actionsDiv = document.getElementById('detail-actions');
          actionsDiv.style.display = 'flex';
          actionsDiv.innerHTML = `
            <a href="/notices/${id}/download" class="btn-link" style="font-size: 0.85rem;">Baixar PDF</a>
            ${hasPermNoticesDelete ? `
              <form method="post" action="/domains/delete/by-notice" class="delete-form" data-confirm="Deseja excluir todos os domínios do ofício ${code}?" style="margin:0;">
                <input type="hidden" name="noticeCode" value="${code}" />
                <button type="submit" class="btn-danger" style="padding: 4px 10px; font-size: 0.75rem;">Excluir Tudo</button>
              </form>
            ` : ''}
          `;
          loadDomains();
        }

        function updatePagination(prefix, slice) {
          const totalPages = Math.max(1, Math.ceil(slice.total / slice.limit));
          const pageInfo = document.getElementById(`${prefix}-page-info`);
          if (pageInfo) pageInfo.textContent = `Pág. ${slice.page} de ${totalPages}`;
          
          const prevBtn = document.getElementById(`${prefix}-prev`);
          const nextBtn = document.getElementById(`${prefix}-next`);
          if (prevBtn) prevBtn.disabled = slice.page <= 1;
          if (nextBtn) nextBtn.disabled = slice.page >= totalPages;
        }

        // --- Confirmation & AJAX Deletion ---
        let confirmModal = null;
        let confirmForm = null;

        function showConfirmModal(message, form, isDestructive) {
          if (!confirmModal) {
            confirmModal = document.createElement('div');
            confirmModal.className = 'confirm-backdrop';
            confirmModal.innerHTML = `
              <div class="confirm-modal">
                <h3 class="confirm-modal-title">Confirmação</h3>
                <p class="confirm-modal-body" id="confirm-message-text"></p>
                <div class="confirm-modal-actions">
                  <button type="button" class="btn-cancel" id="btn-modal-cancel">Cancelar</button>
                  <button type="button" class="btn-confirm" id="btn-modal-ok">Confirmar</button>
                </div>
              </div>
            `;
            document.body.appendChild(confirmModal);
            confirmModal.addEventListener('click', (e) => {
              if (e.target === confirmModal || e.target.id === 'btn-modal-cancel') closeModal();
            });
            document.getElementById('btn-modal-ok').onclick = () => {
              const currentForm = confirmForm;
              closeModal();
              if (currentForm) {
                if (currentForm.classList.contains('delete-form')) {
                  handleDeletion(currentForm);
                } else {
                  currentForm.submit();
                }
              }
            };
          }
          
          confirmForm = form;
          document.getElementById('confirm-message-text').textContent = message;
          const okBtn = document.getElementById('btn-modal-ok');
          if (isDestructive) okBtn.classList.remove('success'); else okBtn.classList.add('success');
          confirmModal.classList.remove('out');
          confirmModal.style.display = 'flex';
        }

        function closeModal() {
          if (confirmModal) {
            confirmModal.classList.add('out');
            setTimeout(() => { confirmModal.style.display = 'none'; confirmForm = null; }, 160);
          }
        }

        async function handleDeletion(form) {
          const formData = new FormData(form);
          const data = {};
          formData.forEach((v, k) => data[k] = v);
          
          const submitBtn = form.querySelector('button[type="submit"]');
          const originalContent = submitBtn ? submitBtn.innerHTML : null;
          if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '...'; }

          try {
            const res = await fetch(form.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(data)
            });

            const resData = await res.json();
            if (res.ok) {
              loadNotices();
              if (state.domains.noticeId) loadDomains();
              loadGlobal();
              if (window.showToast) window.showToast(resData.message || 'Sucesso!', 'success');
            } else {
              if (window.showToast) window.showToast(resData.error || 'Erro!', 'error');
            }
          } catch (err) {
            console.error('Erro:', err);
            if (window.showToast) window.showToast('Falha na comunicação.', 'error');
          } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalContent; }
          }
        }

        // --- Event Listeners ---
        document.addEventListener('submit', (e) => {
          const form = e.target.closest('form[data-confirm]');
          if (form) {
            e.preventDefault();
            showConfirmModal(form.getAttribute('data-confirm'), form, form.getAttribute('data-destructive') === 'true');
          }
        });

        document.getElementById('notice-search').addEventListener('input', (e) => {
          state.notices.search = e.target.value; state.notices.page = 1; loadNotices();
        });
        document.getElementById('domain-search').addEventListener('input', (e) => {
          state.domains.search = e.target.value; state.domains.page = 1; loadDomains();
        });
        document.getElementById('global-domain-search').addEventListener('input', (e) => {
          state.global.search = e.target.value; state.global.page = 1; loadGlobal();
        });

        document.getElementById('notice-prev').onclick = () => { state.notices.page--; loadNotices(); };
        document.getElementById('notice-next').onclick = () => { state.notices.page++; loadNotices(); };
        document.getElementById('domain-prev').onclick = () => { state.domains.page--; loadDomains(); };
        document.getElementById('domain-next').onclick = () => { state.domains.page++; loadDomains(); };
        document.getElementById('global-prev').onclick = () => { state.global.page--; loadGlobal(); };
        document.getElementById('global-next').onclick = () => { state.global.page++; loadGlobal(); };

        window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

        // --- Initial Load ---
        loadNotices();
        loadGlobal();
      </script>
