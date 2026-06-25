/* ============================================================
   app.js — डाटा र डिजिटल साक्षरता पुस्तिका
   Features: lunr.js search · lightbox · sidebar · progress
   ============================================================ */

function initApp(basePath) {
  basePath = basePath || '';

  /* ── Sidebar toggle ─────────────────────────────────────── */
  const sidebar   = document.getElementById('sidebar');
  const hamburger = document.getElementById('hamburger');
  const overlay   = document.getElementById('overlay');
  const sideClose = document.getElementById('sidebarClose');

  function openSidebar() {
    sidebar && sidebar.classList.add('sidebar-open');
    overlay && overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar && sidebar.classList.remove('sidebar-open');
    overlay && overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
  hamburger && hamburger.addEventListener('click', openSidebar);
  sideClose && sideClose.addEventListener('click', closeSidebar);
  overlay   && overlay.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSidebar(); closeLightbox(); } });

  /* ── Reading progress bar ───────────────────────────────── */
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    function updateProgress() {
      const scrollTop  = window.scrollY;
      const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      const progress   = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressBar.style.width = Math.min(100, progress) + '%';
    }
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  /* ── Back to top ────────────────────────────────────────── */
  const btt = document.createElement('button');
  btt.className = 'back-to-top';
  btt.setAttribute('aria-label', 'Back to top');
  btt.innerHTML = '↑';
  document.body.appendChild(btt);
  btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', () => {
    btt.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  /* ── Lightbox ───────────────────────────────────────────── */
  const lightbox  = document.getElementById('lightbox');
  const lbImg     = document.getElementById('lbImg');
  const lbCaption = document.getElementById('lbCaption');
  const lbClose   = document.getElementById('lbClose');
  const lbPrev    = document.getElementById('lbPrev');
  const lbNext    = document.getElementById('lbNext');

  let lbImages = [];   // [{src, caption}]
  let lbCurrent = 0;

  function collectImages() {
    lbImages = [];
    document.querySelectorAll('.lightbox-trigger').forEach(a => {
      lbImages.push({
        src:     a.href || a.getAttribute('href'),
        caption: a.dataset.caption || (a.querySelector('img') ? a.querySelector('img').alt : '')
      });
    });
  }

  function showLightbox(idx) {
    if (!lightbox || lbImages.length === 0) return;
    lbCurrent = ((idx % lbImages.length) + lbImages.length) % lbImages.length;
    const item = lbImages[lbCurrent];
    lbImg.src = item.src;
    lbImg.alt = item.caption;
    if (lbCaption) lbCaption.textContent = item.caption;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    lbPrev.style.display = lbImages.length > 1 ? '' : 'none';
    lbNext.style.display = lbImages.length > 1 ? '' : 'none';
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    if (lbImg) { lbImg.src = ''; }
  }

  collectImages();

  document.querySelectorAll('.lightbox-trigger').forEach((a, i) => {
    a.addEventListener('click', e => {
      e.preventDefault();
      showLightbox(i);
    });
  });

  lbClose && lbClose.addEventListener('click', closeLightbox);
  lbPrev  && lbPrev.addEventListener('click', () => showLightbox(lbCurrent - 1));
  lbNext  && lbNext.addEventListener('click', () => showLightbox(lbCurrent + 1));

  // Click outside image to close
  lightbox && lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (!lightbox || !lightbox.classList.contains('active')) return;
    if (e.key === 'ArrowLeft')  showLightbox(lbCurrent - 1);
    if (e.key === 'ArrowRight') showLightbox(lbCurrent + 1);
  });

  // Touch/swipe for lightbox
  let touchStartX = 0;
  lightbox && lightbox.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  lightbox && lightbox.addEventListener('touchend', e => {
    const diff = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(diff) > 50) {
      diff < 0 ? showLightbox(lbCurrent + 1) : showLightbox(lbCurrent - 1);
    }
  }, { passive: true });

  /* ── Full-text search with lunr.js ─────────────────────── */
  const searchInput   = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchWrapper = document.getElementById('searchResultsWrapper');

  if (!searchInput || !searchResults) return;

  let lunrIndex = null;
  let docsMap   = {};
  let searchDocs = [];

  // Load search index
  fetch(basePath + 'search-index.json')
    .then(r => r.json())
    .then(docs => {
      searchDocs = docs;
      docs.forEach(d => { docsMap[d.id] = d; });

      lunrIndex = lunr(function () {
        this.use(lunr.multiLanguage ? lunr.multiLanguage('en') : function () {});
        this.ref('id');
        this.field('title', { boost: 10 });
        this.field('body');
        this.pipeline.reset(); // keeps Devanagari text intact (no stemming)
        docs.forEach(d => this.add(d));
      });
    })
    .catch(() => {
      // Fallback: simple substring search without lunr index
      lunrIndex = null;
    });

  function highlight(text, query) {
    if (!query) return text;
    const words = query.trim().split(/\s+/).filter(Boolean);
    let result = text;
    words.forEach(word => {
      const re = new RegExp('(' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      result = result.replace(re, '<mark>$1</mark>');
    });
    return result;
  }

  function fallbackSearch(query) {
    const q = query.toLowerCase();
    return searchDocs
      .filter(d => d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q))
      .slice(0, 12);
  }

  function performSearch(query) {
    query = query.trim();
    if (!query || query.length < 2) {
      searchWrapper.classList.remove('active');
      return;
    }

    let results = [];
    if (lunrIndex) {
      try {
        // Try wildcard search
        const lunrResults = lunrIndex.search(query + '*');
        results = lunrResults.map(r => docsMap[r.ref]).filter(Boolean).slice(0, 12);
      } catch (e) {
        results = fallbackSearch(query);
      }
    } else {
      results = fallbackSearch(query);
    }

    searchWrapper.classList.add('active');

    if (results.length === 0) {
      searchResults.innerHTML = `<div class="search-no-results">कुनै नतिजा फेला परेन: "${query}"</div>`;
      return;
    }

    const itemsHtml = results.map(doc => {
      const titleHL  = highlight(escapeHtml(doc.title), query);
      const excerptHL = highlight(escapeHtml(doc.body.slice(0, 180) + '…'), query);
      return `<a href="${basePath}${doc.url}" class="search-item">
        <span class="search-item-title">${titleHL}</span>
        <span class="search-item-excerpt">${excerptHL}</span>
      </a>`;
    }).join('');

    searchResults.innerHTML = itemsHtml;
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(searchInput.value), 250);
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') performSearch(searchInput.value);
    if (e.key === 'Escape') {
      searchWrapper.classList.remove('active');
      searchInput.blur();
    }
  });

  // Close search on outside click
  document.addEventListener('click', e => {
    if (!searchWrapper.contains(e.target) && !searchInput.contains(e.target)) {
      searchWrapper.classList.remove('active');
    }
  });

  /* ── Active TOC highlight on scroll ────────────────────── */
  const headings = document.querySelectorAll('.chapter-content h2, .chapter-content h3');
  const tocLinks = document.querySelectorAll('.toc-list a');

  if (headings.length > 0 && tocLinks.length > 0) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          tocLinks.forEach(link => {
            link.parentElement.classList.toggle('toc-scroll-active',
              link.getAttribute('href') && link.getAttribute('href').includes('#' + id));
          });
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    headings.forEach(h => observer.observe(h));
  }
}
