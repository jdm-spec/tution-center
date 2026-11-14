/**
 * Tuition Centre Management System - Shared UI Components & Shell
 * Plain ES2020, accessible, responsive, hand-crafted.
 */

(function () {
  'use strict';

  const { h, esc, formatCurrency, formatDate, toast, api, getSession, clearSession } = Portal;

  const Shared = {};

  /**
   * Status Badges
   */
  function badge(text, type = 'neutral') {
    const typeClass = {
      success: 'badge-success',
      warning: 'badge-warning',
      danger: 'badge-danger',
      neutral: 'badge-neutral'
    }[type] || 'badge-neutral';

    return `<span class="badge ${typeClass}">${esc(text)}</span>`;
  }

  Shared.badge = badge;

  /**
   * SVG Icon definitions (16px, 1.5px stroke, no emoji)
   */
  const ICONS = {
    overview: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>',
    students: '<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>',
    batches: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/>',
    teachers: '<path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342"/>',
    fees: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6H2.25m0 0v8.25m0-8.25c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 012.25 19.5V6zm14.25 6a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>',
    attendance: '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>',
    assignments: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>',
    warnings: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>',
    review: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    home: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/>',
    profile: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>',
    more: '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>',
    signout: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/>'
  };

  Shared.icon = function (name, extraClass = 'w-4 h-4') {
    const path = ICONS[name] || '';
    return `<svg class="${extraClass} flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">${path}</svg>`;
  };

  /**
   * Navigation links specification per role
   */
  const NAV_ITEMS = {
    principal: [
      { id: 'overview', label: 'Overview', hash: '#/overview', icon: 'overview' },
      { id: 'students', label: 'Students', hash: '#/students', icon: 'students' },
      { id: 'batches', label: 'Batches', hash: '#/batches', icon: 'batches' },
      { id: 'teachers', label: 'Teachers', hash: '#/teachers', icon: 'teachers' },
      { id: 'fees', label: 'Fees', hash: '#/fees', icon: 'fees' },
      { id: 'attendance', label: 'Attendance', hash: '#/attendance', icon: 'attendance' },
      { id: 'assignments', label: 'Assignments', hash: '#/assignments', icon: 'assignments' },
      { id: 'warnings', label: 'Warnings', hash: '#/warnings', icon: 'warnings' }
    ],
    teacher: [
      { id: 'overview', label: 'Overview', hash: '#/overview', icon: 'overview' },
      { id: 'attendance', label: 'Attendance', hash: '#/attendance', icon: 'attendance' },
      { id: 'assignments', label: 'Assignments', hash: '#/assignments', icon: 'assignments' },
      { id: 'review', label: 'Review queue', hash: '#/review', icon: 'review' },
      { id: 'fees', label: 'Fees', hash: '#/fees', icon: 'fees' },
      { id: 'students', label: 'Students', hash: '#/students', icon: 'students' }
    ],
    student: [
      { id: 'home', label: 'Home', hash: '#/home', icon: 'home' },
      { id: 'assignments', label: 'Assignments', hash: '#/assignments', icon: 'assignments' },
      { id: 'attendance', label: 'Attendance', hash: '#/attendance', icon: 'attendance' },
      { id: 'fees', label: 'Fees', hash: '#/fees', icon: 'fees' },
      { id: 'profile', label: 'Profile', hash: '#/profile', icon: 'profile' }
    ]
  };

  /**
   * Render Shell Layout
   */
  Shared.renderShell = function ({ title, activeNav, actions = '', content }) {
    const session = getSession() || {};
    const role = session.role || 'student';
    const centerName = (Portal.env && Portal.env.CENTER_NAME) || 'Tuition Centre';
    const items = NAV_ITEMS[role] || [];
    const appEl = document.getElementById('app');
    if (!appEl) return;

    let bottomItems = items;
    let hasMore = false;
    let moreItems = [];
    if (items.length >= 4) {
      bottomItems = items.slice(0, 4);
      moreItems = items.slice(4);
      hasMore = true;
    }

    const currentHash = window.location.hash || '';

    const sidebarLinksHtml = items.map(item => {
      const isActive = item.id === activeNav || currentHash.startsWith(item.hash);
      const activeClass = isActive
        ? 'bg-brand text-white font-medium'
        : 'text-stone-600 hover:text-ink hover:bg-brand-soft';
      return `
        <a href="${item.hash}" class="flex items-center gap-2.5 px-3 py-2 rounded text-xs transition-colors duration-150 ${activeClass}">
          ${Shared.icon(item.icon, isActive ? 'w-4 h-4 text-white' : 'w-4 h-4 text-stone-500')}
          <span>${esc(item.label)}</span>
        </a>
      `;
    }).join('');

    const bottomLinksHtml = bottomItems.map(item => {
      const isActive = item.id === activeNav || currentHash.startsWith(item.hash);
      const colorClass = isActive ? 'text-brand font-semibold' : 'text-stone-500 hover:text-ink';
      return `
        <a href="${item.hash}" class="flex flex-col items-center justify-center flex-1 py-1.5 text-[10px] ${colorClass}">
          ${Shared.icon(item.icon, 'w-5 h-5 mb-0.5')}
          <span>${esc(item.label)}</span>
        </a>
      `;
    }).join('');

    const moreButtonHtml = hasMore ? `
      <button type="button" id="mobile-more-btn" class="flex flex-col items-center justify-center flex-1 py-1.5 text-[10px] text-stone-500 hover:text-ink">
        ${Shared.icon('more', 'w-5 h-5 mb-0.5')}
        <span>More</span>
      </button>
    ` : `
      <button type="button" id="mobile-direct-signout-btn" class="flex flex-col items-center justify-center flex-1 py-1.5 text-[10px] text-red-600 hover:text-red-800">
        ${Shared.icon('signout', 'w-5 h-5 mb-0.5 text-red-600')}
        <span>Sign out</span>
      </button>
    `;

    appEl.innerHTML = `
      <div class="flex-1 flex flex-col md:flex-row min-h-screen bg-paper pb-16 md:pb-0">
        <!-- Desktop Sidebar -->
        <aside class="hidden md:flex flex-col w-56 bg-[#fbfaf8] border-r border-line p-4 flex-shrink-0">
          <div class="mb-6 px-2">
            <h1 class="font-display text-lg font-semibold tracking-tight text-ink leading-snug">${esc(centerName)}</h1>
            <p class="text-[11px] text-stone-500 capitalize tracking-wide mt-0.5">${esc(role)} portal</p>
          </div>

          <nav class="flex-1 flex flex-col gap-1">
            ${sidebarLinksHtml}
          </nav>

          <div class="pt-4 border-t border-line mt-4">
            <div class="px-2 mb-2">
              <div class="text-xs font-medium text-ink truncate">${esc(session.name || session.uid || 'User')}</div>
              <div class="text-[10px] text-stone-500 truncate">${esc(session.email || session.studentId || '')}</div>
            </div>
            <button type="button" id="desktop-signout-btn" class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors">
              ${Shared.icon('signout', 'w-4 h-4')}
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        <!-- Main Content Area -->
        <div class="flex-1 flex flex-col min-w-0">
          <header class="border-b border-line bg-white px-4 md:px-8 py-3.5 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <div class="md:hidden font-display text-base font-semibold text-ink truncate mb-0.5">${esc(centerName)}</div>
              <h2 class="font-display text-xl md:text-2xl font-medium text-ink tracking-tight truncate">${esc(title)}</h2>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              ${Portal.isDemoMode && Portal.isDemoMode() ? `
                <div class="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded text-[11px] text-amber-900">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>Test Mode (Local Data)</span>
                  <button type="button" id="btn-exit-demo" class="text-amber-800 hover:text-black font-semibold ml-1 underline">Exit</button>
                </div>
              ` : ''}
              ${actions}
            </div>
          </header>

          <main id="portal-content" class="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto"></main>
        </div>

        <!-- Mobile Bottom Nav Bar -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-line flex items-center px-1 shadow-sm">
          ${bottomLinksHtml}
          ${moreButtonHtml}
        </nav>
      </div>

      <!-- Mobile More Sheet Modal Container -->
      <div id="mobile-more-sheet" class="hidden fixed inset-0 z-40 bg-black/40 flex flex-col justify-end">
        <div class="bg-white rounded-t-xl border-t border-line p-5 max-h-[80vh] overflow-y-auto shadow-2xl">
          <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
            <div>
              <div class="text-xs font-semibold text-ink">${esc(session.name || 'User')}</div>
              <div class="text-[10px] text-stone-500 capitalize tracking-wide mt-0.5">${esc(role)} portal &bull; ${esc(session.email || session.studentId || '')}</div>
            </div>
            <button type="button" id="close-more-sheet" class="p-1 text-stone-400 hover:text-ink text-xl leading-none">&times;</button>
          </div>
          <div class="flex flex-col gap-1.5">
            ${moreItems.map(item => `
              <a href="${item.hash}" class="more-nav-link flex items-center gap-2.5 px-3 py-2.5 rounded text-xs text-stone-700 hover:bg-brand-soft">
                ${Shared.icon(item.icon, 'w-4 h-4 text-stone-500')}
                <span>${esc(item.label)}</span>
              </a>
            `).join('')}
            <button type="button" id="mobile-signout-btn" class="flex items-center gap-2.5 px-3 py-2.5 rounded text-xs font-semibold text-red-600 hover:bg-red-50 mt-2 border-t border-line pt-3 w-full transition-colors">
              ${Shared.icon('signout', 'w-4 h-4 text-red-600')}
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const contentContainer = document.getElementById('portal-content');
    if (contentContainer) {
      if (typeof content === 'string') {
        contentContainer.innerHTML = content;
      } else if ((typeof Node !== 'undefined' && content instanceof Node) || (content && content.nodeType)) {
        contentContainer.appendChild(content);
      }
    }

    const handleSignout = () => {
      clearSession();
      window.location.hash = '#/login';
      toast('You have signed out.', 'info');
    };

    const dSignout = document.getElementById('desktop-signout-btn');
    if (dSignout) dSignout.addEventListener('click', handleSignout);

    const mSignout = document.getElementById('mobile-signout-btn');
    if (mSignout) mSignout.addEventListener('click', handleSignout);

    const mdSignout = document.getElementById('mobile-direct-signout-btn');
    if (mdSignout) mdSignout.addEventListener('click', handleSignout);

    const exitDemoBtn = document.getElementById('btn-exit-demo');
    if (exitDemoBtn) {
      exitDemoBtn.addEventListener('click', () => {
        Portal.setDemoMode(false);
        clearSession();
        window.location.hash = '#/login';
        window.location.reload();
      });
    }

    const moreBtn = document.getElementById('mobile-more-btn');
    const moreSheet = document.getElementById('mobile-more-sheet');
    const closeMore = document.getElementById('close-more-sheet');

    if (moreBtn && moreSheet) {
      moreBtn.addEventListener('click', () => {
        moreSheet.classList.remove('hidden');
      });
      if (closeMore) {
        closeMore.addEventListener('click', () => {
          moreSheet.classList.add('hidden');
        });
      }
      moreSheet.addEventListener('click', (e) => {
        if (e.target === moreSheet) moreSheet.classList.add('hidden');
      });
      moreSheet.querySelectorAll('.more-nav-link').forEach(link => {
        link.addEventListener('click', () => moreSheet.classList.add('hidden'));
      });
    }
  };

  /**
   * Stat Summary Strip Component
   */
  Shared.statStrip = function (stats = []) {
    const itemsHtml = stats.map((stat, i) => `
      <div class="flex-1 min-w-[120px] p-3 md:p-4 ${i !== 0 ? 'border-t md:border-t-0 md:border-l border-line' : ''}">
        <div class="text-[11px] font-medium text-stone-500 uppercase tracking-wider mb-1">${esc(stat.label)}</div>
        <div class="text-xl md:text-2xl font-semibold tabular-nums text-ink tracking-tight">${esc(stat.value)}</div>
        ${stat.note ? `<div class="text-[10px] text-stone-400 mt-0.5">${esc(stat.note)}</div>` : ''}
      </div>
    `).join('');

    return `
      <div class="card p-0 flex flex-col md:flex-row divide-y md:divide-y-0 divide-line overflow-hidden mb-6">
        ${itemsHtml}
      </div>
    `;
  };

  /**
   * Filter Bar Component
   */
  Shared.filterBar = function ({ searchPlaceholder = 'Search...', searchId = 'filter-search', filters = [], onSearch, onFilterChange }) {
    const container = h('div', { className: 'flex flex-wrap items-center gap-2 mb-4 text-xs' });

    const searchWrapper = h('div', { className: 'relative flex-1 min-w-[180px] max-w-sm' });
    const searchInput = h('input', {
      type: 'text',
      id: searchId,
      placeholder: searchPlaceholder,
      className: 'input text-xs py-1.5 px-2.5'
    });
    searchWrapper.appendChild(searchInput);
    container.appendChild(searchWrapper);

    let searchTimer = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        onSearch && onSearch(e.target.value.trim().toLowerCase());
      }, 150);
    });

    filters.forEach(f => {
      const select = h('select', {
        id: f.id,
        className: 'input text-xs py-1.5 px-2 max-w-[160px] bg-white'
      });
      f.options.forEach(opt => {
        const optionEl = h('option', { value: opt.value }, opt.label);
        if (opt.selected) optionEl.selected = true;
        select.appendChild(optionEl);
      });
      select.addEventListener('change', (e) => {
        onFilterChange && onFilterChange(f.id, e.target.value);
      });
      container.appendChild(select);
    });

    return container;
  };
  Shared.renderFilterBar = Shared.filterBar;

  /**
   * Responsive Table / Stacked Card Component
   */
  Shared.renderTable = function ({ columns, data = [], emptyMessage = 'No records found.', onRowClick }) {
    if (!data || data.length === 0) {
      return h('div', { className: 'card p-6 text-center text-xs text-stone-500' }, emptyMessage);
    }

    const wrapper = h('div', { className: 'w-full' });

    const desktopCard = h('div', { className: 'hidden md:block card overflow-x-auto p-0' });
    const table = h('table', { className: 'tbl' });
    const thead = h('thead', null);
    const headerRow = h('tr', null);

    columns.forEach(col => {
      const th = h('th', { className: col.className || '' }, col.header);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = h('tbody', null);
    data.forEach((row, rowIndex) => {
      const tr = h('tr', {
        className: onRowClick ? 'cursor-pointer hover:bg-brand-soft/30 transition-colors' : '',
        onClick: onRowClick ? () => onRowClick(row, rowIndex) : null
      });

      columns.forEach(col => {
        const td = h('td', { className: col.cellClass || '' });
        const val = col.render ? col.render(row, rowIndex) : row[col.key];
        if ((typeof Node !== 'undefined' && val instanceof Node) || (val && val.nodeType)) {
          td.appendChild(val);
        } else {
          td.innerHTML = val !== undefined && val !== null ? String(val) : '\u2014';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    desktopCard.appendChild(table);
    wrapper.appendChild(desktopCard);

    const mobileList = h('div', { className: 'md:hidden flex flex-col gap-2.5' });
    data.forEach((row, rowIndex) => {
      const card = h('div', {
        className: `card p-3 flex flex-col gap-1.5 text-xs ${onRowClick ? 'cursor-pointer active:bg-brand-soft/40' : ''}`,
        onClick: onRowClick ? () => onRowClick(row, rowIndex) : null
      });

      columns.forEach(col => {
        if (col.mobileHidden) return;
        const rowEl = h('div', { className: 'flex items-baseline justify-between gap-2 border-b border-line/50 pb-1 last:border-0 last:pb-0' });
        const labelEl = h('span', { className: 'text-[11px] font-medium text-stone-500' }, col.header);
        const valueEl = h('div', { className: 'text-right' });
        const val = col.render ? col.render(row, rowIndex) : row[col.key];
        if ((typeof Node !== 'undefined' && val instanceof Node) || (val && val.nodeType)) {
          valueEl.appendChild(val);
        } else {
          valueEl.innerHTML = val !== undefined && val !== null ? String(val) : '\u2014';
        }
        rowEl.appendChild(labelEl);
        rowEl.appendChild(valueEl);
        card.appendChild(rowEl);
      });
      mobileList.appendChild(card);
    });
    wrapper.appendChild(mobileList);

    return wrapper;
  };

  /**
   * Modal Dialog
   */
  let currentModalEl = null;

  Shared.openModal = function ({ title, content, onConfirm, confirmText = 'Save', isDanger = false, onCancel }) {
    Shared.closeModal();

    const overlay = h('div', {
      className: 'fixed inset-0 z-50 bg-black/40 backdrop-blur-none flex items-center justify-center p-4 overflow-y-auto animate-fade-in',
      role: 'dialog',
      'aria-modal': 'true'
    });

    const modalBox = h('div', {
      className: 'bg-white border border-line rounded-md max-w-lg w-full max-h-[90vh] flex flex-col shadow-sm text-ink'
    });

    const header = h('div', { className: 'px-5 py-3.5 border-b border-line flex items-center justify-between' });
    header.appendChild(h('h3', { className: 'font-display text-lg font-medium text-ink' }, title));
    const closeBtn = h('button', {
      type: 'button',
      className: 'text-stone-400 hover:text-ink text-lg leading-none p-1',
      onClick: () => {
        Shared.closeModal();
        onCancel && onCancel();
      }
    }, '\u00D7');
    header.appendChild(closeBtn);
    modalBox.appendChild(header);

    const body = h('div', { className: 'p-5 overflow-y-auto flex-1 text-xs' });
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else if (content instanceof Node) {
      body.appendChild(content);
    }
    modalBox.appendChild(body);

    if (onConfirm || onCancel) {
      const footer = h('div', { className: 'px-5 py-3 border-t border-line bg-paper/50 flex items-center justify-end gap-2' });
      const cancelBtn = h('button', {
        type: 'button',
        className: 'btn btn-ghost text-xs py-1.5 px-3',
        onClick: () => {
          Shared.closeModal();
          onCancel && onCancel();
        }
      }, 'Cancel');
      footer.appendChild(cancelBtn);

      if (onConfirm) {
        const confirmBtn = h('button', {
          type: 'button',
          className: `btn ${isDanger ? 'btn-danger' : 'btn-primary'} text-xs py-1.5 px-3`,
          onClick: async () => {
            confirmBtn.disabled = true;
            try {
              await onConfirm();
              Shared.closeModal();
            } catch (err) {
              confirmBtn.disabled = false;
            }
          }
        }, confirmText);
        footer.appendChild(confirmBtn);
      }
      modalBox.appendChild(footer);
    }

    overlay.appendChild(modalBox);
    document.body.appendChild(overlay);
    currentModalEl = overlay;

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        Shared.closeModal();
        onCancel && onCancel();
      }
    };
    window.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        Shared.closeModal();
        onCancel && onCancel();
      }
    });

    const firstInput = modalBox.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
  };

  Shared.closeModal = function () {
    if (currentModalEl) {
      if (currentModalEl._escHandler) {
        window.removeEventListener('keydown', currentModalEl._escHandler);
      }
      if (currentModalEl.parentNode) {
        currentModalEl.parentNode.removeChild(currentModalEl);
      }
      currentModalEl = null;
    }
  };

  /**
   * File Upload Helper
   */
  Shared.uploadFile = async function (fileInput) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      return null;
    }

    const file = fileInput.files[0];
    const maxKb = (Portal.env && Portal.env.MAX_UPLOAD_KB) || 1500;
    const fileKb = Math.round(file.size / 1024);

    if (fileKb > maxKb) {
      toast(`File too large (${fileKb} KB). Maximum allowed size is ${maxKb} KB.`, 'error');
      throw new Error('File exceeds maximum upload size');
    }

    const session = getSession();
    const fid = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });

    const fileRecord = {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      data: base64Data,
      owner: session ? session.uid : 'anon',
      createdAt: new Date().toISOString()
    };

    await api(`files/${fid}`, {
      method: 'PUT',
      body: fileRecord
    });

    return {
      fileId: fid,
      name: file.name,
      size: file.size
    };
  };

  /**
   * Download / Preview File by File ID
   */
  Shared.downloadOrPreviewFile = async function (fileId) {
    if (!fileId) return;

    try {
      toast('Fetching file...', 'info', 2000);
      const fileData = await api(`files/${fileId}`);
      if (!fileData || !fileData.data) {
        toast('File content not found.', 'error');
        return;
      }

      if (fileData.type && (fileData.type.startsWith('image/') || fileData.type === 'application/pdf')) {
        let previewHtml = '';
        if (fileData.type.startsWith('image/')) {
          previewHtml = `
            <div class="flex flex-col items-center">
              <img src="${esc(fileData.data)}" alt="${esc(fileData.name)}" class="max-h-[60vh] max-w-full rounded border border-line mb-3 object-contain" />
              <a href="${esc(fileData.data)}" download="${esc(fileData.name)}" class="btn btn-primary btn-sm">Download image</a>
            </div>
          `;
        } else {
          previewHtml = `
            <div class="flex flex-col items-center gap-3">
              <iframe src="${esc(fileData.data)}" class="w-full h-[60vh] rounded border border-line"></iframe>
              <a href="${esc(fileData.data)}" download="${esc(fileData.name)}" class="btn btn-primary btn-sm">Download PDF</a>
            </div>
          `;
        }

        Shared.openModal({
          title: fileData.name,
          content: previewHtml,
          onCancel: () => {}
        });
      } else {
        const a = document.createElement('a');
        a.href = fileData.data;
        a.download = fileData.name || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error(err);
      toast('Failed to load file.', 'error');
    }
  };

  /**
   * Warning Banner Component (for unread warnings in Student Portal)
   */
  Shared.warningBanner = function (warning, onAcknowledge) {
    const banner = h('div', {
      className: 'bg-white border-l-4 border-amber-500 border border-line p-3 md:p-4 rounded-r-md mb-4 flex items-start justify-between gap-3 text-xs shadow-sm'
    });

    const left = h('div', { className: 'flex-1 leading-relaxed' });
    const title = h('div', { className: 'font-semibold text-ink mb-0.5 capitalize' }, `${warning.type || 'Notice'} Warning`);
    const msg = h('div', { className: 'text-stone-700' }, warning.message);
    const meta = h('div', { className: 'text-[10px] text-stone-400 mt-1' }, `Issued on ${formatDate(warning.createdAt)}`);
    left.appendChild(title);
    left.appendChild(msg);
    left.appendChild(meta);
    banner.appendChild(left);

    if (onAcknowledge && !warning.acknowledged) {
      const ackBtn = h('button', {
        type: 'button',
        className: 'btn btn-primary btn-sm text-xs px-3 flex-shrink-0 self-center',
        onClick: onAcknowledge
      }, 'Got it');
      banner.appendChild(ackBtn);
    }

    return banner;
  };

  /**
   * Export Day-by-Day Attendance to Excel (Single Batch)
   */
  Shared.downloadAttendanceExcel = function ({ title = 'Attendance Report', batchName = 'Batch', students = [], attendance = {}, dates = [] }) {
    if (typeof XLSX === 'undefined') {
      toast('Excel library loading, please wait...', 'warning');
      return;
    }

    const sortedDates = dates.length ? dates.slice().sort() : [];
    const headers = ['Roll No / Adm No', 'Student Name', 'Grade', 'Guardian Phone'];
    sortedDates.forEach(d => {
      headers.push(d.slice(5)); // e.g. 10-25
    });
    headers.push('Total Classes', 'Present', 'Absent', 'Late', 'Attendance %');

    const dataRows = [headers];

    students.forEach(s => {
      const sid = s.admissionNo || s.sid;
      const att = (attendance && (attendance[sid] || attendance[s.sid])) || {};
      let pCount = 0;
      let aCount = 0;
      let lCount = 0;
      let totalCount = 0;

      const row = [
        s.admissionNo || s.sid,
        s.name,
        s.grade || '',
        s.guardianPhone || ''
      ];

      sortedDates.forEach(d => {
        const val = att[d] || '-';
        row.push(val);
        if (val === 'P') { pCount++; totalCount++; }
        else if (val === 'A') { aCount++; totalCount++; }
        else if (val === 'L') { lCount++; totalCount++; }
      });

      const pct = totalCount > 0 ? Math.round(((pCount + (lCount * 0.5)) / totalCount) * 100) : 0;
      row.push(totalCount, pCount, aCount, lCount, `${pct}%`);
      dataRows.push(row);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dataRows);

    const colWidths = [{ wch: 16 }, { wch: 22 }, { wch: 8 }, { wch: 15 }];
    sortedDates.forEach(() => colWidths.push({ wch: 7 }));
    colWidths.push({ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 });
    ws['!cols'] = colWidths;

    const sheetName = batchName.slice(0, 31).replace(/[\\/?*[\]]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${batchName.replace(/\s+/g, '_')}_Attendance_Report.xlsx`);
    toast('Attendance Excel report downloaded.', 'success');
  };

  /**
   * Export Day-by-Day Attendance to Excel (All Batches with multiple sheets)
   */
  Shared.downloadMultiBatchAttendanceExcel = function ({ batches = {}, students = {}, attendance = {}, dates = [] }) {
    if (typeof XLSX === 'undefined') {
      toast('Excel library loading, please wait...', 'warning');
      return;
    }

    const wb = XLSX.utils.book_new();
    const studentList = Object.entries(students || {}).map(([sid, s]) => ({ sid, ...s }));

    Object.entries(batches || {}).forEach(([bid, b]) => {
      const batchStudents = studentList.filter(s => s.status === 'active' && s.batchIds && s.batchIds[bid]);
      if (batchStudents.length === 0) return;

      let batchDates = dates && dates.length ? dates.slice().sort() : [];
      if (!batchDates.length) {
        const dateSet = new Set();
        batchStudents.forEach(s => {
          const att = attendance && attendance[s.sid];
          if (att) Object.keys(att).forEach(d => dateSet.add(d));
        });
        batchDates = Array.from(dateSet).sort();
      }

      const headers = ['Roll No', 'Student Name', 'Grade', 'Guardian Phone'];
      batchDates.forEach(d => headers.push(d.slice(5)));
      headers.push('Total Classes', 'Present', 'Absent', 'Late', 'Attendance %');

      const dataRows = [headers];

      batchStudents.forEach(s => {
        const att = (attendance && (attendance[s.sid] || attendance[s.admissionNo])) || {};
        let pCount = 0, aCount = 0, lCount = 0, totalCount = 0;
        const row = [s.admissionNo || s.sid, s.name, s.grade || '', s.guardianPhone || ''];

        batchDates.forEach(d => {
          const val = att[d] || '-';
          row.push(val);
          if (val === 'P') { pCount++; totalCount++; }
          else if (val === 'A') { aCount++; totalCount++; }
          else if (val === 'L') { lCount++; totalCount++; }
        });

        const pct = totalCount > 0 ? Math.round(((pCount + (lCount * 0.5)) / totalCount) * 100) : 0;
        row.push(totalCount, pCount, aCount, lCount, `${pct}%`);
        dataRows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(dataRows);
      const colWidths = [{ wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 15 }];
      batchDates.forEach(() => colWidths.push({ wch: 7 }));
      colWidths.push({ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 });
      ws['!cols'] = colWidths;

      const sheetName = (b.name || bid).slice(0, 31).replace(/[\\/?*[\]]/g, '_');
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    if (wb.SheetNames.length === 0) {
      toast('No batch attendance data to export.', 'info');
      return;
    }

    XLSX.writeFile(wb, `All_Batches_Attendance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Comprehensive attendance report downloaded.', 'success');
  };

  /**
   * Generate Downloadable Excel Template with Dropdown Validation
   */
  Shared.downloadStudentBulkTemplate = async function (batches = {}) {
    if (typeof XLSX === 'undefined') {
      toast('Excel library loading, please wait...', 'warning');
      return;
    }

    const batchNames = Object.values(batches || {}).map(b => b.name).filter(Boolean);
    const demoBatch = batchNames[0] || 'Class 10 Science A';

    const headers = [
      'Admission_No',
      'Full_Name',
      'Grade',
      'Gender',
      'Batch',
      'Guardian_Name',
      'Guardian_Phone',
      'DOB',
      'School',
      'Address'
    ];

    const sampleRow1 = [
      'S101',
      'Rahul Sharma',
      '10',
      'Male',
      demoBatch,
      'Anil Sharma',
      '9876543210',
      '2008-05-15',
      'Central High School',
      '12 MG Road, Bangalore'
    ];

    const sampleRow2 = [
      'S102',
      'Priya Patel',
      '10',
      'Female',
      batchNames[1] || demoBatch,
      'Suresh Patel',
      '9812345678',
      '2008-08-20',
      'St. Xavier School',
      '45 Park Avenue, Bangalore'
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow1, sampleRow2]);

    ws['!cols'] = [
      { wch: 15 },
      { wch: 22 },
      { wch: 10 },
      { wch: 12 },
      { wch: 25 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 22 },
      { wch: 28 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Student Template');

    if (typeof JSZip !== 'undefined') {
      try {
        const rawBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const zip = await JSZip.loadAsync(rawBuf);
        let sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('text');

        const escapedBatches = batchNames.map(b => b.replace(/["&]/g, '')).join(',');
        const batchListFormula = `&quot;${escapedBatches || 'General Batch'}&quot;`;
        const genderFormula = `&quot;Male,Female,Other&quot;`;

        const validationsXml = `<dataValidations count="2">` +
          `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="D2:D500"><formula1>${genderFormula}</formula1></dataValidation>` +
          `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="E2:E500"><formula1>${batchListFormula}</formula1></dataValidation>` +
          `</dataValidations>`;

        sheetXml = sheetXml.replace('</worksheet>', validationsXml + '</worksheet>');
        zip.file('xl/worksheets/sheet1.xml', sheetXml);

        const finalBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Student_Bulk_Registration_Template.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Template downloaded with interactive Batch and Gender dropdowns.', 'success');
        return;
      } catch (zipErr) {
        console.warn('JSZip dropdown injection fallback:', zipErr);
      }
    }

    XLSX.writeFile(wb, 'Student_Bulk_Registration_Template.xlsx');
    toast('Student registration template downloaded.', 'success');
  };

  /**
   * Parse Uploaded Student Excel/CSV File
   */
  Shared.parseStudentBulkExcel = function (fileBuffer, existingStudents = [], batches = {}) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel library not loaded.');
    }

    const wb = XLSX.read(fileBuffer, { type: 'array' });
    const firstSheetName = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const batchNameToId = {};
    Object.entries(batches || {}).forEach(([bid, b]) => {
      if (b.name) batchNameToId[b.name.trim().toLowerCase()] = bid;
    });

    const existingAdmMap = new Set(existingStudents.map(s => (s.admissionNo || s.sid || '').toUpperCase()));
    const valid = [];
    const invalid = [];

    rawRows.forEach((row, index) => {
      const rowNum = index + 2; // account for header line in Excel
      const admNo = String(row['Admission_No'] || row['AdmissionNo'] || row['Admission No'] || row['Adm_No'] || '').trim().toUpperCase();
      const name = String(row['Full_Name'] || row['FullName'] || row['Full Name'] || row['Name'] || '').trim();
      const grade = String(row['Grade'] || row['Class'] || '').trim();
      const gender = String(row['Gender'] || 'Male').trim();
      const batchNameRaw = String(row['Batch'] || row['Batch_Name'] || row['Batch Name'] || '').trim();
      const guardianName = String(row['Guardian_Name'] || row['GuardianName'] || row['Guardian Name'] || '').trim();
      const guardianPhone = String(row['Guardian_Phone'] || row['GuardianPhone'] || row['Guardian Phone'] || '').trim();
      const dob = String(row['DOB'] || row['Date of Birth'] || '').trim();
      const school = String(row['School'] || '').trim();
      const address = String(row['Address'] || '').trim();

      const errors = [];
      if (!admNo) errors.push('Missing Admission No');
      else if (existingAdmMap.has(admNo)) errors.push(`Duplicate Admission No (${admNo})`);

      if (!name) errors.push('Missing Student Name');
      if (!grade) errors.push('Missing Grade');
      if (!guardianName) errors.push('Missing Guardian Name');
      if (!guardianPhone) errors.push('Missing Guardian Phone');

      // Resolve batch
      let matchedBatchId = null;
      if (batchNameRaw) {
        matchedBatchId = batchNameToId[batchNameRaw.toLowerCase()] || null;
        if (!matchedBatchId) {
          // Fuzzy match or default to first if only one
          const match = Object.keys(batchNameToId).find(k => k.includes(batchNameRaw.toLowerCase()) || batchNameRaw.toLowerCase().includes(k));
          if (match) matchedBatchId = batchNameToId[match];
        }
      }

      if (errors.length) {
        invalid.push({ rowNum, admNo: admNo || `Row ${rowNum}`, name: name || 'Unknown', errors });
      } else {
        existingAdmMap.add(admNo); // prevent duplicates within same sheet
        valid.push({
          admNo,
          name,
          grade,
          gender,
          batchId: matchedBatchId,
          batchName: batchNameRaw,
          guardianName,
          guardianPhone,
          dob,
          school,
          address
        });
      }
    });

    return { valid, invalid };
  };

  Portal.Shared = Shared;
})();
