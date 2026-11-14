/**
 * Tuition Centre Management System - Core Library
 * Plain ES2020, zero external dependencies, robust and safe.
 */

(function () {
  'use strict';

  // Global Portal namespace
  window.Portal = window.Portal || {};
  window.Portal.env = window.Portal.env || window.__ENV__ || {};
  window.Portal.principal = window.Portal.principal || null;
  window.Portal.teacher = window.Portal.teacher || null;
  window.Portal.student = window.Portal.student || null;
  window.Portal.session = window.Portal.session || null;
  window.Portal.app = window.Portal.app || null;
  window.Portal.Shared = window.Portal.Shared || null;

  /**
   * Escape HTML to prevent XSS in template literals
   */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Safe DOM node factory helper
   * @param {string} tag
   * @param {Object} attrs
   * @param {...(Node|string|Array)} children
   */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        if (val === null || val === undefined || val === false) continue;
        if (key === 'className' || key === 'class') {
          el.className = val;
        } else if (key === 'style' && typeof val === 'object') {
          Object.assign(el.style, val);
        } else if (key.startsWith('on') && typeof val === 'function') {
          const eventName = key.slice(2).toLowerCase();
          el.addEventListener(eventName, val);
        } else if (key === 'dataset' && typeof val === 'object') {
          for (const [dKey, dVal] of Object.entries(val)) {
            el.dataset[dKey] = dVal;
          }
        } else if (typeof val === 'boolean') {
          if (val) el.setAttribute(key, '');
        } else {
          el.setAttribute(key, val);
        }
      }
    }

    function append(child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) {
        child.forEach(append);
      } else if ((typeof Node !== 'undefined' && child instanceof Node) || (child && child.nodeType)) {
        el.appendChild(child);
      } else {
        el.appendChild(document.createTextNode(String(child)));
      }
    }

    children.forEach(append);
    return el;
  }

  /**
   * Formatters
   */
  const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  });

  function formatCurrency(amount) {
    const num = Number(amount);
    return currencyFormatter.format(isNaN(num) ? 0 : num);
  }

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDate(dateInput) {
    if (!dateInput) return '\u2014';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const day = d.getDate();
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }

  function formatDateTime(dateInput) {
    if (!dateInput) return '\u2014';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const day = d.getDate();
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
  }

  function formatRelativeDue(dueDateStr) {
    if (!dueDateStr) return 'No due date';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueParts = dueDateStr.split('-');
    if (dueParts.length !== 3) return `Due ${formatDate(dueDateStr)}`;
    const due = new Date(parseInt(dueParts[0], 10), parseInt(dueParts[1], 10) - 1, parseInt(dueParts[2], 10));
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays > 1 && diffDays <= 7) return `Due in ${diffDays} days`;
    if (diffDays === -1) return '1 day late';
    if (diffDays < -1) return `${Math.abs(diffDays)} days late`;
    return `Due ${formatDate(dueDateStr)}`;
  }

  /**
   * Calculations
   */

  /**
   * Attendance % = (P + L) / marked days x 100, rounded to 1 decimal.
   * Treat L as present.
   */
  function calcAttendance(attendanceMap) {
    if (!attendanceMap || typeof attendanceMap !== 'object') {
      return { percent: 100, present: 0, late: 0, absent: 0, total: 0 };
    }
    let p = 0, l = 0, a = 0;
    for (const val of Object.values(attendanceMap)) {
      if (val === 'P') p++;
      else if (val === 'L') l++;
      else if (val === 'A') a++;
    }
    const total = p + l + a;
    if (total === 0) {
      return { percent: 100, present: 0, late: 0, absent: 0, total: 0 };
    }
    const percent = Math.round(((p + l) / total) * 1000) / 10;
    return { percent, present: p, late: l, absent: a, total };
  }

  /**
   * Fee status:
   * paid if balance is 0 or less
   * overdue if balance > 0 and today > dueDate
   * partial if paid > 0
   * else due
   */
  function calcFeeStatus(totalOrFee, paid, dueDate) {
    const isSingleArg = arguments.length <= 1;
    let tot = 0;
    let pd = 0;
    let due = null;

    if (totalOrFee && typeof totalOrFee === 'object') {
      tot = Number(totalOrFee.total) || 0;
      due = totalOrFee.dueDate || null;
      if (totalOrFee.payments) {
        Object.values(totalOrFee.payments).forEach(p => {
          pd += Number(p.amount) || 0;
        });
      }
    } else {
      tot = Number(totalOrFee) || 0;
      pd = Number(paid) || 0;
      due = dueDate || null;
    }

    const balance = Math.max(0, tot - pd);
    let status = 'due';
    if (tot === 0 && pd === 0 && !due) {
      status = 'paid';
    } else if (balance <= 0) {
      status = 'paid';
    } else {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (due && todayStr > due) {
        status = 'overdue';
      } else if (pd > 0) {
        status = 'partial';
      } else {
        status = 'due';
      }
    }

    if (isSingleArg) {
      return {
        status,
        total: tot,
        paid: pd,
        balance,
        dueDate: due,
        toString() { return status; },
        valueOf() { return status; }
      };
    }

    return status;
  }

  /**
   * Assignment state for student:
   * no submission = pending (or overdue if past due)
   * otherwise submission status ('submitted'|'approved'|'rejected')
   */
  function calcAssignmentState(assignment, submission) {
    if (!submission || !submission.status) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (assignment && assignment.dueDate && todayStr > assignment.dueDate) {
        return 'overdue';
      }
      return 'pending';
    }
    return submission.status;
  }

  /**
   * Cryptographic helper: SHA-256 in hex
   */
  async function sha256Hex(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    if (typeof require === 'function') {
      try {
        const nodeCrypto = require('crypto');
        return nodeCrypto.createHash('sha256').update(str).digest('hex');
      } catch (e) {}
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(32, '0');
  }

  /**
   * Compute student synthetic auth credentials
   */
  async function studentSyntheticAuth(admissionNo, explicitPasswordOrSalt) {
    const cleanNo = (admissionNo || '').trim();
    const email = `${cleanNo.toLowerCase()}@student.local`;
    let password = '';
    if (explicitPasswordOrSalt && explicitPasswordOrSalt.length >= 6 && !explicitPasswordOrSalt.includes('salt')) {
      password = explicitPasswordOrSalt;
    } else {
      // Deterministic key generation using admission number without exposing secret salts
      const hash = await sha256Hex(`std_${cleanNo.toUpperCase()}_portal_student_key`);
      password = hash.slice(0, 32);
    }
    return { email, password, admissionNo: cleanNo.toUpperCase() };
  }

  /**
   * Notification Toast system
   */
  function toast(message, type = 'info', durationMs = 4000) {
    const container = document.getElementById('toast');
    if (!container) return;

    let borderClass = 'border-line';
    let iconSvg = '';

    if (type === 'success') {
      borderClass = 'border-[#86efac]';
      iconSvg = '<svg class="w-4 h-4 text-emerald-700 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>';
    } else if (type === 'error') {
      borderClass = 'border-[#fca5a5]';
      iconSvg = '<svg class="w-4 h-4 text-red-700 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>';
    } else if (type === 'warning') {
      borderClass = 'border-[#fde047]';
      iconSvg = '<svg class="w-4 h-4 text-amber-700 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>';
    } else {
      borderClass = 'border-line';
      iconSvg = '<svg class="w-4 h-4 text-ink flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>';
    }

    const item = document.createElement('div');
    item.className = `pointer-events-auto bg-white border ${borderClass} rounded shadow-sm p-3 flex items-start gap-2.5 text-xs text-ink transition-opacity duration-150`;
    item.innerHTML = `
      ${iconSvg}
      <div class="flex-1 leading-relaxed">${esc(message)}</div>
      <button type="button" class="text-stone-400 hover:text-ink text-sm leading-none px-1" aria-label="Close">&times;</button>
    `;

    const closeBtn = item.querySelector('button');
    let timer = null;

    const dismiss = () => {
      if (timer) clearTimeout(timer);
      if (item && item.style) item.style.opacity = '0';
      setTimeout(() => {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 160);
    };

    if (closeBtn) closeBtn.addEventListener('click', dismiss);
    timer = setTimeout(dismiss, durationMs);
    container.appendChild(item);
  }

  /**
   * Session & Authentication Management
   */
  const SESSION_KEY = 'portal_session_v1';
  let refreshTimer = null;

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveSession(session) {
    if (!session) {
      localStorage.removeItem(SESSION_KEY);
      Portal.session = null;
      if (refreshTimer) clearTimeout(refreshTimer);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    Portal.session = session;
    scheduleTokenRefresh(session);
  }

  function clearSession() {
    saveSession(null);
  }

  function scheduleTokenRefresh(session) {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!session || !session.expiresAt || !session.refreshToken) return;

    // Refresh 60 seconds before expiration
    const expiryMs = session.expiresAt * 1000;
    const nowMs = Date.now();
    const waitMs = Math.max(5000, expiryMs - nowMs - 60000);

    refreshTimer = setTimeout(async () => {
      try {
        await refreshToken();
      } catch (err) {
        console.warn('Auto refresh token failed:', err);
      }
    }, waitMs);
  }

  /**
   * Firebase Auth: Sign in with email and password
   */
  async function signInWithPassword(email, password) {
    const apiKey = Portal.env.FIREBASE_API_KEY;
    if (!apiKey) throw new Error('FIREBASE_API_KEY is not configured in env.');

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = (data && data.error && data.error.message) || 'Authentication failed';
      throw new Error(errMsg);
    }

    const expiresInSec = parseInt(data.expiresIn, 10) || 3600;
    return {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      uid: data.localId,
      expiresAt: Math.floor(Date.now() / 1000) + expiresInSec
    };
  }

  /**
   * Firebase Auth: Sign up new user (creates account without altering current principal session)
   */
  async function signUpUser(email, password) {
    const apiKey = Portal.env.FIREBASE_API_KEY;
    if (!apiKey) throw new Error('FIREBASE_API_KEY is not configured in env.');

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = (data && data.error && data.error.message) || 'Account creation failed';
      throw new Error(errMsg);
    }

    return {
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn
    };
  }

  /**
   * Firebase Auth: Refresh ID Token using refresh token
   */
  async function refreshToken() {
    const session = getSession();
    if (!session || !session.refreshToken) throw new Error('No refresh token available');

    const apiKey = Portal.env.FIREBASE_API_KEY;
    const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`
    });

    const data = await res.json();
    if (!res.ok) {
      clearSession();
      window.location.hash = '#/login';
      throw new Error('Session expired. Please sign in again.');
    }

    const expiresInSec = parseInt(data.expires_in, 10) || 3600;
    const updated = {
      ...session,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + expiresInSec
    };
    saveSession(updated);
    return updated.idToken;
  }

  /**
   * Offline / Demo Storage Engine for testing without live cloud dependencies
   */
  const DEMO_FLAG_KEY = 'portal_demo_active_v1';
  const DEMO_DB_KEY = 'portal_demo_data_v1';

  function isDemoMode() {
    try {
      return localStorage.getItem(DEMO_FLAG_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function setDemoMode(active) {
    try {
      if (active) localStorage.setItem(DEMO_FLAG_KEY, 'true');
      else localStorage.removeItem(DEMO_FLAG_KEY);
    } catch (e) {}
  }

  function getSeedDataset() {
    return {
      users: {
        seed_principal_uid: { role: 'principal', name: 'Dr. Eleanor Vance', email: 'principal@centre.com' },
        seed_teacher_uid: { role: 'teacher', name: 'Sarah Jenkins', email: 'sarah.teacher@apex.local', teacherId: 'seed_teacher_uid' },
        seed_student_uid: { role: 'student', name: 'Ananya Kumar', studentId: 'S101', email: 's101@student.local' }
      },
      batches: {
        b_10_sci: { capacity: 25, fee: 3000, grade: '10', name: 'Class 10 - Science & Maths', room: 'Room 2A', schedule: 'Mon, Wed, Fri 4:30 - 6:30 PM', subject: 'Physics, Chemistry & Mathematics', teacherId: 'seed_teacher_uid' },
        b_12_phy: { capacity: 20, fee: 3500, grade: '12', name: 'Class 12 - Advanced Physics', room: 'Room 3B', schedule: 'Tue, Thu, Sat 5:00 - 7:00 PM', subject: 'Physics', teacherId: 'seed_teacher_uid' }
      },
      teachers: {
        seed_teacher_uid: { batchIds: { b_10_sci: true, b_12_phy: true }, disabled: false, email: 'sarah.teacher@apex.local', name: 'Sarah Jenkins', phone: '9876543210', subjects: 'Physics & Mathematics' }
      },
      students: {
        S101: { admissionNo: 'S101', batchIds: { b_10_sci: true }, dob: '2009-05-14', gender: 'Female', grade: '10', guardianName: 'Ramesh Kumar', guardianPhone: '9845012345', joinedOn: '2026-06-01', name: 'Ananya Kumar', school: 'National Public School', status: 'active' },
        S102: { admissionNo: 'S102', batchIds: { b_10_sci: true, b_12_phy: true }, dob: '2008-08-22', gender: 'Male', grade: '12', guardianName: 'Sunita Sharma', guardianPhone: '9845098765', joinedOn: '2026-06-15', name: 'Rohan Sharma', school: 'Delhi Public School', status: 'active' }
      },
      fees: {
        S101: { dueDate: '2026-11-10', total: 6000, payments: { p_sample_1: { amount: 3000, date: '2026-10-05', mode: 'UPI', note: 'Term 1 initial payment', receiptNo: 'REC-202610-A9B2' } } },
        S102: { dueDate: '2026-10-20', total: 7000, payments: { p_sample_2: { amount: 2000, date: '2026-10-01', mode: 'Cash', note: 'Advance payment', receiptNo: 'REC-202610-C3D4' } } }
      },
      attendance: {
        S101: { '2026-10-25': 'P', '2026-10-26': 'P', '2026-10-27': 'L', '2026-10-28': 'P' },
        S102: { '2026-10-25': 'P', '2026-10-26': 'A', '2026-10-27': 'A', '2026-10-28': 'P' }
      },
      assignments: {
        a_sample_optics: { batchId: 'b_10_sci', createdAt: '2026-10-26T10:00:00.000Z', description: 'Solve Ray Optics questions 1 to 15 from Chapter 9. Show all ray diagrams clearly.', dueDate: '2026-11-05', maxMarks: 25, teacherId: 'seed_teacher_uid', title: 'Ray Optics & Refraction Problems' },
        a_sample_calculus: { batchId: 'b_12_phy', createdAt: '2026-10-24T09:00:00.000Z', description: 'Problems on integration by parts.', dueDate: '2026-10-28', maxMarks: 30, teacherId: 'seed_teacher_uid', title: 'Calculus in Kinematics' }
      },
      submissions: {
        S101: { a_sample_optics: { status: 'submitted', submittedAt: '2026-10-27T14:30:00.000Z', note: 'Completed ray diagrams.' } },
        S102: { a_sample_calculus: { status: 'rejected', submittedAt: '2026-10-27T11:00:00.000Z', reviewedAt: '2026-10-28T09:15:00.000Z', reviewedBy: 'Sarah Jenkins', feedback: 'Step 4 is missing the integration constant.' } }
      },
      warnings: {
        S101: { w_sample_fee: { type: 'fees', message: 'Term 2 tuition balance is due by 10 Nov.', from: 'Accounts Office', createdAt: '2026-10-25T09:00:00.000Z', acknowledged: false } },
        S102: { w_sample_att: { type: 'attendance', message: 'Attendance dropped below 75% this week.', from: 'Sarah Jenkins', createdAt: '2026-10-28T10:30:00.000Z', acknowledged: false } }
      },
      files: {}
    };
  }

  function getDemoDb() {
    try {
      const raw = localStorage.getItem(DEMO_DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const initial = getSeedDataset();
    saveDemoDb(initial);
    return initial;
  }

  function saveDemoDb(db) {
    try {
      localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
    } catch (e) {}
  }

  function resetDemoDb() {
    const initial = getSeedDataset();
    saveDemoDb(initial);
    return initial;
  }

  function executeDemoApi(path, options = {}) {
    const clean = (path.startsWith('/') ? path.slice(1) : path).split('?')[0];
    const parts = clean.split('/').filter(Boolean);
    const db = getDemoDb();
    const method = (options.method || 'GET').toUpperCase();

    if (method === 'GET') {
      let curr = db;
      for (const p of parts) {
        if (!curr || typeof curr !== 'object') return null;
        curr = curr[p];
      }
      return JSON.parse(JSON.stringify(curr !== undefined ? curr : null));
    } else if (method === 'PUT') {
      let body = options.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      let curr = db;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!curr[p] || typeof curr[p] !== 'object') curr[p] = {};
        curr = curr[p];
      }
      curr[parts[parts.length - 1]] = body;
      saveDemoDb(db);
      return JSON.parse(JSON.stringify(body || {}));
    } else if (method === 'PATCH') {
      let body = options.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      let curr = db;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!curr[p] || typeof curr[p] !== 'object') curr[p] = {};
        curr = curr[p];
      }
      const last = parts[parts.length - 1];
      curr[last] = Object.assign(curr[last] || {}, body);
      saveDemoDb(db);
      return JSON.parse(JSON.stringify(curr[last] || {}));
    } else if (method === 'DELETE') {
      let curr = db;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!curr[p] || typeof curr[p] !== 'object') return null;
        curr = curr[p];
      }
      delete curr[parts[parts.length - 1]];
      saveDemoDb(db);
      return null;
    }
  }

  function enableDemoSession(role = 'principal') {
    setDemoMode(true);
    getDemoDb();
    let session = null;
    if (role === 'teacher') {
      session = {
        uid: 'seed_teacher_uid',
        role: 'teacher',
        name: 'Sarah Jenkins',
        email: 'sarah.teacher@apex.local',
        teacherId: 'seed_teacher_uid',
        idToken: 'demo_token_teacher',
        refreshToken: 'demo_refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 86400
      };
    } else if (role === 'student') {
      session = {
        uid: 'seed_student_uid',
        role: 'student',
        name: 'Ananya Kumar',
        studentId: 'S101',
        email: 's101@student.local',
        idToken: 'demo_token_student',
        refreshToken: 'demo_refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 86400
      };
    } else {
      session = {
        uid: 'seed_principal_uid',
        role: 'principal',
        name: 'Dr. Eleanor Vance',
        email: 'principal@centre.com',
        idToken: 'demo_token_principal',
        refreshToken: 'demo_refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 86400
      };
    }
    saveSession(session);
    toast(`Entered Test Mode as ${session.name} (${session.role})`, 'success');
    const defaultRoute = role === 'student' ? '#/home' : '#/overview';
    router.navigate(defaultRoute);
  }

  /**
   * Realtime Database REST API wrapper
   */
  async function api(path, options = {}) {
    if (isDemoMode()) {
      return executeDemoApi(path, options);
    }

    const dbUrl = (Portal.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
    if (!dbUrl) {
      toast('Firebase Database URL not configured.', 'error');
      throw new Error('FIREBASE_DATABASE_URL missing');
    }

    const session = getSession();
    let token = null;
    if (!options.noAuth) {
      if (options.idToken) {
        token = options.idToken;
      } else if (options.headers && (options.headers.Authorization || options.headers.authorization)) {
        const authHeader = options.headers.Authorization || options.headers.authorization;
        const m = authHeader.match(/^Bearer\s+(.*)$/i);
        token = m ? m[1] : authHeader;
      } else if (session && session.idToken) {
        token = session.idToken;
      }
    }

    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    const makeRequest = async (authToken) => {
      const sep = cleanPath.includes('?') ? '&' : '?';
      const authQuery = authToken ? `${sep}auth=${encodeURIComponent(authToken)}` : '';
      const url = `${dbUrl}/${cleanPath}.json${authQuery}`;

      const fetchOpts = {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      };

      if (options.body !== undefined) {
        fetchOpts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }

      return await fetch(url, fetchOpts);
    };

    try {
      let res = await makeRequest(token);

      // 401 Unauthorized -> try refresh once
      if (res.status === 401 && session && session.refreshToken) {
        try {
          token = await refreshToken();
          res = await makeRequest(token);
        } catch (refreshErr) {
          clearSession();
          window.location.hash = '#/login';
          toast('Your session has expired. Please sign in.', 'warning');
          throw refreshErr;
        }
      }

      if (!res.ok) {
        let errorBody = {};
        try {
          errorBody = await res.json();
        } catch (e) {
          errorBody = { error: res.statusText };
        }
        const msg = errorBody.error || `Database error (${res.status})`;
        throw new Error(msg);
      }

      const data = await res.json();
      return data;
    } catch (err) {
      if (!options.silent) {
        toast(err.message || 'Network request failed', 'error');
      }
      throw err;
    }
  }

  /**
   * Realtime Database Server-Sent Events (SSE) Helper
   */
  function subscribeSSE(path, onData, onError) {
    const dbUrl = (Portal.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
    const session = getSession();
    const token = session ? session.idToken : null;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const authQuery = token ? `?auth=${encodeURIComponent(token)}` : '';
    const url = `${dbUrl}/${cleanPath}.json${authQuery}`;

    try {
      const es = new EventSource(url);

      es.addEventListener('put', (e) => {
        try {
          const payload = JSON.parse(e.data);
          onData && onData('put', payload);
        } catch (err) {
          console.error('SSE put parse error:', err);
        }
      });

      es.addEventListener('patch', (e) => {
        try {
          const payload = JSON.parse(e.data);
          onData && onData('patch', payload);
        } catch (err) {
          console.error('SSE patch parse error:', err);
        }
      });

      es.onerror = (err) => {
        onError && onError(err);
      };

      return {
        close: () => {
          es.close();
        }
      };
    } catch (err) {
      onError && onError(err);
      return { close: () => {} };
    }
  }

  /**
   * Client-side Hash Router
   */
  const router = {
    current: null,

    init() {
      window.addEventListener('hashchange', () => this.handleRoute());
      this.handleRoute();
    },

    navigate(hash) {
      if (window.location.hash === hash) {
        this.handleRoute();
      } else {
        window.location.hash = hash;
      }
    },

    getHash() {
      const raw = window.location.hash.slice(1);
      return raw ? (raw.startsWith('/') ? raw : `/${raw}`) : '/';
    },

    handleRoute() {
      const hash = this.getHash();
      this.current = hash;

      const session = getSession();
      Portal.session = session;

      if (!session) {
        if (Portal.app && Portal.app.renderLogin) {
          Portal.app.renderLogin();
        }
        return;
      }

      const role = session.role;
      const portalModule = Portal[role];
      if (!portalModule || !portalModule.routes) {
        clearSession();
        window.location.hash = '#/login';
        return;
      }

      let matchedHandler = null;
      let matchedParams = {};

      for (const [pattern, handler] of Object.entries(portalModule.routes)) {
        const regexStr = '^' + pattern.replace(/:([a-zA-Z0-9_]+)/g, '(?<$1>[^/]+)') + '$';
        const regex = new RegExp(regexStr);
        const match = hash.match(regex);
        if (match) {
          matchedHandler = handler;
          matchedParams = match.groups || {};
          break;
        }
      }

      if (matchedHandler) {
        matchedHandler(matchedParams);
      } else {
        const defaultRoute = portalModule.defaultRoute || (role === 'student' ? '#/home' : '#/overview');
        if (window.location.hash !== defaultRoute) {
          this.navigate(defaultRoute);
        } else {
          const appEl = document.getElementById('app');
          if (appEl) {
            appEl.innerHTML = `
              <div class="p-8 text-center">
                <p class="text-sm text-stone-500">Page not found.</p>
                <a href="${esc(defaultRoute)}" class="btn btn-primary btn-sm mt-3">Return home</a>
              </div>
            `;
          }
        }
      }
    }
  };

  // Expose Core API
  Portal.esc = esc;
  Portal.h = h;
  Portal.formatCurrency = formatCurrency;
  Portal.formatDate = formatDate;
  Portal.formatDateTime = formatDateTime;
  Portal.formatRelativeDue = formatRelativeDue;
  Portal.calcAttendance = calcAttendance;
  Portal.calcFeeStatus = calcFeeStatus;
  Portal.calcAssignmentState = calcAssignmentState;
  Portal.sha256Hex = sha256Hex;
  Portal.studentSyntheticAuth = studentSyntheticAuth;
  Portal.toast = toast;
  Portal.getSession = getSession;
  Portal.saveSession = saveSession;
  Portal.clearSession = clearSession;
  Portal.signInWithPassword = signInWithPassword;
  Portal.signUpUser = signUpUser;
  Portal.refreshToken = refreshToken;
  Portal.api = api;
  Portal.subscribeSSE = subscribeSSE;
  Portal.router = router;
  Portal.isDemoMode = isDemoMode;
  Portal.setDemoMode = setDemoMode;
  Portal.getDemoDb = getDemoDb;
  Portal.saveDemoDb = saveDemoDb;
  Portal.enableDemoSession = enableDemoSession;
  Portal.resetDemoDb = resetDemoDb;

  // Initialize session timer if logged in
  const existingSession = getSession();
  if (existingSession) {
    Portal.session = existingSession;
    scheduleTokenRefresh(existingSession);
  }
})();
