/**
 * Tuition Centre Management System - Principal Portal
 * Plain ES2020, strict data contract, clean and complete.
 */

(function () {
  'use strict';

  const {
    h, esc, formatCurrency, formatDate, formatDateTime, calcAttendance,
    calcFeeStatus, calcAssignmentState, toast, api, getSession,
    signUpUser, studentSyntheticAuth
  } = Portal;
  const Shared = Portal.Shared;
  const { renderShell, statStrip, renderTable, filterBar, openModal, closeModal, badge, icon } = Shared;

  const Principal = {
    routes: {},
    defaultRoute: '#/overview'
  };

  /**
   * Helper: Check and generate automatic warnings (weekly de-duplicated)
   */
  async function runAutomaticWarningChecks(students, fees, attendance, assignments, submissions) {
    if (!students) return;
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil((((now - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
    const weekTag = `${now.getFullYear()}_W${weekNumber}`;

    for (const [sid, student] of Object.entries(students)) {
      if (student.status !== 'active') continue;

      // 1. Fee Overdue Check
      const studentFee = fees && fees[sid];
      if (studentFee && studentFee.total) {
        let paid = 0;
        if (studentFee.payments) {
          Object.values(studentFee.payments).forEach(p => { paid += Number(p.amount) || 0; });
        }
        const feeStatus = calcFeeStatus(studentFee.total, paid, studentFee.dueDate);
        if (feeStatus === 'overdue') {
          const autoKey = `auto_fee_${weekTag}`;
          try {
            const existing = await api(`warnings/${sid}/${autoKey}`, { silent: true });
            if (!existing) {
              await api(`warnings/${sid}/${autoKey}`, {
                method: 'PUT',
                body: {
                  type: 'fees',
                  message: `Tuition fee of ${formatCurrency(studentFee.total - paid)} is overdue since ${formatDate(studentFee.dueDate)}. Please clear at the office.`,
                  from: 'System',
                  createdAt: now.toISOString()
                },
                silent: true
              });
            }
          } catch (e) {}
        }
      }

      // 2. Attendance < 75% Check
      const studentAtt = attendance && attendance[sid];
      if (studentAtt) {
        const stats = calcAttendance(studentAtt);
        if (stats.total >= 5 && stats.percent < 75) {
          const autoKey = `auto_att_${weekTag}`;
          try {
            const existing = await api(`warnings/${sid}/${autoKey}`, { silent: true });
            if (!existing) {
              await api(`warnings/${sid}/${autoKey}`, {
                method: 'PUT',
                body: {
                  type: 'attendance',
                  message: `Attendance is currently ${stats.percent}% (${stats.absent} absences), which is below the required 75% threshold.`,
                  from: 'System',
                  createdAt: now.toISOString()
                },
                silent: true
              });
            }
          } catch (e) {}
        }
      }

      // 3. Assignment Overdue > 2 days
      if (assignments && student.batchIds) {
        const enrolledBatchIds = Object.keys(student.batchIds);
        for (const [aid, assign] of Object.entries(assignments)) {
          if (enrolledBatchIds.includes(assign.batchId) && assign.dueDate) {
            const due = new Date(assign.dueDate);
            const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
            if (diffDays >= 2) {
              const sub = submissions && submissions[sid] && submissions[sid][aid];
              if (!sub || sub.status === 'rejected') {
                const autoKey = `auto_asg_${aid}_${weekTag}`;
                try {
                  const existing = await api(`warnings/${sid}/${autoKey}`, { silent: true });
                  if (!existing) {
                    await api(`warnings/${sid}/${autoKey}`, {
                      method: 'PUT',
                      body: {
                        type: 'assignment',
                        message: `Assignment "${assign.title}" is overdue by ${diffDays} days. Please submit promptly.`,
                        from: 'System',
                        createdAt: now.toISOString()
                      },
                      silent: true
                    });
                  }
                } catch (e) {}
              }
            }
          }
        }
      }
    }
  }

  /**
   * 1. Overview Dashboard
   */
  Principal.routes['/overview'] = async function () {
    renderShell({
      title: 'Centre Overview',
      activeNav: 'overview',
      content: '<div class="py-8 text-stone-500 text-xs">Loading overview...</div>'
    });

    try {
      const [students, batches, fees, attendance, assignments, submissions, warnings] = await Promise.all([
        api('students'),
        api('batches'),
        api('fees'),
        api('attendance'),
        api('assignments'),
        api('submissions'),
        api('warnings')
      ]);

      runAutomaticWarningChecks(students, fees, attendance, assignments, submissions);

      const studentList = students ? Object.entries(students).map(([sid, s]) => ({ sid, ...s })) : [];
      const activeStudents = studentList.filter(s => s.status === 'active');

      const todayStr = new Date().toISOString().slice(0, 10);
      let todayP = 0, todayL = 0, todayMarked = 0;
      if (attendance) {
        activeStudents.forEach(s => {
          const rec = attendance[s.sid] && attendance[s.sid][todayStr];
          if (rec === 'P') { todayP++; todayMarked++; }
          else if (rec === 'L') { todayL++; todayMarked++; }
          else if (rec === 'A') { todayMarked++; }
        });
      }
      const todayAttPct = todayMarked > 0 ? Math.round(((todayP + todayL) / todayMarked) * 1000) / 10 : 0;

      let feeCollectedMonth = 0;
      let feeOutstanding = 0;
      const currentYearMonth = todayStr.slice(0, 7);

      if (fees) {
        Object.entries(fees).forEach(([sid, f]) => {
          let paid = 0;
          if (f.payments) {
            Object.values(f.payments).forEach(p => {
              const pAmt = Number(p.amount) || 0;
              paid += pAmt;
              if (p.date && p.date.startsWith(currentYearMonth)) {
                feeCollectedMonth += pAmt;
              }
            });
          }
          const bal = (Number(f.total) || 0) - paid;
          if (bal > 0) feeOutstanding += bal;
        });
      }

      let awaitingReviewCount = 0;
      let longPendingList = [];
      const nowTs = Date.now();

      if (submissions) {
        Object.entries(submissions).forEach(([sid, studentSubs]) => {
          const student = students && students[sid];
          Object.entries(studentSubs).forEach(([aid, sub]) => {
            if (sub.status === 'submitted') {
              awaitingReviewCount++;
              const assign = assignments && assignments[aid];
              const submittedMs = sub.submittedAt ? new Date(sub.submittedAt).getTime() : nowTs;
              const pendingDays = Math.floor((nowTs - submittedMs) / (1000 * 60 * 60 * 24));
              if (pendingDays >= 3) {
                longPendingList.push({
                  studentName: student ? student.name : sid,
                  assignTitle: assign ? assign.title : aid,
                  pendingDays
                });
              }
            }
          });
        });
      }

      const overdueFeeStudents = [];
      const lowAttendanceStudents = [];

      activeStudents.forEach(s => {
        const f = fees && fees[s.sid];
        if (f) {
          let paid = 0;
          if (f.payments) Object.values(f.payments).forEach(p => { paid += Number(p.amount) || 0; });
          const st = calcFeeStatus(f.total, paid, f.dueDate);
          if (st === 'overdue') {
            overdueFeeStudents.push({
              name: s.name,
              sid: s.sid,
              balance: (Number(f.total) || 0) - paid,
              dueDate: f.dueDate
            });
          }
        }

        const att = attendance && attendance[s.sid];
        if (att) {
          const stats = calcAttendance(att);
          if (stats.total >= 5 && stats.percent < 75) {
            lowAttendanceStudents.push({
              name: s.name,
              sid: s.sid,
              percent: stats.percent,
              absent: stats.absent
            });
          }
        }
      });

      const recentActivity = [];
      if (fees) {
        Object.entries(fees).forEach(([sid, f]) => {
          const student = students && students[sid];
          if (f.payments) {
            Object.values(f.payments).forEach(p => {
              recentActivity.push({
                type: 'payment',
                title: `Fee payment of ${formatCurrency(p.amount)} recorded`,
                desc: `${student ? student.name : sid} (${p.mode || 'Cash'})`,
                date: p.date,
                sortTs: new Date(p.date || 0).getTime()
              });
            });
          }
        });
      }
      if (warnings) {
        Object.entries(warnings).forEach(([sid, studentWarnings]) => {
          const student = students && students[sid];
          Object.values(studentWarnings).forEach(w => {
            recentActivity.push({
              type: 'warning',
              title: `${w.type || 'Notice'} warning issued`,
              desc: `To ${student ? student.name : sid}: "${w.message}"`,
              date: w.createdAt,
              sortTs: new Date(w.createdAt || 0).getTime()
            });
          });
        });
      }
      recentActivity.sort((a, b) => b.sortTs - a.sortTs);
      const topRecent = recentActivity.slice(0, 7);

      const statsHtml = statStrip([
        { label: 'Active Students', value: activeStudents.length },
        { label: "Today's Attendance", value: `${todayAttPct}%`, note: `${todayMarked} marked today` },
        { label: 'Collected This Month', value: formatCurrency(feeCollectedMonth) },
        { label: 'Fees Outstanding', value: formatCurrency(feeOutstanding) },
        { label: 'Awaiting Review', value: awaitingReviewCount }
      ]);

      const container = h('div', { className: 'space-y-6' });
      container.innerHTML = statsHtml;

      const grid = h('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' });

      // Left: Needs Attention
      const attentionCard = h('div', { className: 'card p-5' });
      attentionCard.innerHTML = `
        <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
          <h3 class="font-display text-base font-semibold text-ink">Needs attention</h3>
          <span class="text-[11px] text-stone-500">${overdueFeeStudents.length + lowAttendanceStudents.length + longPendingList.length} items</span>
        </div>
      `;

      const attentionList = h('div', { className: 'space-y-3 text-xs' });
      if (overdueFeeStudents.length === 0 && lowAttendanceStudents.length === 0 && longPendingList.length === 0) {
        attentionList.innerHTML = '<p class="text-stone-400 py-3">All clear. No urgent issues requiring attention.</p>';
      } else {
        overdueFeeStudents.forEach(item => {
          attentionList.innerHTML += `
            <div class="flex items-center justify-between py-1.5 border-b border-line/60 last:border-0">
              <div>
                <a href="#/students/${esc(item.sid)}" class="font-medium text-ink hover:underline">${esc(item.name)}</a>
                <span class="text-stone-500 ml-1.5">fee overdue since ${formatDate(item.dueDate)}</span>
              </div>
              <div class="text-red-700 font-medium tabular-nums">${formatCurrency(item.balance)}</div>
            </div>
          `;
        });
        lowAttendanceStudents.forEach(item => {
          attentionList.innerHTML += `
            <div class="flex items-center justify-between py-1.5 border-b border-line/60 last:border-0">
              <div>
                <a href="#/students/${esc(item.sid)}" class="font-medium text-ink hover:underline">${esc(item.name)}</a>
                <span class="text-stone-500 ml-1.5">attendance below 75% (${item.absent} absences)</span>
              </div>
              <div class="text-amber-700 font-medium tabular-nums">${item.percent}%</div>
            </div>
          `;
        });
        longPendingList.forEach(item => {
          attentionList.innerHTML += `
            <div class="flex items-center justify-between py-1.5 border-b border-line/60 last:border-0">
              <div>
                <span class="font-medium text-ink">${esc(item.studentName)}</span>
                <span class="text-stone-500 ml-1.5">"${esc(item.assignTitle)}" pending review</span>
              </div>
              <div class="text-stone-500 text-[11px]">${item.pendingDays} days ago</div>
            </div>
          `;
        });
      }
      attentionCard.appendChild(attentionList);
      grid.appendChild(attentionCard);

      // Right: Recent Activity
      const activityCard = h('div', { className: 'card p-5' });
      activityCard.innerHTML = `
        <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
          <h3 class="font-display text-base font-semibold text-ink">Recent activity</h3>
          <span class="text-[11px] text-stone-500">Latest updates</span>
        </div>
      `;

      const activityList = h('div', { className: 'space-y-3 text-xs' });
      if (topRecent.length === 0) {
        activityList.innerHTML = '<p class="text-stone-400 py-3">No recent activity recorded yet.</p>';
      } else {
        topRecent.forEach(item => {
          activityList.innerHTML += `
            <div class="py-1.5 border-b border-line/60 last:border-0">
              <div class="flex items-baseline justify-between gap-2">
                <span class="font-medium text-ink">${esc(item.title)}</span>
                <span class="text-[10px] text-stone-400 flex-shrink-0">${formatDate(item.date)}</span>
              </div>
              <div class="text-[11px] text-stone-500 mt-0.5 truncate">${esc(item.desc)}</div>
            </div>
          `;
        });
      }
      activityCard.appendChild(activityList);
      grid.appendChild(activityCard);

      container.appendChild(grid);

      renderShell({
        title: 'Centre Overview',
        activeNav: 'overview',
        content: container
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load overview data.', 'error');
    }
  };

  /**
   * 2. Students List & Management
   */
  Principal.routes['/students'] = async function () {
    renderShell({
      title: 'Students',
      activeNav: 'students',
      actions: '<button type="button" id="btn-add-student" class="btn btn-primary btn-sm">+ Add student</button>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading students...</div>'
    });

    try {
      const [students, batches, fees] = await Promise.all([
        api('students'),
        api('batches'),
        api('fees')
      ]);

      const studentList = students ? Object.entries(students).map(([sid, s]) => ({ sid, ...s })) : [];
      const batchMap = batches || {};
      const feeMap = fees || {};

      let filteredList = [...studentList];
      let searchTerm = '';
      let filterBatch = 'all';
      let filterGrade = 'all';
      let filterStatus = 'all';
      let filterFee = 'all';

      const updateTable = () => {
        filteredList = studentList.filter(s => {
          if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matchName = (s.name || '').toLowerCase().includes(term);
            const matchAdm = (s.admissionNo || '').toLowerCase().includes(term);
            const matchPhone = (s.guardianPhone || '').includes(term);
            if (!matchName && !matchAdm && !matchPhone) return false;
          }
          if (filterBatch !== 'all' && (!s.batchIds || !s.batchIds[filterBatch])) return false;
          if (filterGrade !== 'all' && s.grade !== filterGrade) return false;
          if (filterStatus !== 'all' && s.status !== filterStatus) return false;
          if (filterFee !== 'all') {
            const f = feeMap[s.sid];
            let paid = 0;
            if (f && f.payments) Object.values(f.payments).forEach(p => { paid += Number(p.amount) || 0; });
            const st = f ? calcFeeStatus(f.total, paid, f.dueDate) : 'due';
            if (st !== filterFee) return false;
          }
          return true;
        });

        const tableWrapper = document.getElementById('students-table-container');
        if (tableWrapper) {
          tableWrapper.innerHTML = '';
          const tableEl = renderTable({
            columns: [
              {
                header: 'Admission No',
                key: 'admissionNo',
                className: 'w-28 uppercase font-medium',
                render: row => `<span class="font-mono text-xs">${esc(row.admissionNo)}</span>`
              },
              {
                header: 'Name',
                key: 'name',
                className: 'font-medium',
                render: row => `<a href="#/students/${esc(row.sid)}" class="text-ink font-medium hover:underline">${esc(row.name)}</a>`
              },
              {
                header: 'Grade',
                key: 'grade',
                className: 'w-20'
              },
              {
                header: 'Batch(es)',
                key: 'batches',
                render: row => {
                  if (!row.batchIds || Object.keys(row.batchIds).length === 0) return '\u2014';
                  return Object.keys(row.batchIds).map(bid => {
                    const b = batchMap[bid];
                    return `<span class="inline-block bg-paper px-1.5 py-0.5 rounded border border-line text-[11px] mr-1 mb-1">${esc(b ? b.name : bid)}</span>`;
                  }).join('');
                }
              },
              {
                header: 'Fee Status',
                key: 'feeStatus',
                className: 'w-28',
                render: row => {
                  const f = feeMap[row.sid];
                  let paid = 0;
                  if (f && f.payments) Object.values(f.payments).forEach(p => { paid += Number(p.amount) || 0; });
                  const st = f ? calcFeeStatus(f.total, paid, f.dueDate) : 'due';
                  const badgeMap = {
                    paid: badge('Paid', 'success'),
                    overdue: badge('Overdue', 'danger'),
                    partial: badge('Partial', 'warning'),
                    due: badge('Due', 'neutral')
                  };
                  return badgeMap[st] || badge(st, 'neutral');
                }
              },
              {
                header: 'Status',
                key: 'status',
                className: 'w-20',
                render: row => row.status === 'active' ? badge('Active', 'success') : badge('Inactive', 'neutral')
              }
            ],
            data: filteredList,
            emptyMessage: 'No students found matching your filters.'
          });
          tableWrapper.appendChild(tableEl);
        }
      };

      const gradesSet = new Set();
      studentList.forEach(s => { if (s.grade) gradesSet.add(s.grade); });
      const gradeOptions = [{ label: 'All grades', value: 'all' }, ...Array.from(gradesSet).sort().map(g => ({ label: `Grade ${g}`, value: g }))];

      const batchOptions = [{ label: 'All batches', value: 'all' }, ...Object.entries(batchMap).map(([bid, b]) => ({ label: b.name, value: bid }))];

      const filterBarEl = filterBar({
        searchPlaceholder: 'Search name, admission no, phone...',
        searchId: 'student-search',
        filters: [
          { id: 'f-batch', options: batchOptions },
          { id: 'f-grade', options: gradeOptions },
          {
            id: 'f-status',
            options: [
              { label: 'All status', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' }
            ]
          },
          {
            id: 'f-fee',
            options: [
              { label: 'All fees', value: 'all' },
              { label: 'Overdue', value: 'overdue' },
              { label: 'Due', value: 'due' },
              { label: 'Partial', value: 'partial' },
              { label: 'Paid', value: 'paid' }
            ]
          }
        ],
        onSearch: term => {
          searchTerm = term;
          updateTable();
        },
        onFilterChange: (id, val) => {
          if (id === 'f-batch') filterBatch = val;
          if (id === 'f-grade') filterGrade = val;
          if (id === 'f-status') filterStatus = val;
          if (id === 'f-fee') filterFee = val;
          updateTable();
        }
      });

      const mainContent = h('div', { className: 'space-y-4' });
      mainContent.appendChild(filterBarEl);

      const tableContainer = h('div', { id: 'students-table-container' });
      mainContent.appendChild(tableContainer);

      renderShell({
        title: 'Students',
        activeNav: 'students',
        actions: `
          <div class="flex items-center gap-2">
            <button type="button" id="btn-bulk-student" class="btn btn-sm btn-ghost border border-line bg-white hover:bg-paper">
              ${Shared.icon('assignments', 'w-4 h-4 text-emerald-700')} Bulk Upload
            </button>
            <button type="button" id="btn-add-student" class="btn btn-primary btn-sm">+ Add student</button>
          </div>
        `,
        content: mainContent
      });

      updateTable();

      const addBtn = document.getElementById('btn-add-student');
      if (addBtn) {
        addBtn.addEventListener('click', () => openAddStudentModal(studentList, batchMap, () => Principal.routes['/students']()));
      }

      const bulkBtn = document.getElementById('btn-bulk-student');
      if (bulkBtn) {
        bulkBtn.addEventListener('click', () => openBulkUploadModal(studentList, batchMap, () => Principal.routes['/students']()));
      }
    } catch (err) {
      console.error(err);
      toast('Failed to load students.', 'error');
    }
  };

  /**
   * Modal: Add New Student
   */
  function openAddStudentModal(existingStudents, batches, onSaved) {
    const batchCheckboxesHtml = Object.entries(batches).map(([bid, b]) => `
      <label class="flex items-center gap-2 text-xs py-1">
        <input type="checkbox" name="batch_${esc(bid)}" value="${esc(bid)}" class="rounded border-line text-brand focus:ring-brand">
        <span>${esc(b.name)} (${esc(b.subject || '')})</span>
      </label>
    `).join('');

    const formHtml = `
      <form id="add-student-form" class="space-y-3.5" novalidate>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="label" for="new-adm-no">Admission number *</label>
            <input type="text" id="new-adm-no" required class="input uppercase text-xs" placeholder="e.g. S105" />
          </div>
          <div>
            <label class="label" for="new-name">Full name *</label>
            <input type="text" id="new-name" required class="input text-xs" placeholder="Student name" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="label" for="new-grade">Grade / Class *</label>
            <input type="text" id="new-grade" required class="input text-xs" placeholder="10" />
          </div>
          <div>
            <label class="label" for="new-dob">Date of birth</label>
            <input type="date" id="new-dob" class="input text-xs" />
          </div>
          <div>
            <label class="label" for="new-gender">Gender</label>
            <select id="new-gender" class="input text-xs bg-white">
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="label" for="new-guardian-name">Guardian name *</label>
            <input type="text" id="new-guardian-name" required class="input text-xs" />
          </div>
          <div>
            <label class="label" for="new-guardian-phone">Guardian phone *</label>
            <input type="tel" id="new-guardian-phone" required class="input text-xs" placeholder="10 digits" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="label" for="new-school">School name</label>
            <input type="text" id="new-school" class="input text-xs" />
          </div>
          <div>
            <label class="label" for="new-joined">Joining date</label>
            <input type="date" id="new-joined" class="input text-xs" value="${new Date().toISOString().slice(0, 10)}" />
          </div>
        </div>

        <div>
          <label class="label" for="new-address">Address</label>
          <input type="text" id="new-address" class="input text-xs" />
        </div>

        <div>
          <label class="label">Assign Batches</label>
          <div class="card p-2.5 max-h-32 overflow-y-auto bg-paper/30">
            ${batchCheckboxesHtml || '<span class="text-stone-400 text-xs">No batches created yet.</span>'}
          </div>
        </div>

        <div>
          <label class="label" for="new-notes">Notes (internal)</label>
          <textarea id="new-notes" rows="2" class="input text-xs"></textarea>
        </div>

        <div id="add-student-error" class="hidden text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200"></div>
      </form>
    `;

    openModal({
      title: 'Add new student',
      content: formHtml,
      confirmText: 'Create student',
      onConfirm: async () => {
        const errorEl = document.getElementById('add-student-error');
        errorEl.classList.add('hidden');
        errorEl.textContent = '';

        const admNo = document.getElementById('new-adm-no').value.trim().toUpperCase();
        const name = document.getElementById('new-name').value.trim();
        const grade = document.getElementById('new-grade').value.trim();
        const guardianName = document.getElementById('new-guardian-name').value.trim();
        const guardianPhone = document.getElementById('new-guardian-phone').value.trim();
        const dob = document.getElementById('new-dob').value;
        const gender = document.getElementById('new-gender').value;
        const school = document.getElementById('new-school').value.trim();
        const joinedOn = document.getElementById('new-joined').value;
        const address = document.getElementById('new-address').value.trim();
        const notes = document.getElementById('new-notes').value.trim();

        if (!admNo || !name || !grade || !guardianName || !guardianPhone) {
          errorEl.textContent = 'Please fill in all required fields marked with *.';
          errorEl.classList.remove('hidden');
          throw new Error('Validation failed');
        }

        const duplicate = existingStudents.some(s => (s.admissionNo || '').toUpperCase() === admNo);
        if (duplicate) {
          errorEl.textContent = `Admission number ${admNo} is already registered.`;
          errorEl.classList.remove('hidden');
          throw new Error('Duplicate admission number');
        }

        const batchIds = {};
        Object.keys(batches).forEach(bid => {
          const cb = document.querySelector(`input[name="batch_${bid}"]`);
          if (cb && cb.checked) {
            batchIds[bid] = true;
          }
        });

        const sid = admNo;

        let authResult;
        try {
          const creds = await studentSyntheticAuth(admNo);
          authResult = await signUpUser(creds.email, creds.password);
        } catch (authErr) {
          errorEl.textContent = `Step 1 Failed: Could not create student login (${authErr.message}). Retry.`;
          errorEl.classList.remove('hidden');
          throw authErr;
        }

        try {
          await api(`users/${authResult.uid}`, {
            method: 'PUT',
            body: {
              role: 'student',
              studentId: sid,
              name
            }
          });
        } catch (userNodeErr) {
          errorEl.textContent = `Step 2 Failed: Could not link student login account (${userNodeErr.message}). Retry.`;
          errorEl.classList.remove('hidden');
          throw userNodeErr;
        }

        try {
          const studentRecord = {
            admissionNo: admNo,
            name,
            grade,
            batchIds,
            dob: dob || null,
            gender: gender || null,
            guardianName,
            guardianPhone,
            address: address || null,
            school: school || null,
            joinedOn: joinedOn || new Date().toISOString().slice(0, 10),
            status: 'active',
            notes: notes || null
          };
          await api(`students/${sid}`, {
            method: 'PUT',
            body: studentRecord
          });

          // Automated Fee: set student fee to total of assigned batch fees
          let calculatedFee = 0;
          Object.keys(batchIds).forEach(bid => {
            if (batches[bid] && Number(batches[bid].fee) > 0) {
              calculatedFee += Number(batches[bid].fee);
            }
          });
          if (calculatedFee > 0) {
            try {
              const defaultDueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
              await api(`fees/${sid}`, {
                method: 'PATCH',
                body: {
                  total: calculatedFee,
                  dueDate: defaultDueDate,
                  description: 'Automated Batch Tuition Fee',
                  updatedAt: new Date().toISOString()
                }
              });
            } catch (feeErr) {
              console.warn('Could not auto-set batch fee:', feeErr);
            }
          }
        } catch (profileErr) {
          errorEl.textContent = `Step 3 Failed: Could not write student profile record (${profileErr.message}).`;
          errorEl.classList.remove('hidden');
          throw profileErr;
        }

        toast(`Student ${name} (${admNo}) added successfully.`, 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * Modal: Bulk Upload Students via Excel/CSV
   */
  function openBulkUploadModal(existingStudents, batches, onSaved) {
    let parsedData = null;

    const modalContent = `
      <div class="space-y-4 text-xs">
        <div class="p-3 bg-brand-soft/40 border border-brand/20 rounded-md">
          <div class="font-semibold text-brand-dark mb-1">Step 1: Download Demo Template</div>
          <p class="text-stone-600 mb-2">Download the Excel template pre-configured with interactive dropdowns for your batches and gender.</p>
          <button type="button" id="btn-dl-template" class="btn btn-sm btn-ghost border border-brand text-brand bg-white hover:bg-brand-soft">
            ${Shared.icon('assignments', 'w-4 h-4')} Download Excel Template (.xlsx)
          </button>
        </div>

        <div class="space-y-2">
          <div class="font-semibold text-ink">Step 2: Upload Completed Excel / CSV File</div>
          <input type="file" id="bulk-student-file" accept=".xlsx,.xls,.csv" class="input text-xs cursor-pointer" />
          <p class="text-[11px] text-stone-500">Supports .xlsx, .xls, and .csv files.</p>
        </div>

        <div id="bulk-preview-area" class="hidden space-y-3 pt-2 border-t border-line">
          <div id="bulk-summary" class="flex items-center gap-3 font-medium"></div>
          <div id="bulk-errors-box" class="hidden p-2.5 bg-red-50 text-red-700 border border-red-200 rounded max-h-28 overflow-y-auto"></div>
          <div class="card overflow-x-auto max-h-48">
            <table class="w-full text-left text-[11px]" id="bulk-preview-table">
              <thead class="bg-paper border-b border-line">
                <tr>
                  <th class="p-1.5">Adm No</th>
                  <th class="p-1.5">Name</th>
                  <th class="p-1.5">Grade</th>
                  <th class="p-1.5">Batch</th>
                  <th class="p-1.5">Auto Fee</th>
                  <th class="p-1.5">Guardian</th>
                  <th class="p-1.5">Phone</th>
                </tr>
              </thead>
              <tbody id="bulk-preview-tbody" class="divide-y divide-line"></tbody>
            </table>
          </div>
        </div>

        <div id="bulk-progress-area" class="hidden space-y-2 pt-2 border-t border-line">
          <div class="flex items-center justify-between text-[11px]">
            <span id="bulk-progress-status" class="text-stone-600 font-medium">Processing...</span>
            <span id="bulk-progress-percent" class="tabular-nums font-semibold text-brand">0%</span>
          </div>
          <div class="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
            <div id="bulk-progress-bar" class="bg-brand h-full transition-all duration-150" style="width: 0%"></div>
          </div>
        </div>
      </div>
    `;

    openModal({
      title: 'Bulk Upload Students',
      content: modalContent,
      confirmText: 'Import Students',
      onConfirm: async () => {
        if (!parsedData || !parsedData.valid || parsedData.valid.length === 0) {
          toast('Please select an Excel file with valid student records first.', 'warning');
          throw new Error('No valid students to import');
        }

        const validRows = parsedData.valid;
        const progressArea = document.getElementById('bulk-progress-area');
        const progressBar = document.getElementById('bulk-progress-bar');
        const progressStatus = document.getElementById('bulk-progress-status');
        const progressPercent = document.getElementById('bulk-progress-percent');
        if (progressArea) progressArea.classList.remove('hidden');

        let importedCount = 0;
        let feeAssignedCount = 0;

        for (let i = 0; i < validRows.length; i++) {
          const row = validRows[i];
          const pct = Math.round(((i + 1) / validRows.length) * 100);
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (progressPercent) progressPercent.textContent = `${pct}%`;
          if (progressStatus) progressStatus.textContent = `Registering student ${i + 1} of ${validRows.length}: ${row.name} (${row.admNo})...`;

          const sid = row.admNo;
          const batchIds = {};
          let autoFee = 0;
          if (row.batchId) {
            batchIds[row.batchId] = true;
            if (batches[row.batchId] && Number(batches[row.batchId].fee) > 0) {
              autoFee = Number(batches[row.batchId].fee);
            }
          }

          try {
            // 1. Synthetic Auth Signup
            const creds = await studentSyntheticAuth(sid);
            const authRes = await signUpUser(creds.email, creds.password);

            // 2. Link User Account
            await api(`users/${authRes.uid}`, {
              method: 'PUT',
              body: {
                role: 'student',
                studentId: sid,
                name: row.name
              }
            });

            // 3. Write Student Record
            const studentPayload = {
              admissionNo: sid,
              name: row.name,
              grade: row.grade,
              batchIds,
              dob: row.dob || null,
              gender: row.gender || 'Male',
              guardianName: row.guardianName,
              guardianPhone: row.guardianPhone,
              school: row.school || null,
              address: row.address || null,
              joinedOn: new Date().toISOString().slice(0, 10),
              status: 'active',
              notes: 'Imported via Bulk Upload'
            };
            await api(`students/${sid}`, {
              method: 'PUT',
              body: studentPayload
            });

            // 4. Automated Fee Assignment based on batch fee
            if (autoFee > 0) {
              const defaultDueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
              await api(`fees/${sid}`, {
                method: 'PATCH',
                body: {
                  total: autoFee,
                  dueDate: defaultDueDate,
                  description: `Tuition Fee for ${batches[row.batchId] ? batches[row.batchId].name : 'Batch'}`,
                  updatedAt: new Date().toISOString()
                }
              });
              feeAssignedCount++;
            }

            importedCount++;
          } catch (rowErr) {
            console.error(`Failed to import student ${row.admNo}:`, rowErr);
          }
        }

        toast(`Successfully imported ${importedCount} students (${feeAssignedCount} automated fees configured).`, 'success');
        onSaved && onSaved();
      }
    });

    setTimeout(() => {
      const dlBtn = document.getElementById('btn-dl-template');
      if (dlBtn) {
        dlBtn.onclick = () => Shared.downloadStudentBulkTemplate(batches);
      }

      const fileInput = document.getElementById('bulk-student-file');
      if (fileInput) {
        fileInput.onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;

          try {
            const buf = await file.arrayBuffer();
            parsedData = Shared.parseStudentBulkExcel(buf, existingStudents, batches);

            const previewArea = document.getElementById('bulk-preview-area');
            const summaryEl = document.getElementById('bulk-summary');
            const errorsBox = document.getElementById('bulk-errors-box');
            const tbody = document.getElementById('bulk-preview-tbody');

            if (previewArea) previewArea.classList.remove('hidden');
            if (summaryEl) {
              summaryEl.innerHTML = `
                <span class="text-emerald-700 font-semibold">&#10003; ${parsedData.valid.length} Valid Students</span>
                ${parsedData.invalid.length > 0 ? `<span class="text-red-700 font-semibold">&#9888; ${parsedData.invalid.length} Invalid Rows</span>` : ''}
              `;
            }

            if (errorsBox) {
              if (parsedData.invalid.length > 0) {
                errorsBox.classList.remove('hidden');
                errorsBox.innerHTML = `
                  <div class="font-semibold mb-1">Issues found in ${parsedData.invalid.length} row(s) (will be skipped):</div>
                  <ul class="list-disc pl-4 space-y-0.5">
                    ${parsedData.invalid.map(inv => `<li>Row ${inv.rowNum} (${esc(inv.admNo)}): ${esc(inv.errors.join(', '))}</li>`).join('')}
                  </ul>
                `;
              } else {
                errorsBox.classList.add('hidden');
              }
            }

            if (tbody) {
              tbody.innerHTML = parsedData.valid.map(r => {
                const b = r.batchId ? batches[r.batchId] : null;
                const feeText = b && b.fee ? `₹${b.fee}` : '₹0';
                return `
                  <tr class="hover:bg-paper/50">
                    <td class="p-1.5 font-mono font-medium">${esc(r.admNo)}</td>
                    <td class="p-1.5">${esc(r.name)}</td>
                    <td class="p-1.5">${esc(r.grade)}</td>
                    <td class="p-1.5">${esc(r.batchName || 'None')}</td>
                    <td class="p-1.5 tabular-nums text-emerald-700 font-semibold">${feeText}</td>
                    <td class="p-1.5">${esc(r.guardianName)}</td>
                    <td class="p-1.5 tabular-nums">${esc(r.guardianPhone)}</td>
                  </tr>
                `;
              }).join('');
            }
          } catch (readErr) {
            console.error(readErr);
            toast('Failed to parse Excel file: ' + readErr.message, 'error');
          }
        };
      }
    }, 60);
  }

  /**
   * 3. Student Detail View
   */
  Principal.routes['/students/:sid'] = async function ({ sid }) {
    renderShell({
      title: 'Student Details',
      activeNav: 'students',
      actions: '<a href="#/students" class="btn btn-ghost btn-sm">&larr; Back to list</a>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading student record...</div>'
    });

    try {
      const [student, batches, attendance, fee, assignments, submissions, warnings] = await Promise.all([
        api(`students/${sid}`),
        api('batches'),
        api(`attendance/${sid}`),
        api(`fees/${sid}`),
        api('assignments'),
        api(`submissions/${sid}`),
        api(`warnings/${sid}`)
      ]);

      if (!student) {
        toast('Student not found.', 'error');
        Portal.router.navigate('#/students');
        return;
      }

      let activeTab = 'profile';

      const renderView = () => {
        const batchMap = batches || {};
        const attStats = calcAttendance(attendance);

        let feePaid = 0;
        if (fee && fee.payments) {
          Object.values(fee.payments).forEach(p => { feePaid += Number(p.amount) || 0; });
        }
        const feeTotal = Number(fee ? fee.total : 0) || 0;
        const feeBalance = feeTotal - feePaid;
        const feeStatus = calcFeeStatus(feeTotal, feePaid, fee ? fee.dueDate : null);

        const container = h('div', { className: 'space-y-6' });

        const headerCard = h('div', { className: 'card p-5' });
        headerCard.innerHTML = `
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-display text-xl font-semibold text-ink">${esc(student.name)}</h3>
                <span class="font-mono text-xs text-stone-500">(${esc(student.admissionNo)})</span>
                ${student.status === 'active' ? badge('Active', 'success') : badge('Inactive', 'neutral')}
              </div>
              <p class="text-xs text-stone-500 mt-1">Grade ${esc(student.grade)} &bull; Guardian: ${esc(student.guardianName)} (${esc(student.guardianPhone)})</p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" id="btn-edit-student" class="btn btn-sm">Edit profile</button>
              <button type="button" id="btn-toggle-status" class="btn btn-sm ${student.status === 'active' ? 'btn-danger' : 'btn-primary'}">
                ${student.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-line text-xs">
            <div>
              <div class="text-[11px] text-stone-500">Attendance</div>
              <div class="text-base font-semibold tabular-nums text-ink">${attStats.percent}%</div>
            </div>
            <div>
              <div class="text-[11px] text-stone-500">Fee Balance</div>
              <div class="text-base font-semibold tabular-nums ${feeBalance > 0 ? 'text-red-700' : 'text-emerald-700'}">${formatCurrency(feeBalance)}</div>
            </div>
            <div>
              <div class="text-[11px] text-stone-500">Fee Status</div>
              <div class="mt-0.5">${feeStatus === 'paid' ? badge('Paid', 'success') : (feeStatus === 'overdue' ? badge('Overdue', 'danger') : badge(feeStatus, 'neutral'))}</div>
            </div>
            <div>
              <div class="text-[11px] text-stone-500">Joined</div>
              <div class="text-xs text-ink font-medium mt-0.5">${formatDate(student.joinedOn)}</div>
            </div>
          </div>
        `;
        container.appendChild(headerCard);

        const tabsNav = h('div', { className: 'flex border-b border-line gap-4 text-xs font-medium' });
        const tabs = [
          { id: 'profile', label: 'Profile' },
          { id: 'attendance', label: 'Attendance' },
          { id: 'fees', label: 'Fees & Payments' },
          { id: 'assignments', label: 'Assignments' },
          { id: 'warnings', label: 'Warnings' }
        ];

        tabs.forEach(t => {
          const btn = h('button', {
            type: 'button',
            className: `pb-2.5 transition-colors border-b-2 -mb-px ${activeTab === t.id ? 'border-brand text-brand font-semibold' : 'border-transparent text-stone-500 hover:text-ink'}`,
            onClick: () => {
              activeTab = t.id;
              renderView();
            }
          }, t.label);
          tabsNav.appendChild(btn);
        });
        container.appendChild(tabsNav);

        const tabContent = h('div', { className: 'space-y-4' });

        if (activeTab === 'profile') {
          const enrolledBatches = student.batchIds ? Object.keys(student.batchIds).map(bid => batchMap[bid] ? batchMap[bid].name : bid).join(', ') : 'None';
          tabContent.innerHTML = `
            <div class="card p-5 text-xs grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span class="label">Date of birth</span>
                <p class="text-ink font-medium">${formatDate(student.dob)}</p>
              </div>
              <div>
                <span class="label">Gender</span>
                <p class="text-ink font-medium">${esc(student.gender || '\u2014')}</p>
              </div>
              <div>
                <span class="label">School</span>
                <p class="text-ink font-medium">${esc(student.school || '\u2014')}</p>
              </div>
              <div>
                <span class="label">Address</span>
                <p class="text-ink font-medium">${esc(student.address || '\u2014')}</p>
              </div>
              <div class="md:col-span-2">
                <span class="label">Enrolled Batches</span>
                <p class="text-ink font-medium">${esc(enrolledBatches)}</p>
              </div>
              <div class="md:col-span-2">
                <span class="label">Internal Notes</span>
                <p class="text-ink font-medium">${esc(student.notes || 'None')}</p>
              </div>
            </div>
          `;
        } else if (activeTab === 'attendance') {
          const attDates = attendance ? Object.keys(attendance).sort().reverse() : [];
          tabContent.innerHTML = `
            <div class="card p-5">
              <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
                <h4 class="font-display text-base font-semibold">Attendance Log</h4>
                <div class="text-xs text-stone-500">Total marked: ${attStats.total} days</div>
              </div>
              ${attDates.length === 0 ? '<p class="text-xs text-stone-400 py-3">No attendance recorded yet.</p>' : `
                <div class="divide-y divide-line text-xs">
                  ${attDates.map(d => {
                    const status = attendance[d];
                    const b = status === 'P' ? badge('Present', 'success') : (status === 'L' ? badge('Late', 'warning') : badge('Absent', 'danger'));
                    return `
                      <div class="py-2 flex items-center justify-between">
                        <span>${formatDate(d)}</span>
                        ${b}
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
              <p class="text-[11px] text-stone-400 mt-3 pt-2 border-t border-line">Footnote: Late (L) is counted as present towards total attendance.</p>
            </div>
          `;
        } else if (activeTab === 'fees') {
          const paymentsList = fee && fee.payments ? Object.entries(fee.payments).map(([pid, p]) => ({ pid, ...p })) : [];
          paymentsList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

          tabContent.innerHTML = `
            <div class="space-y-4">
              <div class="card p-5">
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line mb-3">
                  <h4 class="font-display text-base font-semibold">Fee Account</h4>
                  <div class="flex items-center gap-2">
                    <button type="button" id="btn-edit-fee" class="btn btn-sm">Set Total Fee</button>
                    <button type="button" id="btn-record-payment" class="btn btn-primary btn-sm">+ Record payment</button>
                  </div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div class="label">Total Fee</div>
                    <div class="text-sm font-semibold tabular-nums">${formatCurrency(feeTotal)}</div>
                  </div>
                  <div>
                    <div class="label">Amount Paid</div>
                    <div class="text-sm font-semibold text-emerald-700 tabular-nums">${formatCurrency(feePaid)}</div>
                  </div>
                  <div>
                    <div class="label">Balance Due</div>
                    <div class="text-sm font-semibold text-red-700 tabular-nums">${formatCurrency(feeBalance)}</div>
                  </div>
                  <div>
                    <div class="label">Due Date</div>
                    <div class="text-sm font-medium">${formatDate(fee ? fee.dueDate : null)}</div>
                  </div>
                </div>
              </div>

              <div class="card p-5">
                <h4 class="font-display text-base font-semibold pb-3 border-b border-line mb-3">Payment Receipts</h4>
                ${paymentsList.length === 0 ? '<p class="text-xs text-stone-400 py-3">No payments recorded yet.</p>' : `
                  <div class="divide-y divide-line text-xs">
                    ${paymentsList.map(p => `
                      <div class="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <div class="font-medium text-ink font-mono text-xs">${esc(p.receiptNo || p.pid)}</div>
                          <div class="text-[11px] text-stone-500">${formatDate(p.date)} &bull; ${esc(p.mode || 'Cash')} ${p.note ? `&bull; ${esc(p.note)}` : ''}</div>
                        </div>
                        <div class="flex items-center gap-3">
                          <span class="font-semibold text-ink tabular-nums">${formatCurrency(p.amount)}</span>
                          <a href="#/fees/receipt/${esc(sid)}/${esc(p.pid)}" class="btn btn-sm text-[11px]">Print Receipt</a>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>
            </div>
          `;
        } else if (activeTab === 'assignments') {
          const enrolledBids = student.batchIds ? Object.keys(student.batchIds) : [];
          const studentAssignments = assignments ? Object.entries(assignments).filter(([, a]) => enrolledBids.includes(a.batchId)) : [];

          tabContent.innerHTML = `
            <div class="card p-5">
              <h4 class="font-display text-base font-semibold pb-3 border-b border-line mb-3">Assignments for Enrolled Batches</h4>
              ${studentAssignments.length === 0 ? '<p class="text-xs text-stone-400 py-3">No assignments found for enrolled batches.</p>' : `
                <div class="divide-y divide-line text-xs">
                  ${studentAssignments.map(([aid, a]) => {
                    const sub = submissions && submissions[aid];
                    const state = calcAssignmentState(a, sub);
                    const b = state === 'approved' ? badge('Approved', 'success') : (state === 'rejected' ? badge('Rejected', 'danger') : (state === 'submitted' ? badge('Submitted', 'warning') : badge('Not submitted', 'neutral')));
                    return `
                      <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div class="font-medium text-ink">${esc(a.title)}</div>
                          <div class="text-[11px] text-stone-500">Due ${formatDate(a.dueDate)} &bull; Max Marks: ${esc(a.maxMarks || '\u2014')}</div>
                        </div>
                        <div class="flex items-center gap-3">
                          ${b}
                          ${sub && sub.marks !== undefined ? `<span class="font-semibold tabular-nums text-xs">${sub.marks}/${a.maxMarks || 0}</span>` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          `;
        } else if (activeTab === 'warnings') {
          const warningsList = warnings ? Object.entries(warnings).map(([wid, w]) => ({ wid, ...w })) : [];
          warningsList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

          tabContent.innerHTML = `
            <div class="card p-5">
              <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
                <h4 class="font-display text-base font-semibold">Issued Warnings</h4>
                <button type="button" id="btn-compose-student-warning" class="btn btn-primary btn-sm">+ Compose warning</button>
              </div>
              ${warningsList.length === 0 ? '<p class="text-xs text-stone-400 py-3">No warnings issued to this student.</p>' : `
                <div class="divide-y divide-line text-xs">
                  ${warningsList.map(w => `
                    <div class="py-3">
                      <div class="flex items-baseline justify-between gap-2 mb-1">
                        <span class="font-semibold capitalize text-ink">${esc(w.type || 'Notice')} warning</span>
                        <span class="text-[10px] text-stone-400">${formatDateTime(w.createdAt)}</span>
                      </div>
                      <p class="text-stone-700 leading-relaxed">${esc(w.message)}</p>
                      <div class="mt-1.5 flex items-center gap-2 text-[11px]">
                        <span class="text-stone-400">From: ${esc(w.from || 'Principal')}</span>
                        &bull;
                        <span>${w.acknowledged ? `<span class="text-emerald-700 font-medium">Acknowledged on ${formatDate(w.acknowledgedAt)}</span>` : '<span class="text-amber-700 font-medium">Pending acknowledgement</span>'}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          `;
        }

        container.appendChild(tabContent);

        renderShell({
          title: student.name,
          activeNav: 'students',
          actions: '<a href="#/students" class="btn btn-ghost btn-sm">&larr; Back to list</a>',
          content: container
        });

        const editBtn = document.getElementById('btn-edit-student');
        if (editBtn) {
          editBtn.addEventListener('click', () => openEditStudentModal(sid, student, batchMap, () => Principal.routes['/students/:sid']({ sid })));
        }

        const toggleStatusBtn = document.getElementById('btn-toggle-status');
        if (toggleStatusBtn) {
          toggleStatusBtn.addEventListener('click', async () => {
            const nextStatus = student.status === 'active' ? 'inactive' : 'active';
            if (confirm(`Are you sure you want to ${nextStatus === 'inactive' ? 'deactivate' : 'activate'} ${student.name}?`)) {
              await api(`students/${sid}`, {
                method: 'PATCH',
                body: { status: nextStatus }
              });
              toast(`Student marked as ${nextStatus}.`, 'info');
              Principal.routes['/students/:sid']({ sid });
            }
          });
        }

        const editFeeBtn = document.getElementById('btn-edit-fee');
        if (editFeeBtn) {
          editFeeBtn.addEventListener('click', () => openSetFeeModal(sid, fee, () => Principal.routes['/students/:sid']({ sid })));
        }

        const recordPayBtn = document.getElementById('btn-record-payment');
        if (recordPayBtn) {
          recordPayBtn.addEventListener('click', () => openRecordPaymentModal(sid, student, fee, () => Principal.routes['/students/:sid']({ sid })));
        }

        const composeWarningBtn = document.getElementById('btn-compose-student-warning');
        if (composeWarningBtn) {
          composeWarningBtn.addEventListener('click', () => openComposeWarningModal({ targetSid: sid, studentName: student.name }, () => Principal.routes['/students/:sid']({ sid })));
        }
      };

      renderView();
    } catch (err) {
      console.error(err);
      toast('Failed to load student details.', 'error');
    }
  };

  /**
   * Modal: Edit Student
   */
  function openEditStudentModal(sid, student, batches, onSaved) {
    const batchCheckboxesHtml = Object.entries(batches).map(([bid, b]) => {
      const isChecked = student.batchIds && student.batchIds[bid];
      return `
        <label class="flex items-center gap-2 text-xs py-1">
          <input type="checkbox" name="edit_batch_${esc(bid)}" value="${esc(bid)}" ${isChecked ? 'checked' : ''} class="rounded border-line text-brand">
          <span>${esc(b.name)}</span>
        </label>
      `;
    }).join('');

    const formHtml = `
      <form id="edit-student-form" class="space-y-3" novalidate>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Admission number</label>
            <input type="text" disabled class="input bg-paper text-xs uppercase" value="${esc(student.admissionNo)}" />
          </div>
          <div>
            <label class="label">Full name</label>
            <input type="text" id="edit-name" required class="input text-xs" value="${esc(student.name)}" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="label">Grade</label>
            <input type="text" id="edit-grade" required class="input text-xs" value="${esc(student.grade)}" />
          </div>
          <div>
            <label class="label">DOB</label>
            <input type="date" id="edit-dob" class="input text-xs" value="${esc(student.dob || '')}" />
          </div>
          <div>
            <label class="label">Gender</label>
            <select id="edit-gender" class="input text-xs bg-white">
              <option value="Male" ${student.gender === 'Male' ? 'selected' : ''}>Male</option>
              <option value="Female" ${student.gender === 'Female' ? 'selected' : ''}>Female</option>
              <option value="Other" ${student.gender === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Guardian name</label>
            <input type="text" id="edit-guardian-name" class="input text-xs" value="${esc(student.guardianName || '')}" />
          </div>
          <div>
            <label class="label">Guardian phone</label>
            <input type="tel" id="edit-guardian-phone" class="input text-xs" value="${esc(student.guardianPhone || '')}" />
          </div>
        </div>
        <div>
          <label class="label">School</label>
          <input type="text" id="edit-school" class="input text-xs" value="${esc(student.school || '')}" />
        </div>
        <div>
          <label class="label">Address</label>
          <input type="text" id="edit-address" class="input text-xs" value="${esc(student.address || '')}" />
        </div>
        <div>
          <label class="label">Assign Batches</label>
          <div class="card p-2.5 max-h-32 overflow-y-auto bg-paper/30">
            ${batchCheckboxesHtml}
          </div>
        </div>
        <div>
          <label class="label">Notes</label>
          <textarea id="edit-notes" rows="2" class="input text-xs">${esc(student.notes || '')}</textarea>
        </div>
      </form>
    `;

    openModal({
      title: `Edit ${student.name}`,
      content: formHtml,
      confirmText: 'Save changes',
      onConfirm: async () => {
        const batchIds = {};
        Object.keys(batches).forEach(bid => {
          const cb = document.querySelector(`input[name="edit_batch_${bid}"]`);
          if (cb && cb.checked) batchIds[bid] = true;
        });

        const patchData = {
          name: document.getElementById('edit-name').value.trim(),
          grade: document.getElementById('edit-grade').value.trim(),
          dob: document.getElementById('edit-dob').value || null,
          gender: document.getElementById('edit-gender').value,
          guardianName: document.getElementById('edit-guardian-name').value.trim(),
          guardianPhone: document.getElementById('edit-guardian-phone').value.trim(),
          school: document.getElementById('edit-school').value.trim() || null,
          address: document.getElementById('edit-address').value.trim() || null,
          notes: document.getElementById('edit-notes').value.trim() || null,
          batchIds
        };

        await api(`students/${sid}`, {
          method: 'PATCH',
          body: patchData
        });

        toast('Student record updated.', 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * Modal: Set / Update Student Fee
   */
  function openSetFeeModal(sid, currentFee, onSaved) {
    const curTotal = currentFee ? currentFee.total : '';
    const curDue = currentFee ? currentFee.dueDate : '';

    const formHtml = `
      <form class="space-y-3 text-xs" novalidate>
        <div>
          <label class="label">Total Fee Amount (INR) *</label>
          <input type="number" id="fee-total-input" min="0" step="100" class="input text-xs" value="${esc(curTotal)}" required />
        </div>
        <div>
          <label class="label">Due Date *</label>
          <input type="date" id="fee-due-input" class="input text-xs" value="${esc(curDue)}" required />
        </div>
      </form>
    `;

    openModal({
      title: 'Set Total Tuition Fee',
      content: formHtml,
      confirmText: 'Save fee',
      onConfirm: async () => {
        const total = Number(document.getElementById('fee-total-input').value);
        const dueDate = document.getElementById('fee-due-input').value;

        if (isNaN(total) || total < 0 || !dueDate) {
          toast('Please enter a valid fee amount and due date.', 'warning');
          throw new Error('Validation failed');
        }

        await api(`fees/${sid}`, {
          method: 'PATCH',
          body: { total, dueDate }
        });

        toast('Fee details saved.', 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * Modal: Record Payment & Generate Receipt
   */
  function openRecordPaymentModal(sid, student, currentFee, onSaved) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const formHtml = `
      <form id="record-payment-form" class="space-y-3 text-xs" novalidate>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Amount Paid (INR) *</label>
            <input type="number" id="pay-amount" min="1" step="50" class="input text-xs" required autofocus />
          </div>
          <div>
            <label class="label">Payment Date *</label>
            <input type="date" id="pay-date" class="input text-xs" value="${todayStr}" required />
          </div>
        </div>

        <div>
          <label class="label">Payment Mode *</label>
          <select id="pay-mode" class="input text-xs bg-white">
            <option value="Cash">Cash</option>
            <option value="UPI">UPI / GPay / PhonePe</option>
            <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>

        <div>
          <label class="label">Note / Reference (optional)</label>
          <input type="text" id="pay-note" class="input text-xs" placeholder="e.g. Transaction ID, Term 1 fee" />
        </div>
      </form>
    `;

    openModal({
      title: `Record Fee Payment - ${student.name}`,
      content: formHtml,
      confirmText: 'Generate Receipt',
      onConfirm: async () => {
        const amount = Number(document.getElementById('pay-amount').value);
        const date = document.getElementById('pay-date').value;
        const mode = document.getElementById('pay-mode').value;
        const note = document.getElementById('pay-note').value.trim();

        if (!amount || amount <= 0 || !date) {
          toast('Please enter a valid payment amount.', 'warning');
          throw new Error('Invalid payment amount');
        }

        const pid = 'p_' + Date.now();
        const yyyymm = date.replace(/-/g, '').slice(0, 6);
        const random4 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const receiptNo = `REC-${yyyymm}-${random4}`;

        const paymentRecord = {
          amount,
          date,
          mode,
          note: note || null,
          receiptNo
        };

        await api(`fees/${sid}/payments/${pid}`, {
          method: 'PUT',
          body: paymentRecord
        });

        toast(`Payment of ${formatCurrency(amount)} recorded. Receipt ${receiptNo}`, 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * Helper: Open Modal to Set or Adjust Total Fee Amount for a student
   */
  function openSetFeeModal(sid, student, currentFee, allStudents, onSaved) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const existingTotal = currentFee && currentFee.total ? Number(currentFee.total) : '';
    const existingDue = (currentFee && currentFee.dueDate) || todayStr;
    const existingDesc = (currentFee && currentFee.description) || 'Monthly Tuition Fee';

    const activeStudents = allStudents ? Object.entries(allStudents)
      .map(([id, s]) => ({ sid: id, ...s }))
      .filter(s => s.status === 'active') : [];

    const isFixedStudent = !!(sid && student);

    const studentSelectHtml = isFixedStudent ? `
      <div>
        <label class="label">Student</label>
        <div class="p-2.5 bg-paper rounded border border-line text-xs font-medium text-ink">
          ${esc(student.name)} <span class="text-stone-500 font-mono text-[11px]">(${esc(student.admissionNo || sid)})</span>
        </div>
        <input type="hidden" id="set-fee-sid" value="${esc(sid)}" />
      </div>
    ` : `
      <div>
        <label class="label">Select Student *</label>
        <select id="set-fee-sid" class="input text-xs bg-white" required>
          <option value="">-- Choose Student --</option>
          ${activeStudents.map(s => `
            <option value="${esc(s.sid)}" ${s.sid === sid ? 'selected' : ''}>
              ${esc(s.name)} (${esc(s.admissionNo || s.sid)} - Grade ${esc(s.grade || '\u2014')})
            </option>
          `).join('')}
        </select>
      </div>
    `;

    const formHtml = `
      <form id="set-fee-form" class="space-y-3.5 text-xs" novalidate>
        ${studentSelectHtml}

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Fee Total Amount (₹) *</label>
            <input type="number" id="set-fee-total" min="0" step="100" class="input text-xs" placeholder="e.g. 5000" value="${existingTotal}" required autofocus />
            <p class="text-[10px] text-stone-400 mt-1">Total charge for this period</p>
          </div>
          <div>
            <label class="label">Due Date *</label>
            <input type="date" id="set-fee-due" class="input text-xs" value="${existingDue}" required />
          </div>
        </div>

        <div>
          <label class="label">Fee Type / Description (optional)</label>
          <input type="text" id="set-fee-desc" class="input text-xs" placeholder="e.g. Monthly Tuition Fee, Term 1, Exam Fee" value="${esc(existingDesc)}" />
        </div>
      </form>
    `;

    openModal({
      title: isFixedStudent ? `Set Fee Amount - ${student.name}` : 'Assign / Set Fee Amount',
      content: formHtml,
      confirmText: 'Save Fee Amount',
      onConfirm: async () => {
        const targetSid = document.getElementById('set-fee-sid').value;
        const totalVal = Number(document.getElementById('set-fee-total').value);
        const dueVal = document.getElementById('set-fee-due').value;
        const descVal = document.getElementById('set-fee-desc').value.trim();

        if (!targetSid) {
          toast('Please select a student.', 'warning');
          throw new Error('Student required');
        }

        if (isNaN(totalVal) || totalVal < 0 || !dueVal) {
          toast('Please enter a valid fee amount and due date.', 'warning');
          throw new Error('Valid amount and date required');
        }

        const patchPayload = {
          total: totalVal,
          dueDate: dueVal,
          description: descVal || 'Tuition Fee',
          updatedAt: new Date().toISOString()
        };

        await api(`fees/${targetSid}`, {
          method: 'PATCH',
          body: patchPayload
        });

        const targetName = (student && student.name) || (allStudents && allStudents[targetSid] && allStudents[targetSid].name) || targetSid;
        toast(`Fee amount of ${formatCurrency(totalVal)} saved for ${targetName}.`, 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * 4. Batches Management
   */
  Principal.routes['/batches'] = async function () {
    renderShell({
      title: 'Batches',
      activeNav: 'batches',
      actions: '<button type="button" id="btn-add-batch" class="btn btn-primary btn-sm">+ Add batch</button>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading batches...</div>'
    });

    try {
      const [batches, teachers, students] = await Promise.all([
        api('batches'),
        api('teachers'),
        api('students')
      ]);

      const batchList = batches ? Object.entries(batches).map(([bid, b]) => ({ bid, ...b })) : [];
      const teacherMap = teachers || {};
      const studentMap = students || {};
      const studentList = Object.entries(studentMap).map(([sid, s]) => ({ sid, ...s }));

      batchList.forEach(b => {
        const count = studentList.filter(s => s.status === 'active' && s.batchIds && s.batchIds[b.bid]).length;
        b.enrolledCount = count;
      });

      const tableEl = renderTable({
        columns: [
          {
            header: 'Batch Name',
            key: 'name',
            className: 'font-medium',
            render: row => `
              <div>
                <span class="font-medium text-ink">${esc(row.name)}</span>
                <div class="text-[11px] text-stone-500">Grade ${esc(row.grade || '\u2014')} &bull; ${esc(row.subject || '\u2014')}</div>
              </div>
            `
          },
          {
            header: 'Teacher',
            key: 'teacher',
            render: row => {
              const t = teacherMap[row.teacherId];
              return t ? `<span class="text-xs font-medium">${esc(t.name)}</span>` : '<span class="text-stone-400">Unassigned</span>';
            }
          },
          {
            header: 'Schedule & Room',
            key: 'schedule',
            render: row => `
              <div class="text-xs">
                <div>${esc(row.schedule || '\u2014')}</div>
                <div class="text-[11px] text-stone-400">Room: ${esc(row.room || '\u2014')}</div>
              </div>
            `
          },
          {
            header: 'Enrolled',
            key: 'enrolled',
            className: 'tabular-nums',
            render: row => {
              const cap = row.capacity ? Number(row.capacity) : 0;
              const isFull = cap > 0 && row.enrolledCount >= cap;
              return `
                <div class="text-xs ${isFull ? 'text-red-700 font-semibold' : 'text-stone-700'}">
                  ${row.enrolledCount} / ${cap || '\u221E'}
                </div>
              `;
            }
          },
          {
            header: 'Batch Fee',
            key: 'fee',
            className: 'tabular-nums',
            render: row => formatCurrency(row.fee || 0)
          },
          {
            header: 'Actions',
            key: 'actions',
            className: 'w-44 text-right',
            render: row => `
              <div class="flex items-center justify-end gap-1.5">
                <button type="button" class="btn btn-sm manage-batch-students-btn" data-bid="${esc(row.bid)}">Students</button>
                <button type="button" class="btn btn-sm edit-batch-btn" data-bid="${esc(row.bid)}">Edit</button>
              </div>
            `
          }
        ],
        data: batchList,
        emptyMessage: 'No batches created yet. Click "+ Add batch" to create one.'
      });

      const container = h('div', { className: 'space-y-4' });
      container.appendChild(tableEl);

      renderShell({
        title: 'Batches',
        activeNav: 'batches',
        actions: '<button type="button" id="btn-add-batch" class="btn btn-primary btn-sm">+ Add batch</button>',
        content: container
      });

      const addBtn = document.getElementById('btn-add-batch');
      if (addBtn) {
        addBtn.addEventListener('click', () => openBatchModal(null, teacherMap, () => Principal.routes['/batches']()));
      }

      document.querySelectorAll('.edit-batch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const bid = btn.dataset.bid;
          const b = batches[bid];
          openBatchModal({ bid, ...b }, teacherMap, () => Principal.routes['/batches']());
        });
      });

      document.querySelectorAll('.manage-batch-students-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const bid = btn.dataset.bid;
          const b = batches[bid];
          openBatchStudentsManagerModal(bid, b, studentMap, () => Principal.routes['/batches']());
        });
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load batches.', 'error');
    }
  };

  /**
   * Modal: Move / Manage Students in a Batch
   */
  function openBatchStudentsManagerModal(bid, batch, allStudents, onSaved) {
    const studentList = Object.entries(allStudents).map(([sid, s]) => ({ sid, ...s }));
    const enrolled = studentList.filter(s => s.status === 'active' && s.batchIds && s.batchIds[bid]);
    const notEnrolled = studentList.filter(s => s.status === 'active' && (!s.batchIds || !s.batchIds[bid]));

    const formHtml = `
      <div class="space-y-4 text-xs">
        <div>
          <h4 class="font-medium text-ink mb-1">Currently Enrolled (${enrolled.length})</h4>
          <div class="card p-2 max-h-40 overflow-y-auto divide-y divide-line">
            ${enrolled.length === 0 ? '<p class="text-stone-400 py-2">No students currently in this batch.</p>' : enrolled.map(s => `
              <div class="py-1.5 flex items-center justify-between">
                <span>${esc(s.name)} (${esc(s.admissionNo)})</span>
                <button type="button" class="btn btn-sm btn-danger text-[10px] py-0.5 px-2 remove-student-batch-btn" data-sid="${esc(s.sid)}">Remove</button>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="pt-2 border-t border-line">
          <h4 class="font-medium text-ink mb-1.5">Add / Move Student to this Batch</h4>
          <div class="flex gap-2">
            <select id="enroll-student-select" class="input text-xs bg-white flex-1">
              <option value="">-- Choose student --</option>
              ${notEnrolled.map(s => `<option value="${esc(s.sid)}">${esc(s.name)} (${esc(s.admissionNo)} - Grade ${esc(s.grade)})</option>`).join('')}
            </select>
            <button type="button" id="btn-do-enroll" class="btn btn-primary btn-sm flex-shrink-0">Add to batch</button>
          </div>
        </div>
      </div>
    `;

    openModal({
      title: `Manage Enrolled Students: ${batch.name}`,
      content: formHtml,
      confirmText: 'Done',
      onConfirm: async () => {
        onSaved && onSaved();
      }
    });

    document.querySelectorAll('.remove-student-batch-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sid = btn.dataset.sid;
        await api(`students/${sid}/batchIds/${bid}`, {
          method: 'DELETE'
        });
        toast('Student removed from batch.', 'info');
        delete allStudents[sid].batchIds[bid];
        openBatchStudentsManagerModal(bid, batch, allStudents, onSaved);
      });
    });

    const enrollBtn = document.getElementById('btn-do-enroll');
    if (enrollBtn) {
      enrollBtn.addEventListener('click', async () => {
        const select = document.getElementById('enroll-student-select');
        const sid = select.value;
        if (!sid) return;

        await api(`students/${sid}/batchIds/${bid}`, {
          method: 'PUT',
          body: true
        });

        toast('Student enrolled in batch.', 'success');
        if (!allStudents[sid].batchIds) allStudents[sid].batchIds = {};
        allStudents[sid].batchIds[bid] = true;
        openBatchStudentsManagerModal(bid, batch, allStudents, onSaved);
      });
    }
  }

  /**
   * Modal: Add / Edit Batch
   */
  function openBatchModal(batch, teachers, onSaved) {
    const isEdit = !!batch;
    const teacherOptions = Object.entries(teachers).map(([tid, t]) => `
      <option value="${esc(tid)}" ${batch && batch.teacherId === tid ? 'selected' : ''}>${esc(t.name)} (${esc(t.subjects || 'General')})</option>
    `).join('');

    const formHtml = `
      <form id="batch-form" class="space-y-3 text-xs" novalidate>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Batch name *</label>
            <input type="text" id="b-name" class="input text-xs" required placeholder="e.g. Class 10 Science A" value="${esc(batch ? batch.name : '')}" />
          </div>
          <div>
            <label class="label">Grade / Class *</label>
            <input type="text" id="b-grade" class="input text-xs" required placeholder="10" value="${esc(batch ? batch.grade : '')}" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Subject *</label>
            <input type="text" id="b-subject" class="input text-xs" required placeholder="Physics & Chemistry" value="${esc(batch ? batch.subject : '')}" />
          </div>
          <div>
            <label class="label">Assigned Teacher</label>
            <select id="b-teacher" class="input text-xs bg-white">
              <option value="">-- Select Teacher --</option>
              ${teacherOptions}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="label">Schedule</label>
            <input type="text" id="b-schedule" class="input text-xs" placeholder="Mon, Wed, Fri 4-6 PM" value="${esc(batch ? batch.schedule : '')}" />
          </div>
          <div>
            <label class="label">Room</label>
            <input type="text" id="b-room" class="input text-xs" placeholder="Room 2B" value="${esc(batch ? batch.room : '')}" />
          </div>
          <div>
            <label class="label">Capacity</label>
            <input type="number" id="b-capacity" min="1" class="input text-xs" placeholder="25" value="${esc(batch ? batch.capacity : 25)}" />
          </div>
        </div>

        <div>
          <label class="label">Standard Fee (INR)</label>
          <input type="number" id="b-fee" min="0" step="100" class="input text-xs" placeholder="2500" value="${esc(batch ? batch.fee : '')}" />
        </div>
      </form>
    `;

    openModal({
      title: isEdit ? `Edit Batch: ${batch.name}` : 'Create New Batch',
      content: formHtml,
      confirmText: isEdit ? 'Save batch' : 'Create batch',
      onConfirm: async () => {
        const name = document.getElementById('b-name').value.trim();
        const grade = document.getElementById('b-grade').value.trim();
        const subject = document.getElementById('b-subject').value.trim();
        const teacherId = document.getElementById('b-teacher').value || null;
        const schedule = document.getElementById('b-schedule').value.trim() || null;
        const room = document.getElementById('b-room').value.trim() || null;
        const capacity = parseInt(document.getElementById('b-capacity').value, 10) || 25;
        const fee = Number(document.getElementById('b-fee').value) || 0;

        if (!name || !grade || !subject) {
          toast('Please enter batch name, grade, and subject.', 'warning');
          throw new Error('Validation failed');
        }

        const bid = isEdit ? batch.bid : 'b_' + Date.now();
        const payload = {
          name,
          grade,
          subject,
          teacherId,
          schedule,
          room,
          capacity,
          fee
        };

        await api(`batches/${bid}`, {
          method: isEdit ? 'PATCH' : 'PUT',
          body: payload
        });

        if (teacherId) {
          await api(`teachers/${teacherId}/batchIds/${bid}`, {
            method: 'PUT',
            body: true
          });
        }

        toast(`Batch "${name}" saved.`, 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * 5. Teachers Management
   */
  Principal.routes['/teachers'] = async function () {
    renderShell({
      title: 'Teachers',
      activeNav: 'teachers',
      actions: '<button type="button" id="btn-add-teacher" class="btn btn-primary btn-sm">+ Add teacher</button>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading teachers...</div>'
    });

    try {
      const [teachers, batches] = await Promise.all([
        api('teachers'),
        api('batches')
      ]);

      const teacherList = teachers ? Object.entries(teachers).map(([tid, t]) => ({ tid, ...t })) : [];
      const batchMap = batches || {};

      const tableEl = renderTable({
        columns: [
          {
            header: 'Teacher Name',
            key: 'name',
            className: 'font-medium',
            render: row => `
              <div>
                <span class="font-medium text-ink">${esc(row.name)}</span>
                ${row.disabled ? badge('Disabled', 'danger') : ''}
                <div class="text-[11px] text-stone-500">${esc(row.email)} &bull; ${esc(row.phone || 'No phone')}</div>
              </div>
            `
          },
          {
            header: 'Subjects',
            key: 'subjects',
            render: row => `<span class="text-xs">${esc(row.subjects || '\u2014')}</span>`
          },
          {
            header: 'Assigned Batches',
            key: 'batches',
            render: row => {
              const assigned = Object.values(batchMap).filter(b => b.teacherId === row.tid);
              if (assigned.length === 0) return '<span class="text-stone-400">None</span>';
              return assigned.map(b => `<span class="inline-block bg-paper px-1.5 py-0.5 rounded border border-line text-[11px] mr-1 mb-1">${esc(b.name)}</span>`).join('');
            }
          },
          {
            header: 'Actions',
            key: 'actions',
            className: 'w-32 text-right',
            render: row => `
              <div class="flex items-center justify-end gap-1.5">
                <button type="button" class="btn btn-sm edit-teacher-btn" data-tid="${esc(row.tid)}">Edit</button>
                <button type="button" class="btn btn-sm toggle-teacher-btn ${row.disabled ? 'btn-primary' : 'btn-danger'}" data-tid="${esc(row.tid)}" data-disabled="${!!row.disabled}">
                  ${row.disabled ? 'Enable' : 'Disable'}
                </button>
              </div>
            `
          }
        ],
        data: teacherList,
        emptyMessage: 'No teachers registered yet.'
      });

      const container = h('div', { className: 'space-y-4' });
      container.appendChild(tableEl);

      renderShell({
        title: 'Teachers',
        activeNav: 'teachers',
        actions: '<button type="button" id="btn-add-teacher" class="btn btn-primary btn-sm">+ Add teacher</button>',
        content: container
      });

      const addBtn = document.getElementById('btn-add-teacher');
      if (addBtn) {
        addBtn.addEventListener('click', () => openAddTeacherModal(batchMap, () => Principal.routes['/teachers']()));
      }

      document.querySelectorAll('.edit-teacher-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tid = btn.dataset.tid;
          openEditTeacherModal(tid, teachers[tid], batchMap, () => Principal.routes['/teachers']());
        });
      });

      document.querySelectorAll('.toggle-teacher-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tid = btn.dataset.tid;
          const isDisabled = btn.dataset.disabled === 'true';
          const nextDisabled = !isDisabled;
          await api(`teachers/${tid}`, {
            method: 'PATCH',
            body: { disabled: nextDisabled }
          });
          toast(`Teacher account ${nextDisabled ? 'disabled' : 'enabled'}.`, 'info');
          Principal.routes['/teachers']();
        });
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load teachers.', 'error');
    }
  };

  /**
   * Modal: Add Teacher
   */
  function openAddTeacherModal(batches, onSaved) {
    const batchCheckboxesHtml = Object.entries(batches).map(([bid, b]) => `
      <label class="flex items-center gap-2 text-xs py-1">
        <input type="checkbox" name="t_batch_${esc(bid)}" value="${esc(bid)}" class="rounded border-line text-brand">
        <span>${esc(b.name)}</span>
      </label>
    `).join('');

    const formHtml = `
      <form id="add-teacher-form" class="space-y-3 text-xs" novalidate>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Full name *</label>
            <input type="text" id="t-name" class="input text-xs" required placeholder="Teacher name" />
          </div>
          <div>
            <label class="label">Email address (login) *</label>
            <input type="email" id="t-email" class="input text-xs" required placeholder="teacher@centre.com" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Password *</label>
            <input type="password" id="t-pass" class="input text-xs" required placeholder="Min 6 characters" minlength="6" />
          </div>
          <div>
            <label class="label">Phone number</label>
            <input type="tel" id="t-phone" class="input text-xs" placeholder="Mobile phone" />
          </div>
        </div>

        <div>
          <label class="label">Subjects taught</label>
          <input type="text" id="t-subjects" class="input text-xs" placeholder="e.g. Mathematics, Physics" />
        </div>

        <div>
          <label class="label">Assign Batches</label>
          <div class="card p-2.5 max-h-32 overflow-y-auto bg-paper/30">
            ${batchCheckboxesHtml || '<span class="text-stone-400">No batches available.</span>'}
          </div>
        </div>

        <div id="add-teacher-error" class="hidden text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200"></div>
      </form>
    `;

    openModal({
      title: 'Add New Teacher',
      content: formHtml,
      confirmText: 'Create teacher',
      onConfirm: async () => {
        const errorEl = document.getElementById('add-teacher-error');
        errorEl.classList.add('hidden');

        const name = document.getElementById('t-name').value.trim();
        const email = document.getElementById('t-email').value.trim();
        const pass = document.getElementById('t-pass').value;
        const phone = document.getElementById('t-phone').value.trim();
        const subjects = document.getElementById('t-subjects').value.trim();

        if (!name || !email || !pass || pass.length < 6) {
          errorEl.textContent = 'Please provide full name, email, and password (at least 6 characters).';
          errorEl.classList.remove('hidden');
          throw new Error('Validation failed');
        }

        const batchIds = {};
        Object.keys(batches).forEach(bid => {
          const cb = document.querySelector(`input[name="t_batch_${bid}"]`);
          if (cb && cb.checked) batchIds[bid] = true;
        });

        let authResult;
        try {
          authResult = await signUpUser(email, pass);
        } catch (err) {
          errorEl.textContent = `Step 1 Failed: Could not create teacher auth account (${err.message}).`;
          errorEl.classList.remove('hidden');
          throw err;
        }

        const tid = authResult.uid;

        try {
          await api(`users/${authResult.uid}`, {
            method: 'PUT',
            body: {
              role: 'teacher',
              teacherId: tid,
              name
            }
          });
        } catch (err) {
          errorEl.textContent = `Step 2 Failed: Could not register user role (${err.message}).`;
          errorEl.classList.remove('hidden');
          throw err;
        }

        try {
          await api(`teachers/${tid}`, {
            method: 'PUT',
            body: {
              name,
              email,
              phone: phone || null,
              subjects: subjects || null,
              batchIds,
              disabled: false
            }
          });

          for (const bid of Object.keys(batchIds)) {
            await api(`batches/${bid}`, {
              method: 'PATCH',
              body: { teacherId: tid }
            });
          }
        } catch (err) {
          errorEl.textContent = `Step 3 Failed: Could not write teacher record (${err.message}).`;
          errorEl.classList.remove('hidden');
          throw err;
        }

        toast(`Teacher account for ${name} created.`, 'success');
        onSaved && onSaved();
      }
    });
  }

  function openEditTeacherModal(tid, teacher, batches, onSaved) {
    const formHtml = `
      <form class="space-y-3 text-xs" novalidate>
        <div>
          <label class="label">Teacher name</label>
          <input type="text" id="et-name" class="input text-xs" value="${esc(teacher.name)}" required />
        </div>
        <div>
          <label class="label">Phone number</label>
          <input type="tel" id="et-phone" class="input text-xs" value="${esc(teacher.phone || '')}" />
        </div>
        <div>
          <label class="label">Subjects</label>
          <input type="text" id="et-subjects" class="input text-xs" value="${esc(teacher.subjects || '')}" />
        </div>
      </form>
    `;

    openModal({
      title: `Edit ${teacher.name}`,
      content: formHtml,
      confirmText: 'Save',
      onConfirm: async () => {
        const name = document.getElementById('et-name').value.trim();
        const phone = document.getElementById('et-phone').value.trim();
        const subjects = document.getElementById('et-subjects').value.trim();

        await api(`teachers/${tid}`, {
          method: 'PATCH',
          body: {
            name,
            phone: phone || null,
            subjects: subjects || null
          }
        });

        await api(`users/${tid}`, {
          method: 'PATCH',
          body: { name }
        });

        toast('Teacher profile updated.', 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * 6. Fees Portal & Printable Receipt
   */
  Principal.routes['/fees'] = async function () {
    renderShell({
      title: 'Fee Management',
      activeNav: 'fees',
      content: '<div class="py-8 text-stone-500 text-xs">Loading fees...</div>'
    });

    try {
      const [students, fees] = await Promise.all([
        api('students'),
        api('fees')
      ]);

      const studentList = students ? Object.entries(students).map(([sid, s]) => ({ sid, ...s })) : [];
      const feeMap = fees || {};

      let totalCollected = 0;
      let totalOutstanding = 0;
      let overdueCount = 0;

      const feeRows = studentList.filter(s => s.status === 'active').map(s => {
        const f = feeMap[s.sid] || {};
        let paid = 0;
        if (f.payments) {
          Object.values(f.payments).forEach(p => { paid += Number(p.amount) || 0; });
        }
        totalCollected += paid;
        const total = Number(f.total) || 0;
        const balance = Math.max(0, total - paid);
        if (balance > 0) totalOutstanding += balance;
        const status = calcFeeStatus(total, paid, f.dueDate);
        if (status === 'overdue') overdueCount++;

        return {
          sid: s.sid,
          admissionNo: s.admissionNo,
          name: s.name,
          grade: s.grade,
          total,
          paid,
          balance,
          dueDate: f.dueDate,
          status,
          payments: f.payments
        };
      });

      const statsStripHtml = statStrip([
        { label: 'Total Collected', value: formatCurrency(totalCollected) },
        { label: 'Total Outstanding', value: formatCurrency(totalOutstanding) },
        { label: 'Overdue Students', value: overdueCount }
      ]);

      let feeFilter = 'all';

      const renderFeeTable = () => {
        const displayed = feeRows.filter(r => {
          if (feeFilter === 'all') return true;
          return r.status === feeFilter;
        });

        return renderTable({
          columns: [
            {
              header: 'Student',
              key: 'name',
              className: 'font-medium',
              render: row => `
                <div>
                  <a href="#/students/${esc(row.sid)}" class="font-medium text-ink hover:underline">${esc(row.name)}</a>
                  <div class="text-[11px] text-stone-500 font-mono">${esc(row.admissionNo)} &bull; Grade ${esc(row.grade)}</div>
                </div>
              `
            },
            {
              header: 'Total Fee',
              key: 'total',
              className: 'tabular-nums',
              render: row => formatCurrency(row.total)
            },
            {
              header: 'Paid',
              key: 'paid',
              className: 'tabular-nums text-emerald-700 font-medium',
              render: row => formatCurrency(row.paid)
            },
            {
              header: 'Balance',
              key: 'balance',
              className: 'tabular-nums text-red-700 font-semibold',
              render: row => formatCurrency(row.balance)
            },
            {
              header: 'Due Date',
              key: 'dueDate',
              render: row => formatDate(row.dueDate)
            },
            {
              header: 'Status',
              key: 'status',
              render: row => {
                const bMap = {
                  paid: badge('Paid', 'success'),
                  overdue: badge('Overdue', 'danger'),
                  partial: badge('Partial', 'warning'),
                  due: badge('Due', 'neutral')
                };
                return bMap[row.status] || badge(row.status, 'neutral');
              }
            },
            {
              header: 'Actions',
              key: 'actions',
              className: 'w-64 text-right',
              render: row => `
                <div class="flex items-center justify-end gap-1.5">
                  <button type="button" class="btn btn-sm edit-fee-btn" data-sid="${esc(row.sid)}">&#9998; Set Fee</button>
                  <button type="button" class="btn btn-sm btn-primary pay-fee-btn" data-sid="${esc(row.sid)}">+ Pay</button>
                  ${row.balance > 0 ? `<button type="button" class="btn btn-sm remind-fee-btn" data-sid="${esc(row.sid)}" data-name="${esc(row.name)}" data-bal="${row.balance}" data-due="${esc(row.dueDate)}">Reminder</button>` : ''}
                </div>
              `
            }
          ],
          data: displayed,
          emptyMessage: 'No students found in this fee category.'
        });
      };

      const container = h('div', { className: 'space-y-4' });
      container.innerHTML = statsStripHtml;

      const filterRow = h('div', { className: 'flex items-center gap-2 mb-2 text-xs' });
      ['all', 'overdue', 'due', 'partial', 'paid'].forEach(key => {
        const btn = h('button', {
          type: 'button',
          className: `px-3 py-1.5 rounded border border-line capitalize transition-colors ${feeFilter === key ? 'bg-brand text-white font-medium' : 'bg-white text-stone-600 hover:text-ink'}`,
          onClick: () => {
            feeFilter = key;
            tableContainer.innerHTML = '';
            tableContainer.appendChild(renderFeeTable());
            attachRowActions();
          }
        }, key);
        filterRow.appendChild(btn);
      });
      container.appendChild(filterRow);

      const tableContainer = h('div', null);
      tableContainer.appendChild(renderFeeTable());
      container.appendChild(tableContainer);

      renderShell({
        title: 'Fee Management',
        activeNav: 'fees',
        actions: '<button type="button" id="btn-add-fee-amount" class="btn btn-primary btn-sm">+ Assign / Set Fee Amount</button>',
        content: container
      });

      const addFeeBtn = document.getElementById('btn-add-fee-amount');
      if (addFeeBtn) {
        addFeeBtn.addEventListener('click', () => {
          openSetFeeModal(null, null, null, students, () => Principal.routes['/fees']());
        });
      }

      const attachRowActions = () => {
        document.querySelectorAll('.edit-fee-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const sid = btn.dataset.sid;
            const student = students[sid];
            const currentFee = feeMap[sid];
            openSetFeeModal(sid, student, currentFee, students, () => Principal.routes['/fees']());
          });
        });

        document.querySelectorAll('.pay-fee-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const sid = btn.dataset.sid;
            const student = students[sid];
            const currentFee = feeMap[sid];
            openRecordPaymentModal(sid, student, currentFee, () => Principal.routes['/fees']());
          });
        });

        document.querySelectorAll('.remind-fee-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const sid = btn.dataset.sid;
            const name = btn.dataset.name;
            const bal = btn.dataset.bal;
            const due = btn.dataset.due;

            const wid = 'w_' + Date.now();
            await api(`warnings/${sid}/${wid}`, {
              method: 'PUT',
              body: {
                type: 'fees',
                message: `Tuition fee reminder: Balance of ${formatCurrency(bal)} is due by ${formatDate(due)}. Please clear at the office.`,
                from: 'Principal',
                createdAt: new Date().toISOString()
              }
            });

            toast(`Fee reminder warning sent to ${name}.`, 'success');
          });
        });
      };

      attachRowActions();
    } catch (err) {
      console.error(err);
      toast('Failed to load fees.', 'error');
    }
  };

  /**
   * Printable Receipt View
   */
  Principal.routes['/fees/receipt/:sid/:pid'] = async function ({ sid, pid }) {
    renderShell({
      title: 'Fee Receipt',
      activeNav: 'fees',
      actions: `
        <button type="button" onclick="window.print()" class="btn btn-primary btn-sm no-print">Print Receipt</button>
        <a href="#/students/${esc(sid)}" class="btn btn-ghost btn-sm no-print">&larr; Back</a>
      `,
      content: '<div class="py-8 text-stone-500 text-xs">Loading receipt...</div>'
    });

    try {
      const [student, fee] = await Promise.all([
        api(`students/${sid}`),
        api(`fees/${sid}`)
      ]);

      const payment = fee && fee.payments && fee.payments[pid];
      if (!payment || !student) {
        toast('Receipt record not found.', 'error');
        Portal.router.navigate('#/fees');
        return;
      }

      let totalPaid = 0;
      Object.values(fee.payments).forEach(p => { totalPaid += Number(p.amount) || 0; });
      const totalFee = Number(fee.total) || 0;
      const remainingBalance = Math.max(0, totalFee - totalPaid);

      const centerName = (Portal.env && Portal.env.CENTER_NAME) || 'Apex Tuition Centre';

      const receiptEl = h('div', { className: 'card p-8 max-w-xl mx-auto bg-white text-ink' });
      receiptEl.innerHTML = `
        <div class="border-b border-line pb-4 mb-6 text-center">
          <h2 class="font-display text-2xl font-semibold tracking-tight">${esc(centerName)}</h2>
          <p class="text-xs text-stone-500 mt-0.5">Official Fee Payment Receipt</p>
        </div>

        <div class="flex justify-between items-start text-xs mb-6">
          <div>
            <div class="label">Receipt Number</div>
            <div class="font-mono font-semibold text-sm">${esc(payment.receiptNo || pid)}</div>
          </div>
          <div class="text-right">
            <div class="label">Payment Date</div>
            <div class="font-medium">${formatDate(payment.date)}</div>
          </div>
        </div>

        <div class="bg-paper p-4 rounded border border-line mb-6 text-xs grid grid-cols-2 gap-3">
          <div>
            <span class="text-stone-500">Student Name:</span>
            <div class="font-semibold text-ink">${esc(student.name)}</div>
          </div>
          <div>
            <span class="text-stone-500">Admission No:</span>
            <div class="font-mono font-semibold text-ink">${esc(student.admissionNo)}</div>
          </div>
          <div>
            <span class="text-stone-500">Grade / Class:</span>
            <div class="font-medium text-ink">${esc(student.grade)}</div>
          </div>
          <div>
            <span class="text-stone-500">Payment Mode:</span>
            <div class="font-medium text-ink">${esc(payment.mode || 'Cash')}</div>
          </div>
        </div>

        <div class="border-t border-b border-line py-4 mb-6">
          <div class="flex justify-between items-center text-sm font-semibold">
            <span>Amount Received:</span>
            <span class="text-base tabular-nums">${formatCurrency(payment.amount)}</span>
          </div>
          ${payment.note ? `<p class="text-[11px] text-stone-500 mt-1.5 italic">Note: ${esc(payment.note)}</p>` : ''}
        </div>

        <div class="text-xs space-y-1.5 mb-8 text-stone-600">
          <div class="flex justify-between">
            <span>Total Tuition Fee:</span>
            <span class="tabular-nums font-medium">${formatCurrency(totalFee)}</span>
          </div>
          <div class="flex justify-between">
            <span>Total Amount Paid to Date:</span>
            <span class="tabular-nums font-medium text-emerald-700">${formatCurrency(totalPaid)}</span>
          </div>
          <div class="flex justify-between font-semibold text-ink pt-1 border-t border-line">
            <span>Remaining Balance Due:</span>
            <span class="tabular-nums text-red-700">${formatCurrency(remainingBalance)}</span>
          </div>
        </div>

        <div class="pt-8 border-t border-line flex justify-between items-end text-[11px] text-stone-500">
          <div>
            <p>Generated on ${formatDate(new Date().toISOString())}</p>
            <p>Computer-generated receipt</p>
          </div>
          <div class="text-right">
            <div class="border-b border-stone-400 w-32 mb-1"></div>
            <span>Authorized Signature</span>
          </div>
        </div>
      `;

      renderShell({
        title: 'Fee Receipt',
        activeNav: 'fees',
        actions: `
          <button type="button" onclick="window.print()" class="btn btn-primary btn-sm no-print">Print Receipt</button>
          <a href="#/students/${esc(sid)}" class="btn btn-ghost btn-sm no-print">&larr; Back</a>
        `,
        content: receiptEl
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load receipt view.', 'error');
    }
  };

  /**
   * 7. Attendance Reports
   */
  Principal.routes['/attendance'] = async function () {
    renderShell({
      title: 'Attendance Management',
      activeNav: 'attendance',
      content: '<div class="py-8 text-stone-500 text-xs">Loading attendance...</div>'
    });

    try {
      const [students, batches, attendance] = await Promise.all([
        api('students'),
        api('batches'),
        api('attendance')
      ]);

      const studentList = students ? Object.entries(students).map(([sid, s]) => ({ sid, ...s })) : [];
      const batchMap = batches || {};
      const activeStudents = studentList.filter(s => s.status === 'active');
      const allAttendance = attendance || {};

      const activeBatches = batches
        ? Object.entries(batches)
            .filter(([, b]) => b.active !== false && b.status !== 'inactive')
            .map(([bid, b]) => ({ bid, ...b }))
        : [];

      let activeTab = 'mark';

      const container = h('div', { className: 'space-y-4' });

      // Tab switcher
      const tabBar = h('div', { className: 'flex items-center gap-2 border-b border-line pb-2 mb-2 text-xs' });
      tabBar.innerHTML = `
        <button type="button" id="tab-btn-mark" class="px-3.5 py-1.5 rounded text-xs font-medium transition-colors bg-brand text-white shadow-xs">
          Mark Attendance (Daily Register)
        </button>
        <button type="button" id="tab-btn-reports" class="px-3.5 py-1.5 rounded text-xs font-medium transition-colors bg-white text-stone-600 hover:text-ink border border-line">
          Attendance Reports & Summary
        </button>
      `;
      container.appendChild(tabBar);

      const tabContent = h('div', { id: 'attendance-tab-content' });
      container.appendChild(tabContent);

      renderShell({
        title: 'Attendance Management',
        activeNav: 'attendance',
        actions: `
          <div class="flex items-center gap-2">
            <button type="button" id="btn-export-att-excel" class="btn btn-sm btn-ghost border border-line bg-white hover:bg-paper">
              ${Shared.icon('assignments', 'w-4 h-4 text-emerald-700')} Export to Excel
            </button>
          </div>
        `,
        content: container
      });

      const exportBtn = document.getElementById('btn-export-att-excel');
      if (exportBtn) {
        exportBtn.onclick = () => {
          openModal({
            title: 'Export Attendance Report to Excel',
            content: `
              <div class="space-y-3 text-xs">
                <p class="text-stone-600">Select which attendance report you would like to export to Excel (.xlsx):</p>
                <div>
                  <label class="label">Select Batch / Scope</label>
                  <select id="export-batch-select" class="input text-xs bg-white">
                    <option value="all">All Batches (One Sheet per Batch)</option>
                    ${activeBatches.map(b => `<option value="${esc(b.bid)}">${esc(b.name)}</option>`).join('')}
                  </select>
                </div>
                <p class="text-[11px] text-stone-500">Each sheet will contain student roll numbers, names, day-by-day attendance codes (P, A, L, H), and overall percentage statistics.</p>
              </div>
            `,
            confirmText: 'Download Excel',
            onConfirm: async () => {
              const scope = document.getElementById('export-batch-select').value;
              if (scope === 'all') {
                Shared.downloadMultiBatchAttendanceExcel({
                  batches: batchMap,
                  students,
                  attendance: allAttendance
                });
              } else {
                const targetBatch = batchMap[scope];
                const batchStudents = activeStudents.filter(s => s.batchIds && s.batchIds[scope]);
                Shared.downloadAttendanceExcel({
                  batchName: targetBatch ? targetBatch.name : 'Batch',
                  batchId: scope,
                  students: batchStudents,
                  attendance: allAttendance
                });
              }
            }
          });
        };
      }

      // VIEW A: Interactive Attendance Marking
      const renderMarkView = () => {
        if (activeBatches.length === 0) {
          tabContent.innerHTML = '<div class="card p-6 text-center text-xs text-stone-500">No active batches available. Please create a batch in the Batches tab first.</div>';
          return;
        }

        let selectedBid = activeBatches[0].bid;
        const todayStr = new Date().toISOString().slice(0, 10);
        let selectedDate = todayStr;

        tabContent.innerHTML = `
          <div class="space-y-4">
            <div class="card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div class="flex flex-wrap items-center gap-3">
                <div>
                  <label class="label mb-1">Select Batch</label>
                  <select id="principal-att-batch" class="input text-xs py-1.5 px-3 bg-white max-w-[220px]">
                    ${activeBatches.map(b => `<option value="${esc(b.bid)}" ${b.bid === selectedBid ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="label mb-1">Date</label>
                  <input type="date" id="principal-att-date" class="input text-xs py-1.5 px-3" value="${selectedDate}" max="${todayStr}" />
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" id="principal-mark-all-p" class="btn btn-sm btn-ghost text-xs py-1.5 px-3 border border-line">Mark all P</button>
                <button type="button" id="principal-save-att" class="btn btn-primary text-xs py-2 px-4 font-medium">Save Attendance</button>
              </div>
            </div>

            <div id="principal-student-att-list" class="space-y-2"></div>
          </div>
        `;

        const listEl = document.getElementById('principal-student-att-list');

        const updateStudents = () => {
          const batchStudents = activeStudents.filter(s => s.batchIds && s.batchIds[selectedBid]);
          if (batchStudents.length === 0) {
            listEl.innerHTML = '<div class="card p-6 text-center text-xs text-stone-500">No active students enrolled in this batch.</div>';
            return;
          }

          const statusMap = {};
          batchStudents.forEach(s => {
            const rec = allAttendance[s.sid] && allAttendance[s.sid][selectedDate];
            statusMap[s.sid] = rec || 'P';
          });

          listEl.innerHTML = `
            <div class="card p-0 overflow-hidden">
              <div class="bg-paper px-4 py-2.5 border-b border-line flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>Student (${batchStudents.length} enrolled)</span>
                <span>Status for ${formatDate(selectedDate)}</span>
              </div>
              <div class="divide-y divide-line" id="principal-att-rows">
                ${batchStudents.map(s => {
                  const currentStatus = statusMap[s.sid] || 'P';
                  return `
                    <div class="p-3.5 flex items-center justify-between gap-3 text-xs p-att-row" data-sid="${esc(s.sid)}">
                      <div>
                        <div class="font-medium text-ink">${esc(s.name)}</div>
                        <div class="text-[11px] text-stone-500 font-mono">${esc(s.admissionNo)} &bull; Grade ${esc(s.grade || '\u2014')}</div>
                      </div>
                      <div class="flex items-center rounded border border-line p-0.5 bg-paper">
                        <button type="button" class="p-att-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors ${currentStatus === 'P' ? 'bg-emerald-700 text-white shadow-sm' : 'text-stone-600 hover:text-ink'}" data-val="P">
                          P
                        </button>
                        <button type="button" class="p-att-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors ${currentStatus === 'L' ? 'bg-amber-600 text-white shadow-sm' : 'text-stone-600 hover:text-ink'}" data-val="L">
                          L
                        </button>
                        <button type="button" class="p-att-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors ${currentStatus === 'A' ? 'bg-red-700 text-white shadow-sm' : 'text-stone-600 hover:text-ink'}" data-val="A">
                          A
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            <p class="text-[11px] text-stone-400 mt-2 px-1">P = Present, L = Late (counted as present in total attendance %), A = Absent.</p>
          `;

          document.querySelectorAll('.p-att-row').forEach(row => {
            const sid = row.dataset.sid;
            row.querySelectorAll('.p-att-btn').forEach(btn => {
              btn.addEventListener('click', () => {
                const val = btn.dataset.val;
                statusMap[sid] = val;
                row.querySelectorAll('.p-att-btn').forEach(b => {
                  b.className = 'p-att-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors text-stone-600 hover:text-ink';
                });
                if (val === 'P') btn.className = 'p-att-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors bg-emerald-700 text-white shadow-sm';
                if (val === 'L') btn.className = 'p-att-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors bg-amber-600 text-white shadow-sm';
                if (val === 'A') btn.className = 'p-att-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors bg-red-700 text-white shadow-sm';
              });
            });
          });

          const markAllBtn = document.getElementById('principal-mark-all-p');
          if (markAllBtn) {
            markAllBtn.onclick = () => {
              batchStudents.forEach(s => { statusMap[s.sid] = 'P'; });
              document.querySelectorAll('.p-att-row').forEach(row => {
                row.querySelectorAll('.p-att-btn').forEach(b => {
                  b.className = 'p-att-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors ' +
                    (b.dataset.val === 'P' ? 'bg-emerald-700 text-white shadow-sm' : 'text-stone-600 hover:text-ink');
                });
              });
              toast('Marked all as Present (P). Click Save to confirm.', 'info');
            };
          }

          const saveBtn = document.getElementById('principal-save-att');
          if (saveBtn) {
            saveBtn.onclick = async () => {
              saveBtn.disabled = true;
              saveBtn.textContent = 'Saving...';
              try {
                for (const [sid, statusVal] of Object.entries(statusMap)) {
                  await api(`attendance/${sid}/${selectedDate}`, {
                    method: 'PUT',
                    body: statusVal,
                    silent: true
                  });
                  if (!allAttendance[sid]) allAttendance[sid] = {};
                  allAttendance[sid][selectedDate] = statusVal;
                }
                toast(`Attendance saved for ${formatDate(selectedDate)}.`, 'success');
              } catch (err) {
                console.error(err);
                toast('Failed to save attendance.', 'error');
              } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Attendance';
              }
            };
          }
        };

        updateStudents();

        const bSelect = document.getElementById('principal-att-batch');
        if (bSelect) {
          bSelect.addEventListener('change', (e) => {
            selectedBid = e.target.value;
            updateStudents();
          });
        }

        const dInput = document.getElementById('principal-att-date');
        if (dInput) {
          dInput.addEventListener('change', (e) => {
            selectedDate = e.target.value;
            updateStudents();
          });
        }
      };

      // VIEW B: Attendance Reports
      const renderReportsView = () => {
        let overallMarked = 0, overallP = 0, overallL = 0;
        const rows = activeStudents.map(s => {
          const att = allAttendance && allAttendance[s.sid];
          const stats = calcAttendance(att);
          overallMarked += stats.total;
          overallP += stats.present;
          overallL += stats.late;

          return {
            sid: s.sid,
            name: s.name,
            admissionNo: s.admissionNo,
            grade: s.grade,
            batchIds: s.batchIds,
            ...stats
          };
        });

        const overallPct = overallMarked > 0 ? Math.round(((overallP + overallL) / overallMarked) * 1000) / 10 : 0;
        const lowAttCount = rows.filter(r => r.total >= 5 && r.percent < 75).length;

        const statsStripHtml = statStrip([
          { label: 'Overall Attendance', value: `${overallPct}%`, note: `${overallMarked} total entries` },
          { label: 'Students Below 75%', value: lowAttCount, note: 'Requires attention' },
          { label: 'Active Students', value: activeStudents.length }
        ]);

        const tableEl = renderTable({
          columns: [
            {
              header: 'Student',
              key: 'name',
              className: 'font-medium',
              render: row => `
                <div>
                  <a href="#/students/${esc(row.sid)}" class="font-medium text-ink hover:underline">${esc(row.name)}</a>
                  <div class="text-[11px] text-stone-500 font-mono">${esc(row.admissionNo)}</div>
                </div>
              `
            },
            {
              header: 'Grade',
              key: 'grade',
              className: 'w-20'
            },
            {
              header: 'Present',
              key: 'present',
              className: 'tabular-nums text-emerald-700 font-medium'
            },
            {
              header: 'Late',
              key: 'late',
              className: 'tabular-nums text-amber-700'
            },
            {
              header: 'Absent',
              key: 'absent',
              className: 'tabular-nums text-red-700 font-medium'
            },
            {
              header: 'Attendance %',
              key: 'percent',
              className: 'tabular-nums font-semibold',
              render: row => {
                const isLow = row.total >= 5 && row.percent < 75;
                return `<span class="${isLow ? 'text-red-700' : 'text-ink'}">${row.percent}%</span>`;
              }
            },
            {
              header: 'Action',
              key: 'action',
              className: 'w-32 text-right',
              render: row => {
                const isLow = row.total >= 5 && row.percent < 75;
                if (!isLow) return '\u2014';
                return `<button type="button" class="btn btn-sm warn-att-btn text-amber-700" data-sid="${esc(row.sid)}" data-name="${esc(row.name)}" data-pct="${row.percent}">Warn</button>`;
              }
            }
          ],
          data: rows,
          emptyMessage: 'No attendance records found.'
        });

        tabContent.innerHTML = statsStripHtml;
        tabContent.appendChild(tableEl);

        document.querySelectorAll('.warn-att-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const sid = btn.dataset.sid;
            const name = btn.dataset.name;
            const pct = btn.dataset.pct;

            const wid = 'w_' + Date.now();
            await api(`warnings/${sid}/${wid}`, {
              method: 'PUT',
              body: {
                type: 'attendance',
                message: `Attendance alert: Your attendance is currently ${pct}%, which is below the mandatory 75% requirement.`,
                from: 'Principal',
                createdAt: new Date().toISOString()
              }
            });

            toast(`Attendance warning issued to ${name}.`, 'success');
          });
        });
      };

      const btnMark = document.getElementById('tab-btn-mark');
      const btnReports = document.getElementById('tab-btn-reports');

      if (btnMark && btnReports) {
        btnMark.onclick = () => {
          activeTab = 'mark';
          btnMark.className = 'px-3.5 py-1.5 rounded text-xs font-medium transition-colors bg-brand text-white shadow-xs';
          btnReports.className = 'px-3.5 py-1.5 rounded text-xs font-medium transition-colors bg-white text-stone-600 hover:text-ink border border-line';
          renderMarkView();
        };

        btnReports.onclick = () => {
          activeTab = 'reports';
          btnReports.className = 'px-3.5 py-1.5 rounded text-xs font-medium transition-colors bg-brand text-white shadow-xs';
          btnMark.className = 'px-3.5 py-1.5 rounded text-xs font-medium transition-colors bg-white text-stone-600 hover:text-ink border border-line';
          renderReportsView();
        };
      }

      renderMarkView();
    } catch (err) {
      console.error(err);
      toast('Failed to load attendance report.', 'error');
    }
  };

  /**
   * 8. Assignments Overview
   */
  Principal.routes['/assignments'] = async function () {
    renderShell({
      title: 'Assignments Overview',
      activeNav: 'assignments',
      content: '<div class="py-8 text-stone-500 text-xs">Loading assignments...</div>'
    });

    try {
      const [assignments, batches, teachers, students, submissions] = await Promise.all([
        api('assignments'),
        api('batches'),
        api('teachers'),
        api('students'),
        api('submissions')
      ]);

      const assignList = assignments ? Object.entries(assignments).map(([aid, a]) => ({ aid, ...a })) : [];
      const batchMap = batches || {};
      const teacherMap = teachers || {};
      const studentList = students ? Object.values(students) : [];

      assignList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      const rows = assignList.map(a => {
        const batch = batchMap[a.batchId];
        const teacher = teacherMap[a.teacherId];
        const batchStudents = studentList.filter(s => s.status === 'active' && s.batchIds && s.batchIds[a.batchId]);

        let submitted = 0, approved = 0, rejected = 0;
        batchStudents.forEach(s => {
          const sub = submissions && submissions[s.admissionNo] && submissions[s.admissionNo][a.aid];
          if (sub) {
            if (sub.status === 'approved') approved++;
            else if (sub.status === 'rejected') rejected++;
            else if (sub.status === 'submitted') submitted++;
          }
        });
        const notSubmitted = Math.max(0, batchStudents.length - (submitted + approved + rejected));

        return {
          aid: a.aid,
          title: a.title,
          batchName: batch ? batch.name : a.batchId,
          teacherName: teacher ? teacher.name : '\u2014',
          dueDate: a.dueDate,
          maxMarks: a.maxMarks,
          submitted,
          approved,
          rejected,
          notSubmitted,
          totalStudents: batchStudents.length
        };
      });

      const tableEl = renderTable({
        columns: [
          {
            header: 'Assignment',
            key: 'title',
            className: 'font-medium',
            render: row => `
              <div>
                <span class="font-medium text-ink">${esc(row.title)}</span>
                <div class="text-[11px] text-stone-500">${esc(row.batchName)} &bull; ${esc(row.teacherName)}</div>
              </div>
            `
          },
          {
            header: 'Due Date',
            key: 'dueDate',
            render: row => formatDate(row.dueDate)
          },
          {
            header: 'Submitted',
            key: 'submitted',
            className: 'tabular-nums text-amber-700 font-medium'
          },
          {
            header: 'Approved',
            key: 'approved',
            className: 'tabular-nums text-emerald-700 font-medium'
          },
          {
            header: 'Rejected',
            key: 'rejected',
            className: 'tabular-nums text-red-700'
          },
          {
            header: 'Not Submitted',
            key: 'notSubmitted',
            className: 'tabular-nums text-stone-400'
          }
        ],
        data: rows,
        emptyMessage: 'No assignments created yet.'
      });

      const container = h('div', { className: 'space-y-4' });
      container.appendChild(tableEl);

      renderShell({
        title: 'Assignments Overview',
        activeNav: 'assignments',
        content: container
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load assignments.', 'error');
    }
  };

  /**
   * 9. Warnings Management & Compose
   */
  Principal.routes['/warnings'] = async function () {
    renderShell({
      title: 'Warnings',
      activeNav: 'warnings',
      actions: '<button type="button" id="btn-compose-warning" class="btn btn-primary btn-sm">+ Compose warning</button>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading warnings...</div>'
    });

    try {
      const [warnings, students, batches] = await Promise.all([
        api('warnings'),
        api('students'),
        api('batches')
      ]);

      const studentMap = students || {};
      const batchMap = batches || {};

      const warningRows = [];
      if (warnings) {
        Object.entries(warnings).forEach(([sid, studentWarnings]) => {
          const student = studentMap[sid];
          Object.entries(studentWarnings).forEach(([wid, w]) => {
            warningRows.push({
              sid,
              wid,
              studentName: student ? student.name : sid,
              admissionNo: student ? student.admissionNo : sid,
              ...w
            });
          });
        });
      }

      warningRows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      const tableEl = renderTable({
        columns: [
          {
            header: 'Student',
            key: 'student',
            className: 'font-medium',
            render: row => `
              <div>
                <a href="#/students/${esc(row.sid)}" class="font-medium text-ink hover:underline">${esc(row.studentName)}</a>
                <div class="text-[11px] text-stone-500 font-mono">${esc(row.admissionNo)}</div>
              </div>
            `
          },
          {
            header: 'Type',
            key: 'type',
            className: 'w-24 capitalize font-medium',
            render: row => {
              const b = row.type === 'attendance' ? badge('Attendance', 'warning') : (row.type === 'fees' ? badge('Fees', 'danger') : badge(row.type || 'Notice', 'neutral'));
              return b;
            }
          },
          {
            header: 'Message',
            key: 'message',
            render: row => `<div class="max-w-md text-xs leading-relaxed text-stone-700">${esc(row.message)}</div>`
          },
          {
            header: 'Issued Date',
            key: 'createdAt',
            render: row => formatDate(row.createdAt)
          },
          {
            header: 'Status',
            key: 'acknowledged',
            render: row => row.acknowledged ? badge('Acknowledged', 'success') : badge('Unread', 'warning')
          }
        ],
        data: warningRows,
        emptyMessage: 'No warnings have been issued.'
      });

      const container = h('div', { className: 'space-y-4' });
      container.appendChild(tableEl);

      renderShell({
        title: 'Warnings',
        activeNav: 'warnings',
        actions: '<button type="button" id="btn-compose-warning" class="btn btn-primary btn-sm">+ Compose warning</button>',
        content: container
      });

      const composeBtn = document.getElementById('btn-compose-warning');
      if (composeBtn) {
        composeBtn.addEventListener('click', () => openComposeWarningModal({ students: studentMap, batches: batchMap }, () => Principal.routes['/warnings']()));
      }
    } catch (err) {
      console.error(err);
      toast('Failed to load warnings.', 'error');
    }
  };

  /**
   * Modal: Compose Warning
   */
  function openComposeWarningModal(context, onSaved) {
    const isPreselectedStudent = !!context.targetSid;

    let targetHtml = '';
    if (isPreselectedStudent) {
      targetHtml = `
        <div>
          <label class="label">Recipient</label>
          <input type="text" disabled class="input bg-paper text-xs font-medium" value="${esc(context.studentName)} (${esc(context.targetSid)})" />
        </div>
      `;
    } else {
      const studentOptions = Object.entries(context.students || {}).filter(([, s]) => s.status === 'active').map(([sid, s]) => `
        <option value="student_${esc(sid)}">Student: ${esc(s.name)} (${esc(s.admissionNo)})</option>
      `).join('');

      const batchOptions = Object.entries(context.batches || {}).map(([bid, b]) => `
        <option value="batch_${esc(bid)}">Whole Batch: ${esc(b.name)}</option>
      `).join('');

      targetHtml = `
        <div>
          <label class="label">Target Audience *</label>
          <select id="w-target" class="input text-xs bg-white" required>
            <option value="all">Everyone (All active students)</option>
            <optgroup label="Batches">${batchOptions}</optgroup>
            <optgroup label="Individual Students">${studentOptions}</optgroup>
          </select>
        </div>
      `;
    }

    const formHtml = `
      <form id="compose-warning-form" class="space-y-3.5 text-xs" novalidate>
        ${targetHtml}

        <div>
          <label class="label">Warning Type *</label>
          <select id="w-type" class="input text-xs bg-white">
            <option value="general">General Notice</option>
            <option value="attendance">Attendance Warning</option>
            <option value="fees">Fee Payment Warning</option>
            <option value="behaviour">Behaviour Warning</option>
            <option value="assignment">Assignment Warning</option>
          </select>
        </div>

        <div>
          <label class="label">Warning Message *</label>
          <textarea id="w-msg" rows="3" required class="input text-xs" placeholder="Clearly state the issue and expected action..."></textarea>
        </div>
      </form>
    `;

    openModal({
      title: 'Compose Warning Notice',
      content: formHtml,
      confirmText: 'Send warning',
      onConfirm: async () => {
        const type = document.getElementById('w-type').value;
        const message = document.getElementById('w-msg').value.trim();

        if (!message) {
          toast('Please write a warning message.', 'warning');
          throw new Error('Message required');
        }

        const now = new Date().toISOString();
        const baseWarning = {
          type,
          message,
          from: 'Principal',
          createdAt: now,
          acknowledged: false
        };

        if (isPreselectedStudent) {
          const wid = 'w_' + Date.now();
          await api(`warnings/${context.targetSid}/${wid}`, {
            method: 'PUT',
            body: baseWarning
          });
        } else {
          const target = document.getElementById('w-target').value;
          const students = context.students || {};

          let targetSids = [];
          if (target === 'all') {
            targetSids = Object.entries(students).filter(([, s]) => s.status === 'active').map(([sid]) => sid);
          } else if (target.startsWith('batch_')) {
            const bid = target.replace('batch_', '');
            targetSids = Object.entries(students).filter(([, s]) => s.status === 'active' && s.batchIds && s.batchIds[bid]).map(([sid]) => sid);
          } else if (target.startsWith('student_')) {
            targetSids = [target.replace('student_', '')];
          }

          if (targetSids.length === 0) {
            toast('No matching students found.', 'warning');
            return;
          }

          toast(`Sending warning to ${targetSids.length} students...`, 'info');
          const batchTimestamp = Date.now();
          for (let i = 0; i < targetSids.length; i++) {
            const sid = targetSids[i];
            const wid = `w_${batchTimestamp}_${i}`;
            await api(`warnings/${sid}/${wid}`, {
              method: 'PUT',
              body: baseWarning,
              silent: true
            });
          }
        }

        toast('Warning(s) dispatched successfully.', 'success');
        onSaved && onSaved();
      }
    });
  }

  Portal.principal = Principal;
})();
