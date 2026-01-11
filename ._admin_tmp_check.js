// ====== CONFIG ======
    // تغيير الباسورد من هنا
    const ADMIN_PASSWORD = 'artrova123';

    const TOKEN_STORE_KEY = 'artrova_admin_gh_token_v1';

    // إعدادات GitHub (ثابتة لتبسيط الاستخدام)
    // غيّرها مرة واحدة ثم ارفع الملف على GitHub
    const GITHUB_OWNER = 'Artovastudio';
    const GITHUB_REPO = 'Artrova';
    const GITHUB_BRANCH = 'main';

    // ملاحظة: لا نستخدم localStorage/sessionStorage لتجنب قيود المتصفح (Tracking Prevention)
    const state = {
      authed: false,
      data: { source: 'portfolio_projects', count: 0, projects: [] },
      selectedSlug: null,
      deleteSet: new Set(),
      renameMap: new Map(),
      dragExistingIndex: null,
      /** @type {Array<{file: File, previewUrl: string, name: string, targetPath: (string|null), appliedPath: (string|null), projectSlug: (string|null)}>} */
      uploads: []
    };

    // ====== UTILS ======
    const $ = (id) => document.getElementById(id);

    function isFileProtocol() {
      try { return window.location && window.location.protocol === 'file:'; } catch (e) { return false; }
    }

    function slugify(input) {
      return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-_]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^\-+|\-+$/g, '') || 'project';
    }

    function sanitizeFilename(name) {
      const cleaned = String(name || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .replace(/-+/g, '-');
      return cleaned || 'image';
    }

    function getProjectBySlug(slug) {
      return (state.data.projects || []).find(p => p.slug === slug) || null;
    }

    function findProjectByImagePath(path) {
      const projects = state.data && Array.isArray(state.data.projects) ? state.data.projects : [];
      for (const p of projects) {
        if (p && Array.isArray(p.images) && p.images.includes(path)) return p;
      }
      return null;
    }

    function getProjectTitle(p) {
      if (!p) return '';
      const ar = String(p.titleAr || '').trim();
      const en = String(p.titleEn || '').trim();
      const any = String(p.title || '').trim();
      if (ar && en && ar.toLowerCase() !== en.toLowerCase()) return `${ar} | ${en}`;
      return ar || en || any || p.slug;
    }

    function updateCounts() {
      $('projectCount').textContent = String((state.data.projects || []).length);
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      $('imgCount').textContent = p && Array.isArray(p.images) ? String(p.images.length) : '0';
      $('uploadCount').textContent = String(state.uploads.length);
    }

    function setStatus(text, kind) {
      const box = $('statusBox');
      box.textContent = text;
      box.classList.remove('danger', 'ok');
      if (kind === 'danger') box.classList.add('danger');
      if (kind === 'ok') box.classList.add('ok');
    }

    function setProgress(current, total) {
      const wrap = $('progressWrap');
      const bar = $('progressBar');
      const text = $('progressText');
      const pct = total ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
      wrap.classList.remove('hidden');
      bar.style.width = `${pct}%`;
      text.textContent = `${pct}% (${current}/${total})`;
    }

    function clearProgress() {
      const wrap = $('progressWrap');
      const bar = $('progressBar');
      const text = $('progressText');
      wrap.classList.add('hidden');
      bar.style.width = '0%';
      text.textContent = '0%';
    }

    function formatError(e) {
      if (!e) return 'Unknown error';
      if (typeof e === 'string') return e;
      const msg = e && e.message ? String(e.message) : String(e);
      const status = e && e.status ? ` (HTTP ${e.status})` : '';
      return `${msg}${status}`;
    }

    function handleError(userPrefix, e) {
      try { console.error(userPrefix, e); } catch (_) {}
      setStatus(`${userPrefix}: ${formatError(e)}`, 'danger');
    }

    function downloadText(filename, content) {
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    // ====== RENDER ======
    function renderProjects() {
      const list = $('projectList');
      list.innerHTML = '';
      const projects = (state.data.projects || []).slice().sort((a,b) => String(getProjectTitle(a)).localeCompare(String(getProjectTitle(b))));

      for (const p of projects) {
        const div = document.createElement('div');
        div.className = 'project-card' + (p.slug === state.selectedSlug ? ' active' : '');
        const cover = (p && p.cover) ? String(p.cover) : ((p && Array.isArray(p.images) && p.images[0]) ? String(p.images[0]) : '');
        const count = (p && Array.isArray(p.images)) ? p.images.length : 0;
        div.innerHTML = `
          <div class="thumb">${cover ? `<img src="${cover.replace(/"/g,'&quot;')}" alt="" loading="lazy" decoding="async" />` : ''}</div>
          <div class="count">${count}</div>
          <div class="overlay"></div>
        `;
        div.querySelector('.overlay').textContent = getProjectTitle(p);
        div.addEventListener('click', () => selectProject(p.slug));
        list.appendChild(div);
      }

      updateCounts();
    }

    function renderExistingImages() {
      const wrap = $('existingImages');
      wrap.innerHTML = '';
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      const imgs = p && Array.isArray(p.images) ? p.images : [];

      for (let idx = 0; idx < imgs.length; idx++) {
        const path = imgs[idx];
        const originalPath = path;
        const currentFile = String(path).split('/').pop() || '';
        const currentDir = String(path).split('/').slice(0, -1).join('/');
        const card = document.createElement('div');
        card.className = 'img-card';
        card.draggable = true;
        card.dataset.idx = String(idx);
        card.innerHTML = `
          <div class="thumb"></div>
          <div class="img-actions">
            <button class="img-action-btn" data-act="edit" type="button" aria-label="تعديل الاسم">✎</button>
            <button class="img-action-btn danger" data-act="delete" type="button" aria-label="حذف">×</button>
          </div>
          <div class="body">
            <div class="col">
              <label>اسم الملف (تغيير الاسم يحدّث JSON فقط)</label>
              <input type="text" value="${currentFile.replace(/\"/g,'&quot;')}" />
            </div>
            <div class="flags">
              <span class="btn small" style="cursor:grab; user-select:none;">اسحب لترتيب</span>
              <button class="btn small" data-act="close" type="button">إغلاق</button>
            </div>
          </div>
        `;

        const thumb = card.querySelector('.thumb');
        const img = document.createElement('img');
        img.src = path;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        thumb.appendChild(img);

        const nameInput = card.querySelector('input');
        nameInput.addEventListener('input', (e) => {
          const newName = sanitizeFilename(e.target.value);
          const newPath = (currentDir ? `${currentDir}/${newName}` : newName);
          const fromPath = originalPath;
          if (!newPath || newPath === fromPath) {
            state.renameMap.delete(fromPath);
            return;
          }

          imgs[idx] = newPath;
          state.renameMap.set(fromPath, newPath);

          // if it was marked delete, move mark to new path
          if (state.deleteSet.has(fromPath)) {
            state.deleteSet.delete(fromPath);
            state.deleteSet.add(newPath);
          }
        });

        card.querySelector('[data-act="edit"]').addEventListener('click', (e) => {
          e.preventDefault();
          card.classList.toggle('open');
          try { if (card.classList.contains('open')) nameInput.focus(); } catch (e) {}
        });
        card.querySelector('[data-act="close"]').addEventListener('click', (e) => {
          e.preventDefault();
          card.classList.remove('open');
        });
        card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
          await deleteImage(imgs[idx]);
        });

        card.addEventListener('dragstart', () => {
          state.dragExistingIndex = idx;
          try { card.style.opacity = '0.6'; } catch (e) {}
        });
        card.addEventListener('dragend', () => {
          state.dragExistingIndex = null;
          try { card.style.opacity = '1'; } catch (e) {}
        });
        card.addEventListener('dragover', (ev) => {
          ev.preventDefault();
        });
        card.addEventListener('drop', (ev) => {
          ev.preventDefault();
          if (state.dragExistingIndex === null || state.dragExistingIndex === idx) return;
          reorderExisting(state.dragExistingIndex, idx);
          state.dragExistingIndex = null;
          renderExistingImages();
        });

        wrap.appendChild(card);
      }

      updateCounts();
    }

    function renderUploadPreview() {
      const wrap = $('uploadPreview');
      wrap.innerHTML = '';

      state.uploads.forEach((u, idx) => {
        const card = document.createElement('div');
        card.className = 'img-card';
        card.innerHTML = `
          <div class="thumb"><img src="${u.previewUrl}" alt="" /></div>
          <div class="img-actions">
            <button class="img-action-btn" data-act="edit" type="button" aria-label="تعديل">✎</button>
            <button class="img-action-btn small" data-act="up" type="button" aria-label="أعلى">↑</button>
            <button class="img-action-btn small" data-act="down" type="button" aria-label="أسفل">↓</button>
            <button class="img-action-btn danger" data-act="remove" type="button" aria-label="حذف">×</button>
          </div>
          <div class="body">
            <div class="col">
              <label>اسم الملف</label>
              <input type="text" value="${u.name.replace(/\"/g,'&quot;')}" />
            </div>
            <div class="col">
              <label>المسار النهائي</label>
              <input type="text" value="${String(u.targetPath || 'غير محدد بعد (اضغط إضافة الصور للمشروع)').replace(/\"/g,'&quot;')}" disabled />
            </div>
            <div class="flags">
              <button class="btn small" data-act="close" type="button">إغلاق</button>
              <span class="pill" style="justify-content:center;">اسحب/رتّب من الأسهم</span>
            </div>
          </div>
        `;

        const input = card.querySelector('input');
        input.addEventListener('input', (e) => {
          const newName = sanitizeFilename(e.target.value);
          state.uploads[idx].name = newName;

          // If already applied to project, keep JSON + targetPath in sync
          const applied = state.uploads[idx].appliedPath;
          const target = state.uploads[idx].targetPath;
          if (applied && target) {
            const dir = String(target).split('/').slice(0, -1).join('/');
            const newPath = dir ? `${dir}/${newName}` : newName;

            // Update the correct project's images array (do not rely on selected project)
            const p = findProjectByImagePath(applied);
            if (p && Array.isArray(p.images)) {
              const ix = p.images.indexOf(applied);
              if (ix !== -1) {
                p.images[ix] = newPath;
                p.cover = p.images[0] || '';
                p.imageCount = p.images.length;
              }
            }

            state.uploads[idx].targetPath = newPath;
            state.uploads[idx].appliedPath = newPath;
            renderUploadPreview();
          }
        });

        card.querySelector('[data-act="edit"]').addEventListener('click', (e) => {
          e.preventDefault();
          card.classList.toggle('open');
          try { if (card.classList.contains('open')) input.focus(); } catch (e) {}
        });
        card.querySelector('[data-act="close"]').addEventListener('click', (e) => {
          e.preventDefault();
          card.classList.remove('open');
        });

        card.querySelector('[data-act="up"]').addEventListener('click', (e) => {
          e.preventDefault();
          moveUpload(idx, -1);
        });
        card.querySelector('[data-act="down"]').addEventListener('click', (e) => {
          e.preventDefault();
          moveUpload(idx, 1);
        });
        card.querySelector('[data-act="remove"]').addEventListener('click', (e) => {
          e.preventDefault();
          removeUpload(idx);
        });

        wrap.appendChild(card);
      });

      updateCounts();
    }

    function refreshUI() {
      renderProjects();
      renderExistingImages();
      renderUploadPreview();
      updateActionsEnabled();
    }

    // ====== ACTIONS ======
    function selectProject(slug) {
      state.selectedSlug = slug;
      state.deleteSet.clear();
      state.uploads.forEach(u => URL.revokeObjectURL(u.previewUrl));
      state.uploads = [];

      const p = getProjectBySlug(slug);
      $('selectedTitle').textContent = p ? getProjectTitle(p) : 'اختر مشروع';
      if ($('editTitleAr')) $('editTitleAr').value = p ? (p.titleAr || '') : '';
      if ($('editTitleEn')) $('editTitleEn').value = p ? (p.titleEn || '') : '';
      refreshUI();
    }

    function updateActionsEnabled() {
      const hasProject = !!state.selectedSlug && !!getProjectBySlug(state.selectedSlug);
      $('btnDeleteProject').disabled = !hasProject;
      $('imagePicker').disabled = !hasProject;
      $('btnAutoNames').disabled = !hasProject || state.uploads.length === 0;
      $('btnApplyUploads').disabled = !hasProject || state.uploads.length === 0;
      if ($('btnReorder')) $('btnReorder').disabled = !hasProject;
      if ($('editTitleAr')) $('editTitleAr').disabled = !hasProject;
      if ($('editTitleEn')) $('editTitleEn').disabled = !hasProject;
      if ($('btnSaveProjectTitles')) $('btnSaveProjectTitles').disabled = !hasProject;

      const canExport = !!(state.data && Array.isArray(state.data.projects));
      $('btnExportJson').disabled = !canExport;
      $('btnPublish').disabled = !canExport;
      if ($('btnSync')) $('btnSync').disabled = !canExport;
    }

    function openReorderModal() {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p || !Array.isArray(p.images) || !p.images.length) {
        alert('لا يوجد صور لترتيبها');
        return;
      }
      state.reorderDraft = p.images.slice();
      $('reorderModal').classList.remove('hidden');
      renderReorderList();
    }

    function closeReorderModal() {
      $('reorderModal').classList.add('hidden');
      state.reorderDraft = null;
    }

    function autoSortReorderDraft() {
      if (!Array.isArray(state.reorderDraft)) return;
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      state.reorderDraft.sort((a, b) => {
        const aa = String(a).split('/').pop() || '';
        const bb = String(b).split('/').pop() || '';
        return collator.compare(aa, bb);
      });
      renderReorderList();
    }

    function renderReorderList() {
      const list = $('reorderList');
      list.innerHTML = '';
      const draft = Array.isArray(state.reorderDraft) ? state.reorderDraft : [];
      let dragIndex = null;

      for (let i = 0; i < draft.length; i++) {
        const path = draft[i];
        const file = String(path).split('/').pop() || '';
        const card = document.createElement('div');
        card.className = 'reorder-item';
        card.draggable = true;
        card.dataset.idx = String(i);
        card.innerHTML = `
          <div class="thumb"><img src="${path}" alt="" loading="lazy" decoding="async" /></div>
          <div class="info">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <span class="pill">${i === 0 ? 'غلاف' : String(i + 1)}</span>
              <span class="handle" title="اسحب">⇅</span>
            </div>
            <div class="notice" style="margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file}</div>
          </div>
        `;

        card.addEventListener('dragstart', (ev) => {
          dragIndex = i;
          card.classList.add('dragging');
          try { ev.dataTransfer.effectAllowed = 'move'; } catch (e) {}
        });
        card.addEventListener('dragend', () => {
          dragIndex = null;
          card.classList.remove('dragging');
        });
        card.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {}
        });
        card.addEventListener('drop', (ev) => {
          ev.preventDefault();
          const toIndex = parseInt(card.dataset.idx, 10);
          if (dragIndex === null || Number.isNaN(toIndex) || dragIndex === toIndex) return;
          const arr = state.reorderDraft;
          const [moved] = arr.splice(dragIndex, 1);
          arr.splice(toIndex, 0, moved);
          renderReorderList();
        });

        list.appendChild(card);
      }
    }

    function saveReorderDraft() {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p || !Array.isArray(state.reorderDraft) || !state.reorderDraft.length) return;
      p.images = state.reorderDraft.slice();
      p.cover = p.images[0] || '';
      p.imageCount = p.images.length;
      closeReorderModal();
      refreshUI();
      setStatus('تم حفظ ترتيب الصور محليًا. اضغط "حفظ + رفع على GitHub" لتحديث الموقع.', 'ok');
    }

    async function syncNow() {
      const token = $('ghToken').value.trim();
      if (!token) {
        alert('الصق GitHub Token');
        return;
      }
      const pendingNoTarget = state.uploads.filter(u => !!u && !!u.file && !u.targetPath);
      if (pendingNoTarget.length) applyUploadsToProject();
      await publish();
    }

    function saveProjectTitles() {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p) return;
      const ar = String($('editTitleAr').value || '').trim();
      const en = String($('editTitleEn').value || '').trim();
      p.titleAr = ar || null;
      p.titleEn = en || null;
      p.title = (en || ar || p.slug);
      $('selectedTitle').textContent = getProjectTitle(p);
      renderProjects();
      setStatus('تم حفظ الاسم محليًا. اضغط "نشر التعديلات" لتحديث GitHub.', 'ok');
    }

    function tryLoadRememberedToken() {
      try {
        const t = localStorage.getItem(TOKEN_STORE_KEY);
        if (t && $('ghToken')) $('ghToken').value = t;
      } catch (e) {}
    }

    function rememberToken() {
      const token = $('ghToken').value.trim();
      if (!token) {
        alert('الصق التوكن أولاً');
        return;
      }
      try {
        localStorage.setItem(TOKEN_STORE_KEY, token);
        setStatus('تم حفظ التوكن على هذا الجهاز. (لو المتصفح يمنع التخزين، سيُطلب منك كل مرة).', 'ok');
      } catch (e) {
        setStatus('المتصفح منع حفظ التوكن على هذا الجهاز. ستحتاج لصقه كل مرة.', 'danger');
      }
    }

    function addProject() {
      const titleAr = $('newTitleAr').value.trim();
      const titleEn = $('newTitleEn').value.trim();
      const slugInput = $('newSlug').value.trim();

      const base = slugInput || titleEn || titleAr;
      const slug = slugify(base);

      if (!titleAr && !titleEn) {
        alert('اكتب اسم المشروع عربي أو إنجليزي.');
        return;
      }
      if ((state.data.projects || []).some(p => p.slug === slug)) {
        alert('Slug موجود بالفعل. غيّر الـ slug.');
        return;
      }

      const proj = {
        slug,
        titleAr: titleAr || null,
        titleEn: titleEn || null,
        title: (titleEn || titleAr || slug),
        images: [],
        cover: '',
        imageCount: 0
      };

      state.data.projects.push(proj);
      state.data.count = state.data.projects.length;

      $('newTitleAr').value = '';
      $('newTitleEn').value = '';
      $('newSlug').value = '';

      selectProject(slug);
    }

    function deleteProject() {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p) return;

      const ok = confirm(`تأكيد حذف المشروع: ${getProjectTitle(p)} ؟`);
      if (!ok) return;

      // mark all images for deletion so you can export a delete list
      if (Array.isArray(p.images)) {
        for (const img of p.images) state.deleteSet.add(img);
      }

      state.data.projects = (state.data.projects || []).filter(x => x.slug !== p.slug);
      state.data.count = state.data.projects.length;
      state.selectedSlug = null;
      $('selectedTitle').textContent = 'اختر مشروع';

      refreshUI();
    }

    async function deleteImage(path) {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p || !Array.isArray(p.images)) return;

      const ok = confirm('تأكيد حذف الصورة نهائيًا من المشروع؟ (سيتم حذفها من GitHub عند نشر التعديلات)');
      if (!ok) return;

      const token = $('ghToken') ? $('ghToken').value.trim() : '';

      const prevImages = Array.isArray(p.images) ? p.images.slice() : [];
      const prevCover = p.cover;
      const prevCount = p.imageCount;
      const prevDeleteHad = state.deleteSet.has(path);

      // Remove from current project JSON immediately
      p.images = p.images.filter(x => x !== path);
      p.cover = (p.images || [])[0] || '';
      p.imageCount = (p.images || []).length;

      // Ensure it gets deleted on publish
      state.deleteSet.add(path);

      // If this path is involved in a pending rename, remove that plan and delete both sides just in case
      for (const [fromSite, toSite] of Array.from(state.renameMap.entries())) {
        if (fromSite === path || toSite === path) {
          state.deleteSet.add(fromSite);
          state.deleteSet.add(toSite);
          state.renameMap.delete(fromSite);
        }
      }

      renderExistingImages();
      renderProjects();
      updateCounts();

      if (!token) {
        setStatus('تم حذف الصورة من المشروع محليًا. الصق GitHub Token ثم اضغط "نشر التعديلات" للحذف النهائي من GitHub.', 'ok');
        return;
      }

      const owner = GITHUB_OWNER;
      const repo = GITHUB_REPO;
      const branch = GITHUB_BRANCH;
      const gh = createGithubClient(owner, repo, branch, token);

      try {
        const repoPath = sitePathToRepoPath(path);
        setStatus(`حذف من GitHub: ${repoPath}`, '');
        setProgress(1, 2);

        // Delete the file from repo
        const meta = await gh.getFileMeta(repoPath, branch, true);
        if (!meta || !meta.sha) throw new Error('تعذر الحصول على SHA للملف قبل الحذف');
        await gh.deleteFile(repoPath, `Delete portfolio image: ${repoPath}`, meta.sha);

        // Update JSON on GitHub so the deletion is reflected immediately
        setStatus('تحديث data/portfolio_projects.json ...', '');
        setProgress(2, 2);
        const payload = {
          source: 'portfolio_projects',
          count: (state.data.projects || []).length,
          projects: state.data.projects
        };
        await putPortfolioProjectsJsonWithRetry(gh, payload, branch);

        clearProgress();
        setStatus('تم حذف الصورة نهائيًا من GitHub وتحديث البيانات ✅', 'ok');
      } catch (e) {
        clearProgress();
        // Revert local state so there is no hidden/pending mismatch
        p.images = prevImages;
        p.cover = prevCover;
        p.imageCount = prevCount;
        if (!prevDeleteHad) state.deleteSet.delete(path);
        refreshUI();
        handleError('فشل حذف الصورة من GitHub', e);
      }
    }

    function moveExisting(index, delta) {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p || !Array.isArray(p.images)) return;
      const next = index + delta;
      if (next < 0 || next >= p.images.length) return;
      const arr = p.images;
      const tmp = arr[index];
      arr[index] = arr[next];
      arr[next] = tmp;
      p.cover = arr[0] || '';
      p.imageCount = arr.length;
      renderExistingImages();
    }

    function reorderExisting(fromIndex, toIndex) {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p || !Array.isArray(p.images)) return;
      const arr = p.images;
      if (fromIndex < 0 || fromIndex >= arr.length) return;
      if (toIndex < 0 || toIndex >= arr.length) return;
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      p.cover = arr[0] || '';
      p.imageCount = arr.length;
    }

    function onPickFiles(files) {
      const picked = Array.from(files || []);
      if (!picked.length) return;

      for (const f of picked) {
        const url = URL.createObjectURL(f);
        state.uploads.push({ file: f, previewUrl: url, name: sanitizeFilename(f.name), targetPath: null, appliedPath: null, projectSlug: null });
      }

      renderUploadPreview();
      updateActionsEnabled();
    }

    function moveUpload(index, delta) {
      const next = index + delta;
      if (next < 0 || next >= state.uploads.length) return;
      const tmp = state.uploads[index];
      state.uploads[index] = state.uploads[next];
      state.uploads[next] = tmp;
      renderUploadPreview();
    }

    function removeUpload(index) {
      const u = state.uploads[index];
      if (u) URL.revokeObjectURL(u.previewUrl);
      state.uploads.splice(index, 1);
      renderUploadPreview();
      updateActionsEnabled();
    }

    function autoNameUploads() {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p) return;

      const extFrom = (fileName) => {
        const dot = fileName.lastIndexOf('.');
        return dot !== -1 ? fileName.slice(dot).toLowerCase() : '.jpg';
      };

      let start = 1;
      if (Array.isArray(p.images) && p.images.length) {
        // find max number in existing filenames for this slug
        const rx = new RegExp(`${p.slug}-?(\\d{3,})`, 'i');
        for (const img of p.images) {
          const file = String(img).split('/').pop() || '';
          const m = file.match(rx);
          if (m && m[1]) {
            const n = parseInt(m[1], 10);
            if (!Number.isNaN(n)) start = Math.max(start, n + 1);
          }
        }
      }

      for (let i = 0; i < state.uploads.length; i++) {
        const u = state.uploads[i];
        const ext = extFrom(u.name || u.file.name);
        const num = String(start + i).padStart(3, '0');
        state.uploads[i].name = sanitizeFilename(`${p.slug}-${num}${ext}`);
      }

      renderUploadPreview();
    }

    function applyUploadsToProject() {
      const p = state.selectedSlug ? getProjectBySlug(state.selectedSlug) : null;
      if (!p) return;

      const baseDir = `assets/site_images/projects/portfolio_projects/${p.slug}`;

      const used = new Set((p.images || []).map(x => String(x).split('/').pop() || ''));
      const pendingUploads = state.uploads.filter(u => !!u && !!u.file && !u.targetPath);
      for (const u of pendingUploads) {
        let fileName = sanitizeFilename(u.name);
        if (!fileName) fileName = sanitizeFilename(u.file.name);
        // ensure unique
        if (used.has(fileName)) {
          const dot = fileName.lastIndexOf('.');
          const ext = dot !== -1 ? fileName.slice(dot) : '';
          const stem = dot !== -1 ? fileName.slice(0, dot) : fileName;
          let k = 2;
          while (used.has(`${stem}-${k}${ext}`)) k++;
          fileName = `${stem}-${k}${ext}`;
        }
        used.add(fileName);
        const relPath = `${baseDir}/${fileName}`;
        p.images = Array.isArray(p.images) ? p.images : [];
        p.images.push(relPath);

        // bind upload to its final target path so publish doesn't depend on current selection
        u.targetPath = relPath;
        u.appliedPath = relPath;
        u.projectSlug = p.slug;
      }
      p.cover = (p.images || [])[0] || '';
      p.imageCount = (p.images || []).length;

      setStatus('تمت إضافة الصور للمشروع. الآن اضغط "نشر التعديلات" لرفع الصور وتحديث البيانات على GitHub.', 'ok');
      refreshUI();
    }

    function exportJson() {
      const payload = {
        source: 'portfolio_projects',
        count: (state.data.projects || []).length,
        projects: state.data.projects
      };
      downloadText('portfolio_projects.json', JSON.stringify(payload, null, 2));
    }

    function createGithubClient(owner, repo, branch, token) {
      const headers = () => ({
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`
      });

      const contentsUrl = (path, ref, bustCache) => {
        const enc = encodeURIComponent(path).replace(/%2F/g, '/');
        const qs = [];
        if (ref) qs.push(`ref=${encodeURIComponent(ref)}`);
        if (bustCache) qs.push(`ts=${Date.now()}`);
        return `https://api.github.com/repos/${owner}/${repo}/contents/${enc}` + (qs.length ? `?${qs.join('&')}` : '');
      };

      const requestJson = async (url, method, payload) => {
        const res = await fetch(url, {
          method,
          cache: 'no-store',
          headers: payload ? { ...headers(), 'Content-Type': 'application/json' } : headers(),
          body: payload ? JSON.stringify(payload) : undefined
        });
        const text = await res.text();
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) {}
        if (!res.ok) {
          const msg = body && body.message ? body.message : text;
          const err = new Error(msg || `GitHub error: ${res.status}`);
          err.status = res.status;
          err.body = body;
          throw err;
        }
        return body;
      };

      const getFileMeta = (path, ref, bustCache) => requestJson(contentsUrl(path, ref, bustCache), 'GET');
      const putFile = (path, message, contentBase64, sha) => requestJson(contentsUrl(path, null), 'PUT', { message, content: contentBase64, branch, sha });
      const deleteFile = (path, message, sha) => requestJson(contentsUrl(path, null), 'DELETE', { message, branch, sha });
      const downloadToBase64 = async (downloadUrl) => {
        if (!downloadUrl) throw new Error('Missing download_url');
        const res = await fetch(downloadUrl, { headers: headers() });
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        return arrayBufferToBase64(buf);
      };

      return { getFileMeta, putFile, deleteFile, downloadToBase64 };
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function arrayBufferToBase64(buffer) {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }

    async function fileToBase64(file) {
      const buf = await file.arrayBuffer();
      return arrayBufferToBase64(buf);
    }

    async function ghDownloadToBase64(downloadUrl, token) {
      if (!downloadUrl) throw new Error('Missing download_url');
      const res = await fetch(downloadUrl, { headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      return arrayBufferToBase64(buf);
    }

    function utf8ToBase64(str) {
      return btoa(unescape(encodeURIComponent(str)));
    }

    function sitePathToRepoPath(sitePath) {
      return String(sitePath || '').replace(/^\//, '');
    }

    async function putPortfolioProjectsJsonWithRetry(gh, payload, branch) {
      const jsonPath = 'data/portfolio_projects.json';
      const jsonB64 = utf8ToBase64(JSON.stringify(payload, null, 2));

      for (let attempt = 1; attempt <= 6; attempt++) {
        try {
          let jsonSha = undefined;
          try {
            const meta = await gh.getFileMeta(jsonPath, branch, true);
            if (meta && meta.sha) jsonSha = meta.sha;
          } catch (e) {}

          await gh.putFile(jsonPath, 'Update portfolio projects data', jsonB64, jsonSha);
          return;
        } catch (e) {
          const msg = String(e && e.message ? e.message : e);
          const isShaMismatch = msg.toLowerCase().includes('does not match') || msg.toLowerCase().includes('sha') || e.status === 409;
          if (!isShaMismatch || attempt === 6) throw e;
          await delay(450 * attempt * attempt);
        }
      }
    }

    async function publish() {
      const token = $('ghToken').value.trim();
      if (!token) {
        alert('الصق GitHub Token');
        return;
      }

      const pendingNoTarget = state.uploads.filter(u => !!u && !!u.file && !u.targetPath);
      if (pendingNoTarget.length) {
        alert('في صور تم اختيارها من الجهاز لكن لم يتم إضافتها للمشروع بعد. اضغط "إضافة الصور للمشروع" أولاً.');
        return;
      }

      const owner = GITHUB_OWNER;
      const repo = GITHUB_REPO;
      const branch = GITHUB_BRANCH;

      const gh = createGithubClient(owner, repo, branch, token);

      setStatus('بدء النشر... (قد يأخذ وقت حسب عدد الصور)', '');
      clearProgress();

      try {
        // 1) Upload new files (bound to targetPath after "إضافة الصور للمشروع")
        const uploadOps = state.uploads.filter(u => !!u && !!u.file && !!u.targetPath);
        if (uploadOps.length) {
          for (let i = 0; i < uploadOps.length; i++) {
            const u = uploadOps[i];
            const repoPath = sitePathToRepoPath(u.targetPath);
            setStatus(`رفع صورة ${i + 1}/${uploadOps.length}: ${repoPath}`, '');
            setProgress(i + 1, uploadOps.length);

            let sha = undefined;
            try {
              const meta = await gh.getFileMeta(repoPath, branch);
              if (meta && meta.sha) sha = meta.sha;
            } catch (e) { try { console.warn('getFileMeta failed', repoPath, e); } catch (_) {} }

            const b64 = await fileToBase64(u.file);
            await gh.putFile(repoPath, `Update portfolio image: ${repoPath}`, b64, sha);
          }
        }

        // 2) Rename files (copy content to new path then delete old)
        const renames = Array.from(state.renameMap.entries());
        if (renames.length) {
          for (let i = 0; i < renames.length; i++) {
            const [fromSite, toSite] = renames[i];
            const fromPath = sitePathToRepoPath(fromSite);
            const toPath = sitePathToRepoPath(toSite);
            if (fromPath === toPath) continue;
            setStatus(`إعادة تسمية ${i + 1}/${renames.length}: ${fromPath} -> ${toPath}`, '');
            setProgress(i + 1, renames.length);

            let fromMeta = null;
            try {
              fromMeta = await gh.getFileMeta(fromPath, branch);
            } catch (e) {
              continue;
            }
            if (!fromMeta || !fromMeta.sha) continue;

            let fromB64 = null;
            try {
              if (fromMeta.content && String(fromMeta.encoding || '').toLowerCase() === 'base64') {
                fromB64 = String(fromMeta.content).replace(/\n/g, '');
              } else if (fromMeta.download_url) {
                fromB64 = await ghDownloadToBase64(fromMeta.download_url, token);
              }
            } catch (e) {
              fromB64 = null;
            }
            if (!fromB64) continue;

            let toSha = undefined;
            try {
              const toMeta = await gh.getFileMeta(toPath, branch);
              if (toMeta && toMeta.sha) toSha = toMeta.sha;
            } catch (e) { try { console.warn('getFileMeta failed', toPath, e); } catch (_) {} }

            await gh.putFile(toPath, `Rename portfolio image: ${toPath}`, fromB64, toSha);
            await gh.deleteFile(fromPath, `Delete old portfolio image: ${fromPath}`, fromMeta.sha);
          }
        }

        // 3) Delete marked images
        const dels = Array.from(state.deleteSet.values()).map(sitePathToRepoPath);
        if (dels.length) {
          for (let i = 0; i < dels.length; i++) {
            const rp = dels[i];
            setStatus(`حذف صورة ${i + 1}/${dels.length}: ${rp}`, '');
            setProgress(i + 1, dels.length);
            try {
              const meta = await gh.getFileMeta(rp, branch);
              if (meta && meta.sha) {
                await gh.deleteFile(rp, `Delete portfolio image: ${rp}`, meta.sha);
              }
            } catch (e) {
              try { console.warn('delete failed', rp, e); } catch (_) {}
            }
          }
        }

        // 4) Update JSON (strong retry on SHA mismatch)
        setStatus('تحديث data/portfolio_projects.json ...', '');

        const payload = {
          source: 'portfolio_projects',
          count: (state.data.projects || []).length,
          projects: state.data.projects
        };

        await putPortfolioProjectsJsonWithRetry(gh, payload, branch);

        state.deleteSet.clear();
        state.renameMap.clear();
        state.uploads.forEach(u => URL.revokeObjectURL(u.previewUrl));
        state.uploads = [];
        clearProgress();

        setStatus('تم النشر بنجاح ✅', 'ok');
        refreshUI();
      } catch (e) {
        clearProgress();
        handleError('فشل النشر', e);
      }
    }

    // ====== LOAD DATA ======
    async function loadPortfolioJson(bustCache) {
      // on GitHub pages/static server, this will work.
      const url = bustCache ? `data/portfolio_projects.json?ts=${Date.now()}` : 'data/portfolio_projects.json';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('data/portfolio_projects.json not found');
      const j = await res.json();
      if (!j || !Array.isArray(j.projects)) throw new Error('Invalid JSON structure');
      state.data = j;
      state.data.projects = state.data.projects || [];
      state.data.count = state.data.projects.length;
    }

    async function reloadData() {
      try {
        await loadPortfolioJson(true);
        setStatus('تم تحديث البيانات من الموقع. (آخر نسخة)', 'ok');
        refreshUI();
      } catch (e) {
        handleError('تعذر تحديث البيانات', e);
      }
    }

    // ====== AUTH ======
    function isAuthed() {
      return !!state.authed;
    }

    function setAuthed(val) {
      state.authed = !!val;
    }

    function showApp() {
      $('loginPanel').classList.add('hidden');
      $('app').classList.remove('hidden');
    }

    function showLogin() {
      $('app').classList.add('hidden');
      $('loginPanel').classList.remove('hidden');
    }

    async function init() {
      $('btnLogout').addEventListener('click', () => {
        setAuthed(false);
        showLogin();
      });

      $('btnLogin').addEventListener('click', async () => {
        const pass = $('adminPass').value;
        if (pass !== ADMIN_PASSWORD) {
          alert('باسورد غير صحيح');
          return;
        }
        setAuthed(true);
        showApp();
        await boot();
      });

      showLogin();
    }

    async function boot() {
      $('fileProtoNotice').classList.toggle('hidden', !isFileProtocol());

      $('btnAddProject').addEventListener('click', addProject);
      $('btnDeleteProject').addEventListener('click', deleteProject);

      $('imagePicker').addEventListener('change', (e) => onPickFiles(e.target.files));
      $('btnAutoNames').addEventListener('click', autoNameUploads);
      $('btnApplyUploads').addEventListener('click', applyUploadsToProject);

      if ($('btnSaveProjectTitles')) $('btnSaveProjectTitles').addEventListener('click', saveProjectTitles);
      if ($('btnRememberToken')) $('btnRememberToken').addEventListener('click', rememberToken);
      if ($('btnReloadData')) $('btnReloadData').addEventListener('click', reloadData);
      tryLoadRememberedToken();

      $('btnExportJson').addEventListener('click', exportJson);
      $('btnPublish').addEventListener('click', publish);
      if ($('btnSync')) $('btnSync').addEventListener('click', syncNow);

      if ($('btnReorder')) $('btnReorder').addEventListener('click', openReorderModal);
      if ($('btnReorderClose')) $('btnReorderClose').addEventListener('click', closeReorderModal);
      if ($('btnReorderSave')) $('btnReorderSave').addEventListener('click', saveReorderDraft);
      if ($('btnReorderAuto')) $('btnReorderAuto').addEventListener('click', autoSortReorderDraft);

      try {
        await loadPortfolioJson(true);
        setStatus('تم تحميل بيانات المشاريع.', 'ok');
      } catch (e) {
        handleError('تعذر تحميل data/portfolio_projects.json', e);
      }

      refreshUI();
      updateActionsEnabled();
    }

    init();