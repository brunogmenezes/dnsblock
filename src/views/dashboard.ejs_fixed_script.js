      <script>
        // Custom Modal Confirmation logic (reused and improved)
        (function () {
          let confirmModal = null;
          let confirmForm = null;

          function createConfirmModal() {
            const backdrop = document.createElement('div');
            backdrop.className = 'confirm-backdrop';
            backdrop.id = 'confirm-backdrop';
            backdrop.addEventListener('click', (e) => e.target === backdrop && closeModal());
            backdrop.innerHTML = `
              <div class="confirm-modal" id="confirm-modal">
                <h3 class="confirm-modal-title">Confirmação</h3>
                <p class="confirm-modal-body" id="confirm-message">Tem certeza?</p>
                <div class="confirm-modal-actions">
                  <button type="button" class="btn-cancel" id="confirm-cancel">Cancelar</button>
                  <button type="button" class="btn-confirm" id="confirm-ok">Confirmar</button>
                </div>
              </div>
            `;
            document.body.appendChild(backdrop);
            confirmModal = backdrop;
            
            document.getElementById('confirm-cancel').onclick = closeModal;
            document.getElementById('confirm-ok').onclick = () => {
              closeModal();
              if (confirmForm) {
                // Se for um formulário de exclusão, trata via AJAX
                if (confirmForm.classList.contains('delete-form')) {
                  handleDeletion(confirmForm);
                } else {
                  confirmForm.submit();
                }
              }
            };
          }

          function closeModal() {
            if (confirmModal) {
              confirmModal.classList.add('out');
              setTimeout(() => {
                if (confirmModal && confirmModal.parentNode) {
                  confirmModal.parentNode.removeChild(confirmModal);
                }
                confirmModal = null;
                confirmForm = null;
              }, 160);
            }
          }

          function showConfirmModal(message, form, isDestructive) {
            if (!confirmModal) createConfirmModal();
            confirmForm = form;
            document.getElementById('confirm-message').textContent = message;
            const btn = document.getElementById('confirm-ok');
            if (isDestructive) {
              btn.classList.remove('success');
            } else {
              btn.classList.add('success');
            }
          }

          async function handleDeletion(form) {
            const formData = new FormData(form);
            const data = {};
            formData.forEach((value, key) => data[key] = value);
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalContent = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '...';

            try {
              const res = await fetch(form.action, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify(data)
              });

              const responseData = await res.json();
              if (res.ok) {
                // Recarrega os dados sem reload da página
                if (typeof loadNotices === 'function') loadNotices();
                if (state.domains.noticeId && typeof loadDomains === 'function') loadDomains();
                if (typeof loadGlobal === 'function') loadGlobal();
                
                if (window.showToast) {
                  window.showToast(responseData.message || 'Operação realizada com sucesso!', 'success');
                } else {
                  alert(responseData.message || 'Excluído com sucesso!');
                }
              } else {
                alert(responseData.error || 'Erro ao realizar exclusão.');
              }
            } catch (err) {
              console.error('Erro na exclusão:', err);
              alert('Erro de conexão ao tentar excluir.');
            } finally {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalContent;
            }
          }

          document.addEventListener('submit', (e) => {
            const form = e.target.closest('form[data-confirm]');
            if (form) {
              e.preventDefault();
              showConfirmModal(form.getAttribute('data-confirm'), form, form.getAttribute('data-destructive') === 'true');
            }
          });

          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
          });
        })();
      </script>
