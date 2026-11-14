/**
 * Tuition Centre Management System - Teacher Portal
 * Plain ES2020, fast, focused, practical.
 */

(function () {
  'use strict';

  const {
    h, esc, formatCurrency, formatDate, formatDateTime, calcAttendance,
    calcFeeStatus, calcAssignmentState, toast, api, getSession
  } = Portal;
  const Shared = Portal.Shared;
  const { renderShell, statStrip, renderTable, filterBar, openModal, closeModal, badge, icon, uploadFile, downloadOrPreviewFile } = Shared;

  const Teacher = {
    routes: {},
    defaultRoute: '#/overview'
  };

  /**
   * Helper: Get teacher's assigned batches
   */
  async function getTeacherBatches(tid) {
    const [batches, teacherRecord] = await Promise.all([
      api('batches'),
      api(`teachers/${tid}`)
    ]);

    if (!batches) return [];

    const myBatchIds = new Set();
    if (teacherRecord && teacherRecord.batchIds) {
      Object.keys(teacherRecord.batchIds).forEach(id => myBatchIds.add(id));
    }
    Object.entries(batches).forEach(([bid, b]) => {
      if (b.teacherId === tid) myBatchIds.add(bid);
    });

    return Object.entries(batches)
      .filter(([bid]) => myBatchIds.has(bid))
      .map(([bid, b]) => ({ bid, ...b }));
  }

  /**
   * 1. Teacher Overview Dashboard
   */
  Teacher.routes['/overview'] = async function () {
    renderShell({
      title: 'Teacher Overview',
      activeNav: 'overview',
      actions: '<a href="#/attendance" class="btn btn-primary btn-sm">Mark Attendance &rarr;</a>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading teacher overview...</div>'
    });

    try {
      const session = getSession() || {};
      const tid = session.teacherId || session.uid;

      const [myBatches, students, submissions, assignments] = await Promise.all([
        getTeacherBatches(tid),
        api('students'),
        api('submissions'),
        api('assignments')
      ]);

      const myBatchIds = myBatches.map(b => b.bid);
      const studentList = students ? Object.values(students) : [];
      const myStudents = studentList.filter(s => s.status === 'active' && s.batchIds && Object.keys(s.batchIds).some(bid => myBatchIds.includes(bid)));

      const myAssignments = assignments ? Object.entries(assignments).filter(([, a]) => myBatchIds.includes(a.batchId)) : [];
      const myAssignMap = Object.fromEntries(myAssignments);

      let pendingReviews = [];
      if (submissions) {
        Object.entries(submissions).forEach(([sid, studentSubs]) => {
          const student = students && students[sid];
          Object.entries(studentSubs).forEach(([aid, sub]) => {
            if (myAssignMap[aid] && sub.status === 'submitted') {
              pendingReviews.push({
                sid,
                aid,
                studentName: student ? student.name : sid,
                assignTitle: myAssignMap[aid].title,
                submittedAt: sub.submittedAt,
                ...sub
              });
            }
          });
        });
      }

      pendingReviews.sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0));

      const statsStripHtml = statStrip([
        { label: 'My Batches', value: myBatches.length },
        { label: 'Active Students', value: myStudents.length },
        { label: 'Pending Reviews', value: pendingReviews.length, note: 'Oldest first in queue' }
      ]);

      const container = h('div', { className: 'space-y-6' });
      container.innerHTML = statsStripHtml;

      const grid = h('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' });

      // Left: Assigned Batches & Schedule
      const classesCard = h('div', { className: 'card p-5' });
      classesCard.innerHTML = `
        <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
          <h3 class="font-display text-base font-semibold text-ink">My Batches & Schedule</h3>
          <span class="text-[11px] text-stone-500">${myBatches.length} assigned</span>
        </div>
      `;

      const classesList = h('div', { className: 'space-y-3 text-xs' });
      if (myBatches.length === 0) {
        classesList.innerHTML = '<p class="text-stone-400 py-3">No batches assigned to your account yet.</p>';
      } else {
        myBatches.forEach(b => {
          const count = myStudents.filter(s => s.batchIds && s.batchIds[b.bid]).length;
          classesList.innerHTML += `
            <div class="py-2 border-b border-line/60 last:border-0 flex items-center justify-between gap-3">
              <div>
                <div class="font-medium text-ink">${esc(b.name)}</div>
                <div class="text-[11px] text-stone-500">${esc(b.schedule || 'Schedule not set')} &bull; Room: ${esc(b.room || '\u2014')}</div>
              </div>
              <div class="text-right flex-shrink-0">
                <span class="badge badge-neutral">${count} enrolled</span>
              </div>
            </div>
          `;
        });
      }
      classesCard.appendChild(classesList);
      grid.appendChild(classesCard);

      // Right: Urgent Submissions Waiting Review
      const reviewsCard = h('div', { className: 'card p-5' });
      reviewsCard.innerHTML = `
        <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
          <h3 class="font-display text-base font-semibold text-ink">Pending Review Queue</h3>
          <a href="#/review" class="text-xs text-brand font-medium hover:underline">View queue &rarr;</a>
        </div>
      `;

      const reviewsList = h('div', { className: 'space-y-3 text-xs' });
      if (pendingReviews.length === 0) {
        reviewsList.innerHTML = '<p class="text-stone-400 py-3">No submissions waiting for review. You are caught up.</p>';
      } else {
        pendingReviews.slice(0, 5).forEach(sub => {
          reviewsList.innerHTML += `
            <div class="py-2 border-b border-line/60 last:border-0 flex items-center justify-between gap-2">
              <div>
                <span class="font-medium text-ink">${esc(sub.studentName)}</span>
                <div class="text-[11px] text-stone-500 truncate">${esc(sub.assignTitle)}</div>
              </div>
              <div class="text-right flex-shrink-0">
                <span class="text-[10px] text-stone-400 block">${formatDate(sub.submittedAt)}</span>
                <a href="#/review" class="text-xs text-brand font-medium hover:underline">Review</a>
              </div>
            </div>
          `;
        });
      }
      reviewsCard.appendChild(reviewsList);
      grid.appendChild(reviewsCard);

      container.appendChild(grid);

      renderShell({
        title: 'Teacher Overview',
        activeNav: 'overview',
        content: container
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load teacher dashboard.', 'error');
    }
  };

  /**
   * 2. Attendance Marking & Past-Days Editor
   */
  Teacher.routes['/attendance'] = async function () {
    renderShell({
      title: 'Mark Attendance',
      activeNav: 'attendance',
      content: '<div class="py-8 text-stone-500 text-xs">Loading batches...</div>'
    });

    try {
      const session = getSession() || {};
      const tid = session.teacherId || session.uid;

      const [allBatchesData, students, allAttendance] = await Promise.all([
        api('batches'),
        api('students'),
        api('attendance')
      ]);

      const availableBatches = allBatchesData
        ? Object.entries(allBatchesData)
            .filter(([, b]) => b.active !== false && b.status !== 'inactive')
            .map(([bid, b]) => ({ bid, ...b }))
        : [];

      if (availableBatches.length === 0) {
        renderShell({
          title: 'Mark Attendance',
          activeNav: 'attendance',
          content: '<div class="card p-6 text-center text-xs text-stone-500">No active batches available. Please create a batch in the Principal portal first.</div>'
        });
        return;
      }

      let selectedBid = availableBatches[0].bid;
      const todayStr = new Date().toISOString().slice(0, 10);
      let selectedDate = todayStr;

      const container = h('div', { className: 'space-y-4' });

      const selectorCard = h('div', { className: 'card p-4 flex flex-wrap items-center justify-between gap-3 text-xs' });
      selectorCard.innerHTML = `
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <label class="label mb-1">Batch</label>
            <select id="att-batch-select" class="input text-xs py-1.5 px-3 bg-white max-w-[200px]">
              ${availableBatches.map(b => `<option value="${esc(b.bid)}" ${b.bid === selectedBid ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label mb-1">Date</label>
            <input type="date" id="att-date-input" class="input text-xs py-1.5 px-3" value="${selectedDate}" max="${todayStr}" />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" id="mark-all-p-btn" class="btn btn-sm btn-ghost text-xs py-1.5 px-3 border border-line">Mark all P</button>
          <button type="button" id="save-attendance-btn" class="btn btn-primary text-xs py-2 px-4 font-medium">Save Attendance</button>
        </div>
      `;
      container.appendChild(selectorCard);

      const listContainer = h('div', { id: 'attendance-student-list', className: 'space-y-2' });
      container.appendChild(listContainer);

      const renderStudentList = () => {
        const studentList = students ? Object.entries(students).map(([sid, s]) => ({ sid, ...s })) : [];
        const batchStudents = studentList.filter(s => s.status === 'active' && s.batchIds && s.batchIds[selectedBid]);

        if (batchStudents.length === 0) {
          listContainer.innerHTML = '<div class="card p-6 text-center text-xs text-stone-500">No active students enrolled in this batch.</div>';
          return;
        }

        const statusMap = {};
        batchStudents.forEach(s => {
          const rec = allAttendance && allAttendance[s.sid] && allAttendance[s.sid][selectedDate];
          statusMap[s.sid] = rec || 'P';
        });

        listContainer.innerHTML = `
          <div class="card p-0 overflow-hidden">
            <div class="bg-paper px-4 py-2.5 border-b border-line flex items-center justify-between text-xs text-stone-500 font-medium">
              <span>Student (${batchStudents.length} enrolled)</span>
              <span>Status for ${formatDate(selectedDate)}</span>
            </div>
            <div class="divide-y divide-line" id="student-att-rows">
              ${batchStudents.map(s => {
                const currentStatus = statusMap[s.sid] || 'P';
                return `
                  <div class="p-3.5 flex items-center justify-between gap-3 text-xs student-att-row" data-sid="${esc(s.sid)}">
                    <div>
                      <div class="font-medium text-ink">${esc(s.name)}</div>
                      <div class="text-[11px] text-stone-500 font-mono">${esc(s.admissionNo)}</div>
                    </div>
                    <div class="flex items-center rounded border border-line p-0.5 bg-paper" data-sid="${esc(s.sid)}">
                      <button type="button" class="att-status-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors ${currentStatus === 'P' ? 'bg-emerald-700 text-white shadow-sm' : 'text-stone-600 hover:text-ink'}" data-val="P">
                        P
                      </button>
                      <button type="button" class="att-status-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors ${currentStatus === 'L' ? 'bg-amber-600 text-white shadow-sm' : 'text-stone-600 hover:text-ink'}" data-val="L">
                        L
                      </button>
                      <button type="button" class="att-status-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors ${currentStatus === 'A' ? 'bg-red-700 text-white shadow-sm' : 'text-stone-600 hover:text-ink'}" data-val="A">
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

        document.querySelectorAll('.student-att-row').forEach(row => {
          const sid = row.dataset.sid;
          row.querySelectorAll('.att-status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const val = btn.dataset.val;
              statusMap[sid] = val;

              row.querySelectorAll('.att-status-btn').forEach(b => {
                b.className = 'att-status-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors text-stone-600 hover:text-ink';
              });
              if (val === 'P') btn.className = 'att-status-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors bg-emerald-700 text-white shadow-sm';
              if (val === 'L') btn.className = 'att-status-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors bg-amber-600 text-white shadow-sm';
              if (val === 'A') btn.className = 'att-status-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors bg-red-700 text-white shadow-sm';
            });
          });
        });

        const markAllBtn = document.getElementById('mark-all-p-btn');
        if (markAllBtn) {
          markAllBtn.onclick = () => {
            batchStudents.forEach(s => {
              statusMap[s.sid] = 'P';
            });
            document.querySelectorAll('.student-att-row').forEach(row => {
              row.querySelectorAll('.att-status-btn').forEach(b => {
                b.className = 'att-status-btn px-3 py-1.5 rounded text-xs font-semibold transition-colors ' +
                  (b.dataset.val === 'P' ? 'bg-emerald-700 text-white shadow-sm' : 'text-stone-600 hover:text-ink');
              });
            });
            toast('Marked all as Present (P). Click Save to confirm.', 'info');
          };
        }

        const saveBtn = document.getElementById('save-attendance-btn');
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

      renderShell({
        title: 'Mark Attendance',
        activeNav: 'attendance',
        actions: `
          <div class="flex items-center gap-2">
            <button type="button" id="btn-teacher-export-att-excel" class="btn btn-sm btn-ghost border border-line bg-white hover:bg-paper">
              ${Shared.icon('assignments', 'w-4 h-4 text-emerald-700')} Export to Excel
            </button>
          </div>
        `,
        content: container
      });

      const expBtn = document.getElementById('btn-teacher-export-att-excel');
      if (expBtn) {
        expBtn.onclick = () => {
          openModal({
            title: 'Export Attendance Report to Excel',
            content: `
              <div class="space-y-3 text-xs">
                <p class="text-stone-600">Select which batch attendance report you would like to export to Excel (.xlsx):</p>
                <div>
                  <label class="label">Select Batch</label>
                  <select id="teacher-export-batch-select" class="input text-xs bg-white">
                    <option value="all">All Batches (One Sheet per Batch)</option>
                    ${availableBatches.map(b => `<option value="${esc(b.bid)}" ${b.bid === selectedBid ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
                  </select>
                </div>
                <p class="text-[11px] text-stone-500">Includes student admission numbers, names, day-by-day attendance records, and overall percentages.</p>
              </div>
            `,
            confirmText: 'Download Excel',
            onConfirm: async () => {
              const scope = document.getElementById('teacher-export-batch-select').value;
              const batchMap = Object.fromEntries(availableBatches.map(b => [b.bid, b]));
              if (scope === 'all') {
                Shared.downloadMultiBatchAttendanceExcel({
                  batches: batchMap,
                  students,
                  attendance: allAttendance
                });
              } else {
                const targetBatch = batchMap[scope];
                const studentList = Object.entries(students || {}).map(([sid, s]) => ({ sid, ...s }));
                const batchStudents = studentList.filter(s => s.status === 'active' && s.batchIds && s.batchIds[scope]);
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

      renderStudentList();

      document.getElementById('att-batch-select').addEventListener('change', (e) => {
        selectedBid = e.target.value;
        renderStudentList();
      });

      document.getElementById('att-date-input').addEventListener('change', (e) => {
        selectedDate = e.target.value;
        renderStudentList();
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load attendance view.', 'error');
    }
  };

  /**
   * 3. Assignments List & Creator
   */
  Teacher.routes['/assignments'] = async function () {
    renderShell({
      title: 'Batch Assignments',
      activeNav: 'assignments',
      actions: '<button type="button" id="btn-create-assign" class="btn btn-primary btn-sm">+ Create assignment</button>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading assignments...</div>'
    });

    try {
      const session = getSession() || {};
      const tid = session.teacherId || session.uid;

      const [myBatches, assignments, submissions, students] = await Promise.all([
        getTeacherBatches(tid),
        api('assignments'),
        api('submissions'),
        api('students')
      ]);

      const myBatchIds = myBatches.map(b => b.bid);
      const batchMap = Object.fromEntries(myBatches.map(b => [b.bid, b]));
      const studentList = students ? Object.values(students) : [];

      const myAssignList = assignments ? Object.entries(assignments).filter(([, a]) => myBatchIds.includes(a.batchId)).map(([aid, a]) => ({ aid, ...a })) : [];
      myAssignList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      const rows = myAssignList.map(a => {
        const batch = batchMap[a.batchId];
        const enrolled = studentList.filter(s => s.status === 'active' && s.batchIds && s.batchIds[a.batchId]);

        let submitted = 0, approved = 0, rejected = 0;
        enrolled.forEach(s => {
          const sub = submissions && submissions[s.admissionNo] && submissions[s.admissionNo][a.aid];
          if (sub) {
            if (sub.status === 'approved') approved++;
            else if (sub.status === 'rejected') rejected++;
            else if (sub.status === 'submitted') submitted++;
          }
        });

        return {
          aid: a.aid,
          title: a.title,
          batchName: batch ? batch.name : a.batchId,
          dueDate: a.dueDate,
          maxMarks: a.maxMarks,
          submitted,
          approved,
          rejected,
          notSubmitted: Math.max(0, enrolled.length - (submitted + approved + rejected)),
          fileId: a.fileId
        };
      });

      const tableEl = renderTable({
        columns: [
          {
            header: 'Assignment Title',
            key: 'title',
            className: 'font-medium',
            render: row => `
              <div>
                <a href="#/assignments/${esc(row.aid)}" class="font-medium text-ink hover:underline">${esc(row.title)}</a>
                <div class="text-[11px] text-stone-500">${esc(row.batchName)} &bull; Max Marks: ${esc(row.maxMarks || '\u2014')}</div>
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
            header: 'Attachment',
            key: 'file',
            render: row => row.fileId ? `<button type="button" class="text-brand hover:underline view-file-btn" data-fid="${esc(row.fileId)}">View file</button>` : '<span class="text-stone-400">None</span>'
          },
          {
            header: 'Action',
            key: 'action',
            className: 'w-24 text-right',
            render: row => `<a href="#/assignments/${esc(row.aid)}" class="btn btn-sm">Submissions</a>`
          }
        ],
        data: rows,
        emptyMessage: 'No assignments created yet.'
      });

      const container = h('div', { className: 'space-y-4' });
      container.appendChild(tableEl);

      renderShell({
        title: 'Batch Assignments',
        activeNav: 'assignments',
        actions: '<button type="button" id="btn-create-assign" class="btn btn-primary btn-sm">+ Create assignment</button>',
        content: container
      });

      document.querySelectorAll('.view-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          downloadOrPreviewFile(btn.dataset.fid);
        });
      });

      const createBtn = document.getElementById('btn-create-assign');
      if (createBtn) {
        createBtn.addEventListener('click', () => openCreateAssignmentModal(myBatches, tid, () => Teacher.routes['/assignments']()));
      }
    } catch (err) {
      console.error(err);
      toast('Failed to load assignments.', 'error');
    }
  };

  /**
   * Modal: Create Assignment with Optional Attachment
   */
  function openCreateAssignmentModal(batches, tid, onSaved) {
    const batchOptions = batches.map(b => `<option value="${esc(b.bid)}">${esc(b.name)}</option>`).join('');

    const formHtml = `
      <form id="create-assign-form" class="space-y-3.5 text-xs" novalidate>
        <div>
          <label class="label">Assignment Title *</label>
          <input type="text" id="asg-title" class="input text-xs" required placeholder="e.g. Chapter 4 Practice Problems" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Batch *</label>
            <select id="asg-batch" class="input text-xs bg-white" required>
              ${batchOptions}
            </select>
          </div>
          <div>
            <label class="label">Due Date *</label>
            <input type="date" id="asg-due" class="input text-xs" required />
          </div>
        </div>

        <div>
          <label class="label">Maximum Marks (optional)</label>
          <input type="number" id="asg-marks" min="1" max="100" class="input text-xs" placeholder="e.g. 20" />
        </div>

        <div>
          <label class="label">Instructions / Description</label>
          <textarea id="asg-desc" rows="3" class="input text-xs" placeholder="Provide details, problem numbers, or guidelines..."></textarea>
        </div>

        <div>
          <label class="label">Attachment (PDF or image, max ${(Portal.env && Portal.env.MAX_UPLOAD_KB) || 1500} KB)</label>
          <input type="file" id="asg-file" class="text-xs" accept=".pdf,image/*" />
        </div>
      </form>
    `;

    openModal({
      title: 'Create Assignment',
      content: formHtml,
      confirmText: 'Publish assignment',
      onConfirm: async () => {
        const title = document.getElementById('asg-title').value.trim();
        const batchId = document.getElementById('asg-batch').value;
        const dueDate = document.getElementById('asg-due').value;
        const maxMarks = parseInt(document.getElementById('asg-marks').value, 10) || null;
        const description = document.getElementById('asg-desc').value.trim() || null;
        const fileInput = document.getElementById('asg-file');

        if (!title || !batchId || !dueDate) {
          toast('Please enter title, batch, and due date.', 'warning');
          throw new Error('Validation failed');
        }

        let fileId = null;
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
          toast('Uploading attachment...', 'info', 2000);
          const uploadRes = await uploadFile(fileInput);
          if (uploadRes) fileId = uploadRes.fileId;
        }

        const aid = 'a_' + Date.now();
        const assignmentData = {
          title,
          description,
          batchId,
          teacherId: tid,
          dueDate,
          maxMarks,
          fileId,
          createdAt: new Date().toISOString()
        };

        await api(`assignments/${aid}`, {
          method: 'PUT',
          body: assignmentData
        });

        toast(`Assignment "${title}" published.`, 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * 4. Assignment Detail View & Batch Submissions Table
   */
  Teacher.routes['/assignments/:aid'] = async function ({ aid }) {
    renderShell({
      title: 'Assignment Submissions',
      activeNav: 'assignments',
      actions: '<a href="#/assignments" class="btn btn-ghost btn-sm">&larr; Back to assignments</a>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading assignment submissions...</div>'
    });

    try {
      const [assignment, batches, students, submissions] = await Promise.all([
        api(`assignments/${aid}`),
        api('batches'),
        api('students'),
        api('submissions')
      ]);

      if (!assignment) {
        toast('Assignment not found.', 'error');
        Portal.router.navigate('#/assignments');
        return;
      }

      const batch = batches && batches[assignment.batchId];
      const studentList = students ? Object.values(students) : [];
      const batchStudents = studentList.filter(s => s.status === 'active' && s.batchIds && s.batchIds[assignment.batchId]);

      const container = h('div', { className: 'space-y-6' });

      const headerCard = h('div', { className: 'card p-5 text-xs' });
      headerCard.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line mb-3">
          <div>
            <h3 class="font-display text-xl font-semibold text-ink">${esc(assignment.title)}</h3>
            <p class="text-stone-500 mt-0.5">${esc(batch ? batch.name : assignment.batchId)} &bull; Due: ${formatDate(assignment.dueDate)}</p>
          </div>
          <div class="flex items-center gap-2">
            ${assignment.fileId ? `<button type="button" class="btn btn-sm view-file-btn" data-fid="${esc(assignment.fileId)}">View attachment</button>` : ''}
          </div>
        </div>
        ${assignment.description ? `<p class="text-stone-700 leading-relaxed">${esc(assignment.description)}</p>` : ''}
      `;
      container.appendChild(headerCard);

      const submissionRows = batchStudents.map(s => {
        const sub = submissions && submissions[s.admissionNo] && submissions[s.admissionNo][aid];
        const state = calcAssignmentState(assignment, sub);

        return {
          sid: s.admissionNo,
          studentName: s.name,
          admissionNo: s.admissionNo,
          state,
          submittedAt: sub ? sub.submittedAt : null,
          marks: sub ? sub.marks : null,
          fileId: sub ? sub.fileId : null,
          sub
        };
      });

      const tableEl = renderTable({
        columns: [
          {
            header: 'Student',
            key: 'studentName',
            className: 'font-medium',
            render: row => `
              <div>
                <span class="font-medium text-ink">${esc(row.studentName)}</span>
                <span class="font-mono text-[11px] text-stone-500 ml-1">(${esc(row.admissionNo)})</span>
              </div>
            `
          },
          {
            header: 'Status',
            key: 'state',
            render: row => {
              const b = row.state === 'approved' ? badge('Approved', 'success') : (row.state === 'rejected' ? badge('Rejected', 'danger') : (row.state === 'submitted' ? badge('Submitted', 'warning') : badge('Not submitted', 'neutral')));
              return b;
            }
          },
          {
            header: 'Submitted On',
            key: 'submittedAt',
            render: row => formatDate(row.submittedAt)
          },
          {
            header: 'Marks',
            key: 'marks',
            className: 'tabular-nums',
            render: row => row.marks !== undefined && row.marks !== null ? `${row.marks} / ${assignment.maxMarks || '\u2014'}` : '\u2014'
          },
          {
            header: 'File',
            key: 'file',
            render: row => row.fileId ? `<button type="button" class="text-brand hover:underline view-file-btn" data-fid="${esc(row.fileId)}">Preview file</button>` : '\u2014'
          },
          {
            header: 'Action',
            key: 'action',
            className: 'w-24 text-right',
            render: row => {
              if (row.sub && (row.state === 'submitted' || row.state === 'rejected')) {
                return `<button type="button" class="btn btn-sm review-direct-btn" data-sid="${esc(row.sid)}">Review</button>`;
              }
              return '\u2014';
            }
          }
        ],
        data: submissionRows,
        emptyMessage: 'No students enrolled in this batch.'
      });

      container.appendChild(tableEl);

      renderShell({
        title: 'Assignment Submissions',
        activeNav: 'assignments',
        actions: '<a href="#/assignments" class="btn btn-ghost btn-sm">&larr; Back to assignments</a>',
        content: container
      });

      document.querySelectorAll('.view-file-btn').forEach(btn => {
        btn.addEventListener('click', () => downloadOrPreviewFile(btn.dataset.fid));
      });

      document.querySelectorAll('.review-direct-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sid = btn.dataset.sid;
          const sub = submissions[sid][aid];
          const student = students[sid];
          openReviewSubmissionModal({
            sid,
            aid,
            studentName: student ? student.name : sid,
            assignTitle: assignment.title,
            maxMarks: assignment.maxMarks,
            ...sub
          }, () => Teacher.routes['/assignments/:aid']({ aid }));
        });
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load assignment details.', 'error');
    }
  };

  /**
   * 5. Review Queue (Oldest first)
   */
  Teacher.routes['/review'] = async function () {
    renderShell({
      title: 'Review Queue',
      activeNav: 'review',
      content: '<div class="py-8 text-stone-500 text-xs">Loading review queue...</div>'
    });

    try {
      const session = getSession() || {};
      const tid = session.teacherId || session.uid;

      const [myBatches, assignments, submissions, students] = await Promise.all([
        getTeacherBatches(tid),
        api('assignments'),
        api('submissions'),
        api('students')
      ]);

      const myBatchIds = myBatches.map(b => b.bid);
      const myAssignments = assignments ? Object.entries(assignments).filter(([, a]) => myBatchIds.includes(a.batchId)) : [];
      const assignMap = Object.fromEntries(myAssignments);

      const queue = [];
      if (submissions) {
        Object.entries(submissions).forEach(([sid, studentSubs]) => {
          const student = students && students[sid];
          Object.entries(studentSubs).forEach(([aid, sub]) => {
            if (assignMap[aid] && sub.status === 'submitted') {
              queue.push({
                sid,
                aid,
                studentName: student ? student.name : sid,
                admissionNo: student ? student.admissionNo : sid,
                assignTitle: assignMap[aid].title,
                maxMarks: assignMap[aid].maxMarks,
                submittedAt: sub.submittedAt,
                ...sub
              });
            }
          });
        });
      }

      queue.sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0));

      const statsStripHtml = statStrip([
        { label: 'Awaiting Review', value: queue.length, note: 'Sorted oldest first' }
      ]);

      const tableEl = renderTable({
        columns: [
          {
            header: 'Student',
            key: 'studentName',
            className: 'font-medium',
            render: row => `
              <div>
                <span class="font-medium text-ink">${esc(row.studentName)}</span>
                <span class="text-[11px] text-stone-500 font-mono ml-1">(${esc(row.admissionNo)})</span>
              </div>
            `
          },
          {
            header: 'Assignment',
            key: 'assignTitle',
            render: row => `<span class="font-medium text-ink">${esc(row.assignTitle)}</span>`
          },
          {
            header: 'Submitted Date',
            key: 'submittedAt',
            render: row => formatDateTime(row.submittedAt)
          },
          {
            header: 'Student Note',
            key: 'note',
            render: row => row.note ? `<span class="text-stone-600 truncate max-w-xs block">${esc(row.note)}</span>` : '<span class="text-stone-400">None</span>'
          },
          {
            header: 'Attachment',
            key: 'file',
            render: row => row.fileId ? `<button type="button" class="btn btn-sm py-1 px-2 text-[11px] view-file-btn" data-fid="${esc(row.fileId)}">Preview</button>` : '<span class="text-stone-400">No file</span>'
          },
          {
            header: 'Action',
            key: 'action',
            className: 'w-24 text-right',
            render: row => `<button type="button" class="btn btn-primary btn-sm open-review-btn" data-sid="${esc(row.sid)}" data-aid="${esc(row.aid)}">Review</button>`
          }
        ],
        data: queue,
        emptyMessage: 'All caught up! There are no submissions waiting for review.'
      });

      const container = h('div', { className: 'space-y-4' });
      container.innerHTML = statsStripHtml;
      container.appendChild(tableEl);

      renderShell({
        title: 'Review Queue',
        activeNav: 'review',
        content: container
      });

      document.querySelectorAll('.view-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          downloadOrPreviewFile(btn.dataset.fid);
        });
      });

      document.querySelectorAll('.open-review-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sid = btn.dataset.sid;
          const aid = btn.dataset.aid;
          const item = queue.find(q => q.sid === sid && q.aid === aid);
          if (item) {
            openReviewSubmissionModal(item, () => Teacher.routes['/review']());
          }
        });
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load review queue.', 'error');
    }
  };

  /**
   * Modal: Review Submission (Approve or Reject with >= 10 chars feedback)
   */
  function openReviewSubmissionModal(submission, onSaved) {
    const session = getSession() || {};
    const hasFile = !!submission.fileId;

    const modalHtml = `
      <div class="space-y-4 text-xs">
        <div class="card p-3.5 bg-paper/40">
          <div class="font-medium text-ink">${esc(submission.studentName)} &bull; "${esc(submission.assignTitle)}"</div>
          <div class="text-[11px] text-stone-500 mt-0.5">Submitted on ${formatDateTime(submission.submittedAt)}</div>
          ${submission.note ? `<div class="mt-2 text-stone-700 italic border-l-2 border-line pl-2">"${esc(submission.note)}"</div>` : ''}
          ${hasFile ? `<div class="mt-2.5"><button type="button" id="review-preview-file-btn" class="btn btn-sm">Preview / Download submission file</button></div>` : ''}
        </div>

        <div>
          <label class="label">Decision</label>
          <div class="flex gap-4 mb-3">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="review_decision" value="approved" checked class="text-emerald-700 focus:ring-emerald-700">
              <span class="font-medium text-emerald-800">Approve</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="review_decision" value="rejected" class="text-red-700 focus:ring-red-700">
              <span class="font-medium text-red-800">Reject (Request Resubmission)</span>
            </label>
          </div>
        </div>

        <div id="marks-wrapper">
          <label class="label">Marks Awarded ${submission.maxMarks ? `(out of ${submission.maxMarks})` : '(optional)'}</label>
          <input type="number" id="review-marks" min="0" max="${submission.maxMarks || 100}" class="input text-xs" placeholder="Marks" />
        </div>

        <div>
          <label class="label" id="feedback-label">Teacher Feedback</label>
          <textarea id="review-feedback" rows="3" class="input text-xs" placeholder="Provide helpful feedback or correction notes..."></textarea>
          <span id="feedback-requirement" class="hidden text-[10px] text-stone-400 mt-1 block">Feedback must be at least 10 characters long when rejecting.</span>
        </div>

        <div id="review-error" class="hidden text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200"></div>
      </div>
    `;

    openModal({
      title: 'Review Submission',
      content: modalHtml,
      confirmText: 'Submit Review',
      onConfirm: async () => {
        const errorEl = document.getElementById('review-error');
        errorEl.classList.add('hidden');

        const decision = document.querySelector('input[name="review_decision"]:checked').value;
        const marksVal = document.getElementById('review-marks').value;
        const feedback = document.getElementById('review-feedback').value.trim();

        if (decision === 'rejected') {
          if (!feedback || feedback.length < 10) {
            errorEl.textContent = 'Feedback is required when rejecting work (minimum 10 characters).';
            errorEl.classList.remove('hidden');
            throw new Error('Feedback required');
          }
        }

        const marks = marksVal !== '' ? Number(marksVal) : null;
        const reviewer = session.name || session.email || 'Teacher';
        const now = new Date().toISOString();

        const patchData = {
          status: decision,
          feedback: feedback || null,
          marks,
          reviewedBy: reviewer,
          reviewedAt: now
        };

        await api(`submissions/${submission.sid}/${submission.aid}`, {
          method: 'PATCH',
          body: patchData
        });

        toast(`Submission marked as ${decision}.`, 'success');
        onSaved && onSaved();
      }
    });

    if (hasFile) {
      const pBtn = document.getElementById('review-preview-file-btn');
      if (pBtn) pBtn.addEventListener('click', () => downloadOrPreviewFile(submission.fileId));
    }

    const decisionRadios = document.querySelectorAll('input[name="review_decision"]');
    const marksWrapper = document.getElementById('marks-wrapper');
    const feedbackReq = document.getElementById('feedback-requirement');
    const feedbackLabel = document.getElementById('feedback-label');

    decisionRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === 'rejected') {
          marksWrapper.classList.add('hidden');
          feedbackReq.classList.remove('hidden');
          feedbackLabel.innerHTML = 'Teacher Feedback <span class="text-red-700">*</span>';
        } else {
          marksWrapper.classList.remove('hidden');
          feedbackReq.classList.add('hidden');
          feedbackLabel.textContent = 'Teacher Feedback (optional)';
        }
      });
    });
  }

  /**
   * 6. Students List (Read-only for teacher's batches)
   */
  Teacher.routes['/students'] = async function () {
    renderShell({
      title: 'Batch Students',
      activeNav: 'students',
      content: '<div class="py-8 text-stone-500 text-xs">Loading students...</div>'
    });

    try {
      const session = getSession() || {};
      const tid = session.teacherId || session.uid;

      const [myBatches, students, attendance, assignments, submissions] = await Promise.all([
        getTeacherBatches(tid),
        api('students'),
        api('attendance'),
        api('assignments'),
        api('submissions')
      ]);

      const myBatchIds = myBatches.map(b => b.bid);
      const batchMap = Object.fromEntries(myBatches.map(b => [b.bid, b]));
      const studentList = students ? Object.entries(students).map(([sid, s]) => ({ sid, ...s })) : [];

      const enrolledStudents = studentList.filter(s => s.status === 'active' && s.batchIds && Object.keys(s.batchIds).some(bid => myBatchIds.includes(bid)));

      const myAssignments = assignments ? Object.entries(assignments).filter(([, a]) => myBatchIds.includes(a.batchId)).map(([aid, a]) => ({ aid, ...a })) : [];

      const rows = enrolledStudents.map(s => {
        const attStats = calcAttendance(attendance && attendance[s.sid]);

        let pendingCount = 0;
        myAssignments.forEach(a => {
          if (s.batchIds[a.batchId]) {
            const sub = submissions && submissions[s.sid] && submissions[s.sid][a.aid];
            if (!sub || sub.status === 'rejected') {
              pendingCount++;
            }
          }
        });

        const batchNames = Object.keys(s.batchIds).filter(bid => myBatchIds.includes(bid)).map(bid => batchMap[bid] ? batchMap[bid].name : bid).join(', ');

        return {
          sid: s.sid,
          name: s.name,
          admissionNo: s.admissionNo,
          grade: s.grade,
          batchNames,
          attendancePct: attStats.percent,
          pendingCount
        };
      });

      const tableEl = renderTable({
        columns: [
          {
            header: 'Student',
            key: 'name',
            className: 'font-medium',
            render: row => `
              <a href="#/students/${esc(row.sid)}" class="block group">
                <span class="font-medium text-ink group-hover:text-brand underline decoration-dotted">${esc(row.name)}</span>
                <div class="text-[11px] text-stone-500 font-mono">${esc(row.admissionNo)} &bull; View Profile &rarr;</div>
              </a>
            `
          },
          {
            header: 'Batches',
            key: 'batchNames',
            render: row => `<span class="text-xs">${esc(row.batchNames)}</span>`
          },
          {
            header: 'Attendance %',
            key: 'attendancePct',
            className: 'tabular-nums font-semibold',
            render: row => `<span class="${row.attendancePct < 75 ? 'text-amber-700' : 'text-ink'}">${row.attendancePct}%</span>`
          },
          {
            header: 'Pending Work',
            key: 'pendingCount',
            className: 'tabular-nums font-medium',
            render: row => row.pendingCount > 0 ? `<span class="badge badge-warning">${row.pendingCount} pending</span>` : badge('Up to date', 'success')
          },
          {
            header: 'Action',
            key: 'action',
            className: 'w-36 text-right',
            render: row => `
              <div class="flex items-center justify-end gap-1.5">
                <a href="#/students/${esc(row.sid)}" class="btn btn-sm text-[11px]">Profile</a>
                <button type="button" class="btn btn-sm send-student-warning-btn text-[11px]" data-sid="${esc(row.sid)}" data-name="${esc(row.name)}">Warn</button>
              </div>
            `
          }
        ],
        data: rows,
        emptyMessage: 'No students enrolled in your batches.'
      });

      const container = h('div', { className: 'space-y-4' });
      container.appendChild(tableEl);

      renderShell({
        title: 'Batch Students',
        activeNav: 'students',
        content: container
      });

      document.querySelectorAll('.send-student-warning-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sid = btn.dataset.sid;
          const name = btn.dataset.name;
          openTeacherWarningModal(sid, name, () => Teacher.routes['/students']());
        });
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load students.', 'error');
    }
  };

  /**
   * Modal: Teacher Send Warning to Student
   */
  function openTeacherWarningModal(sid, studentName, onSaved) {
    const session = getSession() || {};
    const formHtml = `
      <form class="space-y-3.5 text-xs" novalidate>
        <div>
          <label class="label">Student</label>
          <input type="text" disabled class="input bg-paper text-xs font-medium" value="${esc(studentName)} (${esc(sid)})" />
        </div>
        <div>
          <label class="label">Warning Type</label>
          <select id="tw-type" class="input text-xs bg-white">
            <option value="assignment">Assignment Warning</option>
            <option value="attendance">Attendance Warning</option>
            <option value="behaviour">Class Behaviour</option>
            <option value="general">General Notice</option>
          </select>
        </div>
        <div>
          <label class="label">Message *</label>
          <textarea id="tw-msg" rows="3" class="input text-xs" required placeholder="Specify homework missed or issue..."></textarea>
        </div>
      </form>
    `;

    openModal({
      title: `Send Warning to ${studentName}`,
      content: formHtml,
      confirmText: 'Send warning',
      onConfirm: async () => {
        const type = document.getElementById('tw-type').value;
        const message = document.getElementById('tw-msg').value.trim();

        if (!message) {
          toast('Please enter a message.', 'warning');
          throw new Error('Message required');
        }

        const wid = 'w_' + Date.now();
        await api(`warnings/${sid}/${wid}`, {
          method: 'PUT',
          body: {
            type,
            message,
            from: session.name || 'Teacher',
            createdAt: new Date().toISOString(),
            acknowledged: false
          }
        });

        toast(`Warning sent to ${studentName}.`, 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * 6. Student Detail & Attendance Profile View for Teachers
   */
  Teacher.routes['/students/:sid'] = async function ({ sid }) {
    renderShell({
      title: 'Student Profile',
      activeNav: 'students',
      actions: '<a href="#/students" class="btn btn-ghost btn-sm">&larr; Back to students</a>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading student profile...</div>'
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

      let activeTab = 'attendance'; // Default directly to attendance report for teacher!

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
                <span class="font-mono text-xs text-stone-500">(${esc(student.admissionNo || sid)})</span>
                ${student.status === 'active' ? badge('Active', 'success') : badge('Inactive', 'neutral')}
              </div>
              <p class="text-xs text-stone-500 mt-1">Grade ${esc(student.grade)} &bull; Guardian: ${esc(student.guardianName || 'N/A')} (${esc(student.guardianPhone || 'N/A')})</p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" id="btn-teacher-student-warn" class="btn btn-sm">Issue warning</button>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-line text-xs">
            <div>
              <div class="text-[11px] text-stone-500">Overall Attendance</div>
              <div class="text-base font-semibold tabular-nums ${attStats.percent < 75 ? 'text-amber-700' : 'text-emerald-700'}">${attStats.percent}%</div>
            </div>
            <div>
              <div class="text-[11px] text-stone-500">Classes Attended</div>
              <div class="text-base font-semibold tabular-nums text-ink">${attStats.present} / ${attStats.total}</div>
            </div>
            <div>
              <div class="text-[11px] text-stone-500">Fee Balance</div>
              <div class="text-base font-semibold tabular-nums ${feeBalance > 0 ? 'text-red-700' : 'text-emerald-700'}">${formatCurrency(feeBalance)}</div>
            </div>
            <div>
              <div class="text-[11px] text-stone-500">Fee Status</div>
              <div class="mt-0.5">${feeStatus === 'paid' ? badge('Paid', 'success') : (feeStatus === 'overdue' ? badge('Overdue', 'danger') : badge(feeStatus, 'neutral'))}</div>
            </div>
          </div>
        `;
        container.appendChild(headerCard);

        const tabsNav = h('div', { className: 'flex border-b border-line gap-4 text-xs font-medium' });
        const tabs = [
          { id: 'attendance', label: 'Attendance Report' },
          { id: 'profile', label: 'Student Profile' },
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

        // TAB 1: Attendance Report
        if (activeTab === 'attendance') {
          const attDates = attendance ? Object.keys(attendance).sort().reverse() : [];
          
          let historyRows = '';
          if (attDates.length === 0) {
            historyRows = '<tr><td colspan="3" class="p-4 text-center text-stone-400">No attendance records found yet.</td></tr>';
          } else {
            historyRows = attDates.map(dateStr => {
              const val = attendance[dateStr];
              let statusBadge = badge('Absent', 'danger');
              if (val === 'P') statusBadge = badge('Present', 'success');
              else if (val === 'L') statusBadge = badge('Late', 'warning');
              else if (val === 'H') statusBadge = badge('Holiday', 'neutral');

              return `
                <tr class="hover:bg-paper/50">
                  <td class="p-2.5 font-medium text-ink">${formatDate(dateStr)}</td>
                  <td class="p-2.5 font-mono text-stone-500 text-[11px]">${esc(dateStr)}</td>
                  <td class="p-2.5">${statusBadge}</td>
                </tr>
              `;
            }).join('');
          }

          tabContent.innerHTML = `
            <div class="card p-5 space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-semibold text-ink text-sm">Attendance Summary</h4>
                  <p class="text-xs text-stone-500">Complete day-by-day attendance history for ${esc(student.name)}</p>
                </div>
                <div class="text-right">
                  <span class="text-xs text-stone-500">Record: </span>
                  <span class="font-semibold text-xs text-emerald-700">${attStats.present} Present</span> &bull; 
                  <span class="font-semibold text-xs text-red-700">${attStats.absent} Absent</span> &bull; 
                  <span class="font-semibold text-xs text-amber-700">${attStats.late} Late</span>
                </div>
              </div>

              <div class="card overflow-hidden">
                <table class="w-full text-left text-xs">
                  <thead class="bg-paper border-b border-line text-stone-500 font-medium">
                    <tr>
                      <th class="p-2.5">Date</th>
                      <th class="p-2.5">ISO Date</th>
                      <th class="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line">
                    ${historyRows}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        } else if (activeTab === 'profile') {
          const enrolledBatches = student.batchIds ? Object.keys(student.batchIds).map(bid => batchMap[bid] ? batchMap[bid].name : bid).join(', ') : 'None';
          tabContent.innerHTML = `
            <div class="card p-5 text-xs grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span class="label">Admission Number</span>
                <p class="font-mono font-medium text-ink">${esc(student.admissionNo || sid)}</p>
              </div>
              <div>
                <span class="label">Full Name</span>
                <p class="font-medium text-ink">${esc(student.name)}</p>
              </div>
              <div>
                <span class="label">Grade / Class</span>
                <p class="text-ink">${esc(student.grade)}</p>
              </div>
              <div>
                <span class="label">Date of Birth</span>
                <p class="text-ink">${formatDate(student.dob)}</p>
              </div>
              <div>
                <span class="label">Gender</span>
                <p class="text-ink">${esc(student.gender || 'Not specified')}</p>
              </div>
              <div>
                <span class="label">Enrolled Batches</span>
                <p class="text-ink font-medium">${esc(enrolledBatches)}</p>
              </div>
              <div>
                <span class="label">Guardian Name</span>
                <p class="text-ink">${esc(student.guardianName || 'N/A')}</p>
              </div>
              <div>
                <span class="label">Guardian Phone</span>
                <p class="text-ink font-mono">${esc(student.guardianPhone || 'N/A')}</p>
              </div>
              <div>
                <span class="label">School</span>
                <p class="text-ink">${esc(student.school || 'N/A')}</p>
              </div>
              <div>
                <span class="label">Joined On</span>
                <p class="text-ink">${formatDate(student.joinedOn)}</p>
              </div>
              <div class="md:col-span-2">
                <span class="label">Address</span>
                <p class="text-ink">${esc(student.address || 'N/A')}</p>
              </div>
            </div>
          `;
        } else if (activeTab === 'fees') {
          const paymentsList = (fee && fee.payments) ? Object.entries(fee.payments).map(([pid, p]) => ({ pid, ...p })).sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [];

          const paymentsHtml = paymentsList.length === 0
            ? '<tr><td colspan="5" class="p-4 text-center text-stone-400">No payment receipts recorded yet.</td></tr>'
            : paymentsList.map(p => `
                <tr class="hover:bg-paper/50">
                  <td class="p-2.5 font-medium text-ink">${formatDate(p.date)}</td>
                  <td class="p-2.5 tabular-nums font-semibold text-emerald-700">${formatCurrency(p.amount)}</td>
                  <td class="p-2.5 uppercase text-[11px] font-mono">${esc(p.method || 'cash')}</td>
                  <td class="p-2.5 text-stone-500">${esc(p.receiptNo || p.pid)}</td>
                  <td class="p-2.5 text-right">
                    <a href="#/fees/receipt/${esc(sid)}/${esc(p.pid)}" class="btn btn-sm text-[11px]">Print Receipt</a>
                  </td>
                </tr>
              `).join('');

          tabContent.innerHTML = `
            <div class="card p-5 space-y-4 text-xs">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-semibold text-ink text-sm">Tuition Fees & Payments</h4>
                  <p class="text-xs text-stone-500">Record payments or adjust fee amounts</p>
                </div>
                <div class="flex items-center gap-2">
                  <button type="button" id="btn-teacher-rec-pay" class="btn btn-primary btn-sm">+ Record Payment</button>
                  <button type="button" id="btn-teacher-set-fee" class="btn btn-sm">Set Fee</button>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-3 p-3 bg-paper/40 rounded border border-line">
                <div>
                  <div class="text-[11px] text-stone-500">Total Fee</div>
                  <div class="text-sm font-semibold tabular-nums text-ink">${formatCurrency(feeTotal)}</div>
                </div>
                <div>
                  <div class="text-[11px] text-stone-500">Total Paid</div>
                  <div class="text-sm font-semibold tabular-nums text-emerald-700">${formatCurrency(feePaid)}</div>
                </div>
                <div>
                  <div class="text-[11px] text-stone-500">Balance Due</div>
                  <div class="text-sm font-semibold tabular-nums text-red-700">${formatCurrency(feeBalance)}</div>
                </div>
              </div>

              <div class="card overflow-hidden">
                <table class="w-full text-left text-xs">
                  <thead class="bg-paper border-b border-line text-stone-500 font-medium">
                    <tr>
                      <th class="p-2.5">Date</th>
                      <th class="p-2.5">Amount</th>
                      <th class="p-2.5">Method</th>
                      <th class="p-2.5">Receipt #</th>
                      <th class="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line">
                    ${paymentsHtml}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        } else if (activeTab === 'assignments') {
          const assignList = assignments ? Object.entries(assignments).map(([aid, a]) => ({ aid, ...a })) : [];
          tabContent.innerHTML = `
            <div class="card p-5 space-y-3 text-xs">
              <h4 class="font-semibold text-ink text-sm">Assignments for Student Batches</h4>
              <ul class="divide-y divide-line">
                ${assignList.map(a => {
                  const sub = submissions && submissions[a.aid];
                  return `
                    <li class="py-2.5 flex items-center justify-between">
                      <div>
                        <span class="font-medium text-ink">${esc(a.title)}</span>
                        <div class="text-[11px] text-stone-500">Due: ${formatDate(a.dueDate)} &bull; ${esc(a.subject || '')}</div>
                      </div>
                      <div>
                        ${sub ? badge(sub.status || 'Submitted', sub.status === 'approved' ? 'success' : 'neutral') : badge('Not submitted', 'danger')}
                      </div>
                    </li>
                  `;
                }).join('') || '<li class="py-4 text-center text-stone-400">No assignments created yet.</li>'}
              </ul>
            </div>
          `;
        } else if (activeTab === 'warnings') {
          const warnList = warnings ? Object.entries(warnings).map(([wid, w]) => ({ wid, ...w })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) : [];
          tabContent.innerHTML = `
            <div class="card p-5 space-y-3 text-xs">
              <div class="flex items-center justify-between">
                <h4 class="font-semibold text-ink text-sm">Disciplinary & Academic Warnings</h4>
                <button type="button" id="btn-tab-teacher-warn" class="btn btn-sm btn-danger">+ Send Warning</button>
              </div>
              <ul class="divide-y divide-line">
                ${warnList.map(w => `
                  <li class="py-3 space-y-1">
                    <div class="flex items-center justify-between">
                      <span class="font-medium text-ink capitalize">${esc(w.type || 'Notice')} Warning (From: ${esc(w.from || 'Teacher')})</span>
                      <span class="text-[11px] text-stone-400">${formatDate(w.createdAt)}</span>
                    </div>
                    <p class="text-stone-700">${esc(w.message)}</p>
                    <div>${w.acknowledged ? badge('Acknowledged by student', 'success') : badge('Pending acknowledgment', 'warning')}</div>
                  </li>
                `).join('') || '<li class="py-4 text-center text-stone-400">No warnings on file for this student.</li>'}
              </ul>
            </div>
          `;
        }

        container.appendChild(tabContent);

        renderShell({
          title: `Student: ${student.name}`,
          activeNav: 'students',
          actions: '<a href="#/students" class="btn btn-ghost btn-sm">&larr; Back to students</a>',
          content: container
        });

        // Wire buttons
        const warnBtn = document.getElementById('btn-teacher-student-warn');
        if (warnBtn) {
          warnBtn.onclick = () => openTeacherWarningModal(sid, student.name, () => Teacher.routes['/students/:sid']({ sid }));
        }

        const tabWarnBtn = document.getElementById('btn-tab-teacher-warn');
        if (tabWarnBtn) {
          tabWarnBtn.onclick = () => openTeacherWarningModal(sid, student.name, () => Teacher.routes['/students/:sid']({ sid }));
        }

        const recPayBtn = document.getElementById('btn-teacher-rec-pay');
        if (recPayBtn) {
          recPayBtn.onclick = () => openTeacherRecordPaymentModal(sid, student, fee, () => Teacher.routes['/students/:sid']({ sid }));
        }

        const setFeeBtn = document.getElementById('btn-teacher-set-fee');
        if (setFeeBtn) {
          setFeeBtn.onclick = () => openTeacherSetFeeModal(sid, student, fee, null, () => Teacher.routes['/students/:sid']({ sid }));
        }
      };

      renderView();
    } catch (err) {
      console.error(err);
      toast('Failed to load student details.', 'error');
    }
  };

  /**
   * 7. Fee Management Portal for Teachers
   */
  Teacher.routes['/fees'] = async function () {
    renderShell({
      title: 'Fee Management',
      activeNav: 'fees',
      content: '<div class="py-8 text-stone-500 text-xs">Loading fee records...</div>'
    });

    try {
      const [students, fees, batches] = await Promise.all([
        api('students'),
        api('fees'),
        api('batches')
      ]);

      const studentList = students ? Object.entries(students).map(([sid, s]) => ({ sid, ...s })) : [];
      const feeMap = fees || {};
      const batchMap = batches || {};

      let totalCollected = 0;
      let totalOutstanding = 0;
      let overdueCount = 0;

      const feeRows = studentList.filter(s => s.status === 'active').map(s => {
        const f = feeMap[s.sid] || {};
        let paid = 0;
        if (f.payments) {
          Object.values(f.payments).forEach(p => { paid += Number(p.amount) || 0; });
        }
        const total = Number(f.total) || 0;
        const balance = total - paid;
        const status = calcFeeStatus(total, paid, f.dueDate);

        totalCollected += paid;
        totalOutstanding += (balance > 0 ? balance : 0);
        if (status === 'overdue') overdueCount++;

        const batchNames = s.batchIds ? Object.keys(s.batchIds).map(bid => batchMap[bid] ? batchMap[bid].name : bid).join(', ') : 'None';

        return {
          sid: s.sid,
          name: s.name,
          admissionNo: s.admissionNo || s.sid,
          grade: s.grade,
          batchNames,
          total,
          paid,
          balance,
          dueDate: f.dueDate,
          status
        };
      });

      const statsEl = statStrip([
        { label: 'Total Collected', value: formatCurrency(totalCollected) },
        { label: 'Total Outstanding', value: formatCurrency(totalOutstanding) },
        { label: 'Overdue Students', value: overdueCount }
      ]);

      let searchTerm = '';
      let filterStatus = 'all';

      const tableContainer = h('div', { id: 'teacher-fees-table-container' });

      const updateTable = () => {
        const filtered = feeRows.filter(r => {
          const matchSearch = (r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.admissionNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.batchNames || '').toLowerCase().includes(searchTerm.toLowerCase());
          const matchStatus = filterStatus === 'all' || r.status === filterStatus;
          return matchSearch && matchStatus;
        });

        tableContainer.innerHTML = '';
        tableContainer.appendChild(renderTable({
          columns: [
            {
              header: 'Student',
              key: 'name',
              className: 'font-medium',
              render: row => `
                <a href="#/students/${esc(row.sid)}" class="block group">
                  <span class="font-medium text-ink group-hover:text-brand underline decoration-dotted">${esc(row.name)}</span>
                  <div class="text-[11px] text-stone-500 font-mono">${esc(row.admissionNo)} &bull; ${esc(row.batchNames)}</div>
                </a>
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
              className: 'tabular-nums font-semibold',
              render: row => `<span class="${row.balance > 0 ? 'text-red-700' : 'text-stone-700'}">${formatCurrency(row.balance)}</span>`
            },
            {
              header: 'Status',
              key: 'status',
              render: row => row.status === 'paid' ? badge('Paid', 'success') : (row.status === 'overdue' ? badge('Overdue', 'danger') : badge(row.status, 'neutral'))
            },
            {
              header: 'Action',
              key: 'action',
              className: 'text-right w-36',
              render: row => `
                <div class="flex items-center justify-end gap-1.5">
                  <button type="button" class="btn btn-primary btn-sm teacher-pay-fee-btn text-[11px]" data-sid="${esc(row.sid)}">+ Pay</button>
                  <button type="button" class="btn btn-sm teacher-edit-fee-btn text-[11px]" data-sid="${esc(row.sid)}">Set</button>
                </div>
              `
            }
          ],
          data: filtered,
          emptyMessage: 'No students matching the criteria.'
        }));

        document.querySelectorAll('.teacher-pay-fee-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const sid = btn.dataset.sid;
            const student = students[sid];
            const currentFee = feeMap[sid];
            openTeacherRecordPaymentModal(sid, student, currentFee, () => Teacher.routes['/fees']());
          });
        });

        document.querySelectorAll('.teacher-edit-fee-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const sid = btn.dataset.sid;
            const student = students[sid];
            const currentFee = feeMap[sid];
            openTeacherSetFeeModal(sid, student, currentFee, students, () => Teacher.routes['/fees']());
          });
        });
      };

      const filterBarEl = renderFilterBar({
        placeholder: 'Search by student name or admission no...',
        filters: [
          {
            id: 'tf-status',
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
          if (id === 'tf-status') filterStatus = val;
          updateTable();
        }
      });

      const container = h('div', { className: 'space-y-4' });
      container.appendChild(statsEl);
      container.appendChild(filterBarEl);
      container.appendChild(tableContainer);

      renderShell({
        title: 'Fee Management',
        activeNav: 'fees',
        content: container
      });

      updateTable();
    } catch (err) {
      console.error(err);
      toast('Failed to load fee management view.', 'error');
    }
  };

  /**
   * 8. Printable Fee Receipt View for Teachers
   */
  Teacher.routes['/fees/receipt/:sid/:pid'] = async function ({ sid, pid }) {
    renderShell({
      title: 'Fee Receipt',
      activeNav: 'fees',
      actions: '<a href="#/fees" class="btn btn-ghost btn-sm no-print">&larr; Back to fees</a>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading receipt...</div>'
    });

    try {
      const [student, fee, batches] = await Promise.all([
        api(`students/${sid}`),
        api(`fees/${sid}`),
        api('batches')
      ]);

      if (!fee || !fee.payments || !fee.payments[pid]) {
        toast('Receipt record not found.', 'error');
        Portal.router.navigate('#/fees');
        return;
      }

      const payment = fee.payments[pid];
      const batchMap = batches || {};
      const batchNames = student && student.batchIds ? Object.keys(student.batchIds).map(bid => batchMap[bid] ? batchMap[bid].name : bid).join(', ') : 'Standard Batch';

      let totalPaid = 0;
      Object.values(fee.payments).forEach(p => { totalPaid += Number(p.amount) || 0; });
      const feeTotal = Number(fee.total) || 0;
      const remainingBalance = feeTotal - totalPaid;

      const receiptEl = h('div', { className: 'card p-8 max-w-2xl mx-auto bg-white border border-line shadow-sm space-y-6 text-xs' });
      receiptEl.innerHTML = `
        <div class="flex justify-between items-start border-b border-line pb-4">
          <div>
            <h2 class="font-display text-2xl font-bold text-ink">${esc(Portal.env.CENTER_NAME || 'Tuition Centre')}</h2>
            <p class="text-stone-500 mt-1">Official Tuition Fee Receipt</p>
          </div>
          <div class="text-right">
            <span class="font-mono text-sm font-semibold text-brand">${esc(payment.receiptNo || pid)}</span>
            <p class="text-[11px] text-stone-400 mt-0.5">Date: ${formatDate(payment.date)}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 py-2">
          <div>
            <span class="text-stone-400 text-[11px] uppercase tracking-wider">Student Name</span>
            <p class="font-semibold text-sm text-ink mt-0.5">${esc(student ? student.name : sid)}</p>
            <p class="text-stone-500 font-mono text-[11px]">Adm No: ${esc(student ? student.admissionNo : sid)} &bull; Grade ${esc(student ? student.grade : '')}</p>
          </div>
          <div>
            <span class="text-stone-400 text-[11px] uppercase tracking-wider">Enrolled Batches</span>
            <p class="font-medium text-ink mt-0.5">${esc(batchNames)}</p>
            <p class="text-stone-500 text-[11px]">Guardian: ${esc(student ? student.guardianName : 'N/A')}</p>
          </div>
        </div>

        <div class="card overflow-hidden border border-line">
          <table class="w-full text-left">
            <thead class="bg-paper border-b border-line text-stone-500 text-[11px] font-medium">
              <tr>
                <th class="p-3">Description</th>
                <th class="p-3">Payment Method</th>
                <th class="p-3 text-right">Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="p-3 font-medium text-ink">
                  Tuition Fee Payment
                  <div class="text-[11px] text-stone-400 font-normal">${esc(payment.note || 'Regular installment')}</div>
                </td>
                <td class="p-3 uppercase font-mono text-stone-600">${esc(payment.method || 'cash')}</td>
                <td class="p-3 text-right font-semibold text-sm tabular-nums text-emerald-700">${formatCurrency(payment.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="space-y-1.5 pt-2 text-xs">
          <div class="flex justify-between text-stone-500">
            <span>Total Agreed Fee:</span>
            <span class="tabular-nums">${formatCurrency(feeTotal)}</span>
          </div>
          <div class="flex justify-between text-stone-500">
            <span>Total Amount Cleared To Date:</span>
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
          <a href="#/fees" class="btn btn-ghost btn-sm no-print">&larr; Back</a>
        `,
        content: receiptEl
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load receipt view.', 'error');
    }
  };

  /**
   * Modal: Teacher Record Payment
   */
  function openTeacherRecordPaymentModal(sid, student, currentFee, onSaved) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const formHtml = `
      <form id="teacher-record-payment-form" class="space-y-3 text-xs" novalidate>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Amount Paid (INR) *</label>
            <input type="number" id="t-pay-amount" min="1" step="50" class="input text-xs" required autofocus />
          </div>
          <div>
            <label class="label">Payment Date *</label>
            <input type="date" id="t-pay-date" class="input text-xs" value="${todayStr}" required />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Payment Method *</label>
            <select id="t-pay-method" class="input text-xs bg-white">
              <option value="cash">Cash</option>
              <option value="upi">UPI / GPay / PhonePe</option>
              <option value="bank">Bank Transfer</option>
              <option value="card">Debit / Credit Card</option>
            </select>
          </div>
          <div>
            <label class="label">Receipt Number</label>
            <input type="text" id="t-pay-receipt" class="input text-xs" value="REC-${Date.now().toString().slice(-6)}" />
          </div>
        </div>

        <div>
          <label class="label">Notes / Remarks</label>
          <input type="text" id="t-pay-note" class="input text-xs" placeholder="e.g. October Installment" />
        </div>
      </form>
    `;

    openModal({
      title: `Record Fee Payment: ${(student && student.name) || sid}`,
      content: formHtml,
      confirmText: 'Record Payment & Receipt',
      onConfirm: async () => {
        const amount = Number(document.getElementById('t-pay-amount').value);
        const date = document.getElementById('t-pay-date').value;
        const method = document.getElementById('t-pay-method').value;
        const receiptNo = document.getElementById('t-pay-receipt').value.trim();
        const note = document.getElementById('t-pay-note').value.trim() || 'Tuition Fee Payment';

        if (isNaN(amount) || amount <= 0 || !date) {
          toast('Please enter a valid payment amount and date.', 'warning');
          throw new Error('Validation failed');
        }

        const pid = 'p_' + Date.now();
        const payload = {
          amount,
          date,
          method,
          receiptNo,
          note,
          createdAt: new Date().toISOString()
        };

        await api(`fees/${sid}/payments/${pid}`, {
          method: 'PUT',
          body: payload
        });

        toast(`Payment of ${formatCurrency(amount)} recorded successfully!`, 'success');
        onSaved && onSaved();
      }
    });
  }

  /**
   * Modal: Teacher Set / Adjust Student Fee
   */
  function openTeacherSetFeeModal(sid, student, currentFee, allStudents, onSaved) {
    let targetSid = sid;
    const curTotal = currentFee ? currentFee.total : '';
    const curDue = currentFee ? currentFee.dueDate : '';

    const studentSelectHtml = !sid && allStudents ? `
      <div>
        <label class="label">Select Student *</label>
        <select id="t-setfee-student" class="input text-xs bg-white">
          <option value="">-- Choose Student --</option>
          ${Object.entries(allStudents).map(([sId, s]) => `<option value="${esc(sId)}">${esc(s.name)} (${esc(s.admissionNo || sId)})</option>`).join('')}
        </select>
      </div>
    ` : '';

    const formHtml = `
      <form class="space-y-3 text-xs" novalidate>
        ${studentSelectHtml}
        <div>
          <label class="label">Total Fee Amount (INR) *</label>
          <input type="number" id="t-fee-total-input" min="0" step="100" class="input text-xs" value="${esc(curTotal)}" required placeholder="e.g. 5000" />
        </div>
        <div>
          <label class="label">Due Date *</label>
          <input type="date" id="t-fee-due-input" class="input text-xs" value="${esc(curDue || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))}" required />
        </div>
        <div>
          <label class="label">Fee Description</label>
          <input type="text" id="t-fee-desc-input" class="input text-xs" placeholder="e.g. Standard Annual Tuition" value="${esc(currentFee ? currentFee.description : '')}" />
        </div>
      </form>
    `;

    openModal({
      title: sid ? `Set Fee: ${(student && student.name) || sid}` : 'Set Student Tuition Fee',
      content: formHtml,
      confirmText: 'Save Fee',
      onConfirm: async () => {
        if (!targetSid) {
          const sel = document.getElementById('t-setfee-student');
          targetSid = sel ? sel.value : null;
          if (!targetSid) {
            toast('Please choose a student.', 'warning');
            throw new Error('Student required');
          }
        }

        const totalVal = Number(document.getElementById('t-fee-total-input').value);
        const dueVal = document.getElementById('t-fee-due-input').value;
        const descVal = document.getElementById('t-fee-desc-input').value.trim();

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

        toast(`Fee amount of ${formatCurrency(totalVal)} saved.`, 'success');
        onSaved && onSaved();
      }
    });
  }

  Portal.teacher = Teacher;
})();
