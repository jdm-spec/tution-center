/**
 * Tuition Centre Management System - Student Portal (Mobile First)
 * Plain ES2020, respectful of strict per-student security rules.
 */

(function () {
  'use strict';

  const {
    h, esc, formatCurrency, formatDate, formatDateTime, formatRelativeDue,
    calcAttendance, calcFeeStatus, calcAssignmentState, toast, api, getSession
  } = Portal;
  const { renderShell, statStrip, renderTable, warningBanner, badge, icon, uploadFile, downloadOrPreviewFile } = Portal.Shared;

  const Student = {
    routes: {},
    defaultRoute: '#/home'
  };

  /**
   * Helper: Get current student's ID from session
   */
  function getCurrentStudentId() {
    const session = getSession();
    if (!session || !session.studentId) {
      throw new Error('Student admission number not found in session.');
    }
    return session.studentId;
  }

  /**
   * 1. Student Home
   */
  Student.routes['/home'] = async function () {
    renderShell({
      title: 'Student Portal',
      activeNav: 'home',
      content: '<div class="py-8 text-stone-500 text-xs">Loading portal...</div>'
    });

    try {
      const sid = getCurrentStudentId();

      // Read only permitted nodes: students/{sid}, attendance/{sid}, fees/{sid}, submissions/{sid}, warnings/{sid}, assignments, batches, teachers
      const [student, attendance, fee, submissions, warnings, assignments, batches, teachers] = await Promise.all([
        api(`students/${sid}`),
        api(`attendance/${sid}`),
        api(`fees/${sid}`),
        api(`submissions/${sid}`),
        api(`warnings/${sid}`),
        api('assignments'),
        api('batches'),
        api('teachers')
      ]);

      const container = h('div', { className: 'space-y-5' });

      // Check unacknowledged warnings
      if (warnings) {
        const unacked = Object.entries(warnings).filter(([, w]) => !w.acknowledged);
        if (unacked.length > 0) {
          const warnCard = h('div', { className: 'space-y-2' });
          unacked.forEach(([wid, w]) => {
            const banner = h('div', {
              className: 'p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 flex items-start justify-between gap-3'
            });
            banner.innerHTML = `
              <div>
                <div class="font-semibold">${esc(w.type ? w.type.toUpperCase() : 'NOTICE')}: ${esc(w.message)}</div>
                <div class="text-[10px] text-amber-700 mt-0.5">From: ${esc(w.from || 'Tuition Office')} &bull; ${formatDate(w.createdAt)}</div>
              </div>
              <button type="button" class="btn btn-sm bg-white border border-amber-300 text-amber-900 font-medium hover:bg-amber-100 flex-shrink-0 ack-btn" data-wid="${esc(wid)}">
                Got it
              </button>
            `;
            warnCard.appendChild(banner);
          });
          container.appendChild(warnCard);

          // Handle warning acknowledgement (PATCH only acknowledged and acknowledgedAt per rule)
          setTimeout(() => {
            container.querySelectorAll('.ack-btn').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                const wid = e.currentTarget.dataset.wid;
                btn.disabled = true;
                btn.textContent = 'Acknowledged';
                try {
                  await api(`warnings/${sid}/${wid}`, {
                    method: 'PATCH',
                    body: {
                      acknowledged: true,
                      acknowledgedAt: new Date().toISOString()
                    }
                  });
                  toast('Notice acknowledged.', 'success');
                  Student.routes['/home']();
                } catch (err) {
                  console.error(err);
                  btn.disabled = false;
                  btn.textContent = 'Got it';
                  toast('Could not acknowledge notice.', 'error');
                }
              });
            });
          }, 0);
        }
      }

      // Stat Strip
      const attStats = calcAttendance(attendance);
      const feeStats = calcFeeStatus(fee);

      const enrolledBids = student && student.batchIds ? Object.keys(student.batchIds) : [];
      let pendingAssignmentsCount = 0;
      if (assignments) {
        Object.entries(assignments).forEach(([aid, a]) => {
          if (enrolledBids.includes(a.batchId)) {
            const sub = submissions && submissions[aid];
            const state = calcAssignmentState(a, sub);
            if (state === 'pending' || state === 'overdue' || state === 'rejected') {
              pendingAssignmentsCount++;
            }
          }
        });
      }

      const activeWarningsCount = warnings ? Object.values(warnings).filter(w => !w.acknowledged).length : 0;

      const statsHtml = statStrip([
        { label: 'Attendance', value: `${attStats.percent}%`, note: attStats.total > 0 ? `${attStats.present + attStats.late}/${attStats.total} marked` : 'No data' },
        { label: 'Fee Status', value: feeStats.balance > 0 ? formatCurrency(feeStats.balance) : 'Paid in Full', note: feeStats.status.toUpperCase() },
        { label: 'Pending Work', value: pendingAssignmentsCount, note: 'Assignments' },
        { label: 'Notices', value: activeWarningsCount, note: activeWarningsCount > 0 ? 'Action needed' : 'All clear' }
      ]);
      const statsWrapper = h('div', null);
      statsWrapper.innerHTML = statsHtml;
      container.appendChild(statsWrapper);

      // Section: Upcoming Work
      const upcomingCard = h('div', { className: 'card p-4 space-y-3' });
      upcomingCard.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-line">
          <h3 class="font-display text-base font-semibold text-ink">Upcoming Assignments</h3>
          <a href="#/assignments" class="text-xs text-brand font-medium hover:underline">All assignments &rarr;</a>
        </div>
      `;

      const myAssignments = assignments ? Object.entries(assignments)
        .filter(([, a]) => enrolledBids.includes(a.batchId))
        .map(([aid, a]) => ({ aid, ...a }))
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)) : [];

      const pendingList = myAssignments.filter(a => {
        const sub = submissions && submissions[a.aid];
        const state = calcAssignmentState(a, sub);
        a.state = state;
        return state === 'pending' || state === 'overdue' || state === 'rejected';
      }).slice(0, 3);

      if (pendingList.length === 0) {
        upcomingCard.innerHTML += '<p class="text-xs text-stone-400 py-3">No pending assignments. You are all caught up!</p>';
      } else {
        const listEl = h('div', { className: 'divide-y divide-line' });
        pendingList.forEach(item => {
          const b = batches && batches[item.batchId];
          const sub = submissions && submissions[item.aid];
          const isRejected = sub && sub.status === 'rejected';
          const isOverdue = item.state === 'overdue';

          let stateBadge = badge('Pending', 'warning');
          if (isRejected) stateBadge = badge('Resubmit', 'danger');
          else if (isOverdue) stateBadge = badge('Overdue', 'danger');

          listEl.innerHTML += `
            <div class="py-2.5 flex items-center justify-between gap-3">
              <div>
                <a href="#/assignments/${esc(item.aid)}" class="font-medium text-xs text-ink hover:underline">
                  ${esc(item.title)}
                </a>
                <div class="text-[11px] text-stone-500 mt-0.5">
                  ${esc(b ? b.name : item.batchId)} &bull; Due ${formatDate(item.dueDate)} (${formatRelativeDue(item.dueDate)})
                </div>
              </div>
              <div class="flex-shrink-0">
                ${stateBadge}
              </div>
            </div>
          `;
        });
        upcomingCard.appendChild(listEl);
      }
      container.appendChild(upcomingCard);

      // Section: My Batches & Schedule
      const batchCard = h('div', { className: 'card p-4 space-y-3' });
      batchCard.innerHTML = `
        <div class="pb-2 border-b border-line">
          <h3 class="font-display text-base font-semibold text-ink">My Batches & Schedule</h3>
        </div>
      `;

      if (enrolledBids.length === 0) {
        batchCard.innerHTML += '<p class="text-xs text-stone-400 py-3">Not enrolled in any batches yet.</p>';
      } else {
        const batchListEl = h('div', { className: 'divide-y divide-line' });
        enrolledBids.forEach(bid => {
          const b = batches && batches[bid];
          const t = b && teachers && teachers[b.teacherId];
          batchListEl.innerHTML += `
            <div class="py-2.5">
              <div class="flex justify-between items-baseline">
                <span class="font-medium text-xs text-ink">${esc(b ? b.name : bid)}</span>
                <span class="text-[11px] text-stone-500">${esc(t ? t.name : 'Teacher')}</span>
              </div>
              <div class="text-[11px] text-stone-500 mt-0.5">${esc(b ? b.schedule || 'Schedule not set' : '')} &bull; Room: ${esc(b ? b.room || '&mdash;' : '&mdash;')}</div>
            </div>
          `;
        });
        batchCard.appendChild(batchListEl);
      }
      container.appendChild(batchCard);

      renderShell({
        title: student ? `Welcome, ${student.name}` : 'Student Portal',
        activeNav: 'home',
        content: container
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load student dashboard.', 'error');
    }
  };

  /**
   * 2. Student Assignments (Tabs: Pending, Submitted, Approved, Rejected)
   */
  Student.routes['/assignments'] = async function () {
    renderShell({
      title: 'Assignments',
      activeNav: 'assignments',
      content: '<div class="py-8 text-stone-500 text-xs">Loading assignments...</div>'
    });

    try {
      const sid = getCurrentStudentId();

      const [student, assignments, submissions, batches, teachers] = await Promise.all([
        api(`students/${sid}`),
        api('assignments'),
        api(`submissions/${sid}`),
        api('batches'),
        api('teachers')
      ]);

      const enrolledBids = student && student.batchIds ? Object.keys(student.batchIds) : [];
      const myAssignments = assignments ? Object.entries(assignments)
        .filter(([, a]) => enrolledBids.includes(a.batchId))
        .map(([aid, a]) => ({ aid, ...a })) : [];

      const categories = {
        pending: [],
        submitted: [],
        approved: [],
        rejected: []
      };

      myAssignments.forEach(a => {
        const sub = submissions && submissions[a.aid];
        const state = calcAssignmentState(a, sub);
        const batch = batches && batches[a.batchId];
        const teacher = teachers && teachers[a.teacherId];

        const item = {
          ...a,
          batchName: batch ? batch.name : a.batchId,
          teacherName: teacher ? teacher.name : 'Teacher',
          sub,
          state
        };

        if (state === 'approved') categories.approved.push(item);
        else if (state === 'rejected') categories.rejected.push(item);
        else if (state === 'submitted') categories.submitted.push(item);
        else categories.pending.push(item);
      });

      let currentTab = 'pending';
      const container = h('div', { className: 'space-y-4' });

      const renderTabContent = () => {
        const items = categories[currentTab];
        let tabHtml = `
          <div class="flex border-b border-line gap-4 text-xs font-medium mb-4 overflow-x-auto pb-px">
            <button type="button" class="tab-btn py-2 px-1 border-b-2 ${currentTab === 'pending' ? 'border-brand text-brand font-semibold' : 'border-transparent text-stone-500 hover:text-ink'}" data-tab="pending">
              Pending (${categories.pending.length})
            </button>
            <button type="button" class="tab-btn py-2 px-1 border-b-2 ${currentTab === 'submitted' ? 'border-brand text-brand font-semibold' : 'border-transparent text-stone-500 hover:text-ink'}" data-tab="submitted">
              Submitted (${categories.submitted.length})
            </button>
            <button type="button" class="tab-btn py-2 px-1 border-b-2 ${currentTab === 'approved' ? 'border-brand text-brand font-semibold' : 'border-transparent text-stone-500 hover:text-ink'}" data-tab="approved">
              Approved (${categories.approved.length})
            </button>
            <button type="button" class="tab-btn py-2 px-1 border-b-2 ${currentTab === 'rejected' ? 'border-brand text-brand font-semibold' : 'border-transparent text-stone-500 hover:text-ink'}" data-tab="rejected">
              Needs Revision (${categories.rejected.length})
            </button>
          </div>
        `;

        if (items.length === 0) {
          tabHtml += `<div class="card p-8 text-center text-xs text-stone-400">No assignments in this section.</div>`;
        } else {
          tabHtml += `<div class="space-y-3">`;
          items.forEach(item => {
            let statusBadge = badge('Pending', 'neutral');
            if (item.state === 'approved') statusBadge = badge('Approved', 'success');
            else if (item.state === 'rejected') statusBadge = badge('Rejected', 'danger');
            else if (item.state === 'submitted') statusBadge = badge('Submitted', 'warning');

            tabHtml += `
              <div class="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-ink text-sm">${esc(item.title)}</span>
                    ${statusBadge}
                  </div>
                  <div class="text-stone-500 text-[11px]">
                    ${esc(item.batchName)} &bull; ${esc(item.teacherName)} &bull; Due: ${formatDate(item.dueDate)} (${formatRelativeDue(item.dueDate)})
                  </div>
                  ${item.state === 'approved' && item.sub ? `
                    <div class="text-[11px] text-emerald-800 font-medium">
                      Marks: ${item.sub.marks !== undefined && item.sub.marks !== null ? `${item.sub.marks} / ${item.maxMarks || '&mdash;'}` : 'Ungraded'}
                    </div>
                  ` : ''}
                  ${item.state === 'rejected' && item.sub ? `
                    <div class="text-[11px] text-red-700 bg-red-50 p-2 rounded border border-red-100">
                      Feedback: "${esc(item.sub.feedback || 'Please review and resubmit.')}"
                    </div>
                  ` : ''}
                </div>
                <div class="flex items-center gap-2 flex-shrink-0 pt-2 sm:pt-0">
                  <a href="#/assignments/${esc(item.aid)}" class="btn btn-primary btn-sm text-[11px]">View details &rarr;</a>
                </div>
              </div>
            `;
          });
          tabHtml += `</div>`;
        }

        container.innerHTML = tabHtml;

        container.querySelectorAll('.tab-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            currentTab = btn.dataset.tab;
            renderTabContent();
          });
        });
      };

      renderTabContent();

      renderShell({
        title: 'Assignments',
        activeNav: 'assignments',
        content: container
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load assignments.', 'error');
    }
  };

  /**
   * 3. Assignment Detail & Submission / Resubmission View
   */
  Student.routes['/assignments/:aid'] = async function ({ aid }) {
    renderShell({
      title: 'Assignment Details',
      activeNav: 'assignments',
      actions: '<a href="#/assignments" class="btn btn-ghost btn-sm">&larr; Back</a>',
      content: '<div class="py-8 text-stone-500 text-xs">Loading assignment...</div>'
    });

    try {
      const sid = getCurrentStudentId();

      const [assignment, submission, batches, teachers] = await Promise.all([
        api(`assignments/${aid}`),
        api(`submissions/${sid}/${aid}`),
        api('batches'),
        api('teachers')
      ]);

      if (!assignment) {
        toast('Assignment not found.', 'error');
        Portal.router.navigate('#/assignments');
        return;
      }

      const batch = batches && batches[assignment.batchId];
      const teacher = teachers && teachers[assignment.teacherId];
      const state = calcAssignmentState(assignment, submission);

      const container = h('div', { className: 'space-y-5 max-w-2xl mx-auto' });

      const infoCard = h('div', { className: 'card p-5 text-xs' });
      infoCard.innerHTML = `
        <div class="flex items-start justify-between gap-3 pb-3 border-b border-line mb-3">
          <div>
            <h3 class="font-display text-xl font-semibold text-ink">${esc(assignment.title)}</h3>
            <p class="text-stone-500 mt-0.5">${esc(batch ? batch.name : assignment.batchId)} &bull; Teacher: ${esc(teacher ? teacher.name : 'Teacher')}</p>
          </div>
          <div>
            ${state === 'approved' ? badge('Approved', 'success') : (state === 'rejected' ? badge('Rejected', 'danger') : (state === 'submitted' ? badge('Submitted', 'warning') : badge('Pending', 'neutral')))}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs mb-4">
          <div>
            <span class="label">Due Date</span>
            <span class="font-medium text-ink">${formatDate(assignment.dueDate)} (${formatRelativeDue(assignment.dueDate)})</span>
          </div>
          <div>
            <span class="label">Maximum Marks</span>
            <span class="font-medium text-ink">${esc(assignment.maxMarks || 'Not graded')}</span>
          </div>
        </div>

        ${assignment.description ? `
          <div class="mb-4">
            <span class="label">Instructions</span>
            <p class="text-stone-700 leading-relaxed bg-paper/50 p-3 rounded border border-line">${esc(assignment.description)}</p>
          </div>
        ` : ''}

        ${assignment.fileId ? `
          <div class="pt-3 border-t border-line">
            <button type="button" id="btn-download-teacher-file" class="btn btn-sm">
              ${icon('assignments', 'w-4 h-4 text-stone-500')}
              <span>Download teacher's attachment</span>
            </button>
          </div>
        ` : ''}
      `;
      container.appendChild(infoCard);

      const subCard = h('div', { className: 'card p-5 text-xs' });

      if (state === 'approved') {
        subCard.innerHTML = `
          <div class="border-l-4 border-emerald-600 pl-3 py-1 mb-4">
            <h4 class="font-semibold text-emerald-900 text-sm">Assignment Approved</h4>
            <p class="text-stone-600 mt-0.5">Reviewed on ${formatDate(submission.reviewedAt)} by ${esc(submission.reviewedBy || 'Teacher')}.</p>
          </div>
          <div class="space-y-3">
            <div>
              <span class="label">Marks Awarded</span>
              <span class="text-lg font-semibold tabular-nums text-emerald-800">${submission.marks !== undefined && submission.marks !== null ? `${submission.marks} / ${assignment.maxMarks || '&mdash;'}` : 'Approved (Ungraded)'}</span>
            </div>
            ${submission.feedback ? `
              <div>
                <span class="label">Teacher Feedback</span>
                <p class="text-stone-700 italic bg-paper p-3 rounded border border-line">${esc(submission.feedback)}</p>
              </div>
            ` : ''}
            ${submission.fileId ? `
              <div>
                <button type="button" class="btn btn-sm view-sub-file-btn" data-fid="${esc(submission.fileId)}">View your submitted work</button>
              </div>
            ` : ''}
            <p class="text-[11px] text-stone-400 pt-2 border-t border-line">Approved work is finalized and locked.</p>
          </div>
        `;
      } else if (state === 'submitted') {
        subCard.innerHTML = `
          <div class="border-l-4 border-amber-500 pl-3 py-1 mb-4">
            <h4 class="font-semibold text-amber-900 text-sm">Submitted & Awaiting Review</h4>
            <p class="text-stone-600 mt-0.5">Your work was submitted on ${formatDateTime(submission.submittedAt)}.</p>
          </div>
          <div class="space-y-3">
            ${submission.note ? `
              <div>
                <span class="label">Your Submission Note</span>
                <p class="text-stone-700 bg-paper p-2.5 rounded border border-line">${esc(submission.note)}</p>
              </div>
            ` : ''}
            ${submission.fileId ? `
              <div>
                <button type="button" class="btn btn-sm view-sub-file-btn" data-fid="${esc(submission.fileId)}">Preview submitted file</button>
              </div>
            ` : ''}
          </div>
        `;
      } else {
        const isRejected = state === 'rejected';

        subCard.innerHTML = `
          ${isRejected ? `
            <div class="border-l-4 border-red-600 pl-3 py-1 mb-4 bg-red-50/50 p-2.5 rounded-r">
              <h4 class="font-semibold text-red-900 text-sm">Work Rejected &mdash; Revision Required</h4>
              <p class="text-stone-700 mt-1 font-medium">Feedback: "${esc(submission.feedback || 'Please review and resubmit.')}"</p>
              <p class="text-[10px] text-stone-400 mt-1">Reviewed by ${esc(submission.reviewedBy || 'Teacher')} on ${formatDate(submission.reviewedAt)}</p>
            </div>
          ` : `
            <h4 class="font-display text-base font-semibold pb-2 border-b border-line mb-3">Submit Your Work</h4>
          `}

          <form id="student-submit-form" class="space-y-3.5" novalidate>
            <div>
              <label class="label" for="work-file">Upload Document / Photos (Max ${(Portal.env && Portal.env.MAX_UPLOAD_KB) || 1500} KB) *</label>
              <input type="file" id="work-file" required class="text-xs" accept=".pdf,image/*" />
            </div>

            <div>
              <label class="label" for="work-note">Note for Teacher (optional)</label>
              <textarea id="work-note" rows="2" class="input text-xs" placeholder="Add any comments or questions for your teacher..."></textarea>
            </div>

            <button type="submit" id="btn-submit-work" class="btn btn-primary text-xs py-2 px-4 font-medium w-full sm:w-auto">
              ${isRejected ? 'Resubmit Work' : 'Submit Assignment'}
            </button>
          </form>
        `;
      }

      container.appendChild(subCard);

      renderShell({
        title: assignment.title,
        activeNav: 'assignments',
        actions: '<a href="#/assignments" class="btn btn-ghost btn-sm">&larr; Back</a>',
        content: container
      });

      const dBtn = document.getElementById('btn-download-teacher-file');
      if (dBtn) {
        dBtn.addEventListener('click', () => downloadOrPreviewFile(assignment.fileId));
      }

      document.querySelectorAll('.view-sub-file-btn').forEach(btn => {
        btn.addEventListener('click', () => downloadOrPreviewFile(btn.dataset.fid));
      });

      const submitForm = document.getElementById('student-submit-form');
      if (submitForm) {
        submitForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fileInput = document.getElementById('work-file');
          const noteInput = document.getElementById('work-note');
          const submitBtn = document.getElementById('btn-submit-work');

          if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            toast('Please choose a file to upload.', 'warning');
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = 'Uploading...';

          try {
            const uploadRes = await uploadFile(fileInput);
            if (!uploadRes || !uploadRes.fileId) {
              throw new Error('Upload failed');
            }

            const payload = {
              status: 'submitted',
              fileId: uploadRes.fileId,
              note: (noteInput ? noteInput.value : '').trim() || null,
              submittedAt: new Date().toISOString()
            };

            await api(`submissions/${sid}/${aid}`, {
              method: 'PUT',
              body: payload
            });

            toast('Your assignment has been submitted.', 'success');
            Student.routes['/assignments/:aid']({ aid });
          } catch (err) {
            console.error(err);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Assignment';
            toast(err.message || 'Submission failed. Please try again.', 'error');
          }
        });
      }
    } catch (err) {
      console.error(err);
      toast('Failed to load assignment view.', 'error');
    }
  };

  /**
   * 4. Student Attendance Calendar & Breakdown
   */
  Student.routes['/attendance'] = async function () {
    renderShell({
      title: 'My Attendance',
      activeNav: 'attendance',
      content: '<div class="py-8 text-stone-500 text-xs">Loading attendance...</div>'
    });

    try {
      const sid = getCurrentStudentId();
      const attendance = await api(`attendance/${sid}`);
      const stats = calcAttendance(attendance);

      const statsHtml = statStrip([
        { label: 'Overall Attendance', value: `${stats.percent}%` },
        { label: 'Present Days (P)', value: stats.present },
        { label: 'Late Days (L)', value: stats.late, note: 'Treated as present' },
        { label: 'Absent Days (A)', value: stats.absent }
      ]);

      const container = h('div', { className: 'space-y-5' });
      const statsWrapper = h('div', null);
      statsWrapper.innerHTML = statsHtml;
      container.appendChild(statsWrapper);

      const dates = attendance ? Object.keys(attendance).sort().reverse() : [];
      const listCard = h('div', { className: 'card p-5' });
      listCard.innerHTML = `
        <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
          <h3 class="font-display text-base font-semibold text-ink">Attendance History</h3>
          <span class="text-xs text-stone-500">${stats.total} days marked</span>
        </div>
      `;

      if (dates.length === 0) {
        listCard.innerHTML += '<p class="text-stone-400 py-3 text-xs">No attendance marked yet.</p>';
      } else {
        const listEl = h('div', { className: 'divide-y divide-line text-xs' });
        dates.forEach(d => {
          const val = attendance[d];
          const b = val === 'P' ? badge('Present', 'success') : (val === 'L' ? badge('Late', 'warning') : badge('Absent', 'danger'));
          listEl.innerHTML += `
            <div class="py-2.5 flex items-center justify-between">
              <span class="font-medium text-ink">${formatDate(d)}</span>
              ${b}
            </div>
          `;
        });
        listCard.appendChild(listEl);
      }

      listCard.innerHTML += `
        <p class="text-[11px] text-stone-400 mt-4 pt-2 border-t border-line">
          Footnote: Attendance % = (P + L) / marked days &times; 100. Late (L) is counted as present.
        </p>
      `;
      container.appendChild(listCard);

      renderShell({
        title: 'My Attendance',
        activeNav: 'attendance',
        content: container
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load attendance.', 'error');
    }
  };

  /**
   * 5. Student Fees
   */
  Student.routes['/fees'] = async function () {
    renderShell({
      title: 'Fee Status',
      activeNav: 'fees',
      content: '<div class="py-8 text-stone-500 text-xs">Loading fees...</div>'
    });

    try {
      const sid = getCurrentStudentId();
      const fee = await api(`fees/${sid}`);

      let paid = 0;
      const payments = [];
      if (fee && fee.payments) {
        Object.entries(fee.payments).forEach(([pid, p]) => {
          paid += Number(p.amount) || 0;
          payments.push({ pid, ...p });
        });
      }
      payments.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      const total = Number(fee ? fee.total : 0) || 0;
      const balance = Math.max(0, total - paid);

      const statsHtml = statStrip([
        { label: 'Total Fee', value: formatCurrency(total) },
        { label: 'Amount Paid', value: formatCurrency(paid) },
        { label: 'Balance Due', value: formatCurrency(balance) },
        { label: 'Due Date', value: formatDate(fee ? fee.dueDate : null) }
      ]);

      const container = h('div', { className: 'space-y-5' });
      const statsWrapper = h('div', null);
      statsWrapper.innerHTML = statsHtml;
      container.appendChild(statsWrapper);

      const noticeCard = h('div', { className: 'card p-4 bg-paper/60 border border-line text-xs flex items-start gap-3' });
      noticeCard.innerHTML = `
        ${icon('fees', 'w-5 h-5 text-brand mt-0.5')}
        <div>
          <div class="font-semibold text-ink">Fee Payment Instructions</div>
          <p class="text-stone-600 mt-0.5 leading-relaxed">
            Please pay at the tuition office. We accept Cash, UPI and Bank Transfer. Once paid, the office issues an official receipt that will appear below.
          </p>
        </div>
      `;
      container.appendChild(noticeCard);

      const historyCard = h('div', { className: 'card p-5 text-xs' });
      historyCard.innerHTML = `
        <div class="flex items-center justify-between pb-3 border-b border-line mb-3">
          <h3 class="font-display text-base font-semibold text-ink">Payment History</h3>
          <span class="text-stone-500">${payments.length} payments recorded</span>
        </div>
      `;

      if (payments.length === 0) {
        historyCard.innerHTML += '<p class="text-stone-400 py-3">No payments recorded yet.</p>';
      } else {
        const listEl = h('div', { className: 'divide-y divide-line' });
        payments.forEach(p => {
          listEl.innerHTML += `
            <div class="py-2.5 flex items-center justify-between gap-3">
              <div>
                <span class="font-medium text-ink font-mono">${esc(p.receiptNo || p.pid)}</span>
                <div class="text-[11px] text-stone-500">${formatDate(p.date)} &bull; ${esc(p.mode || 'Cash')}</div>
              </div>
              <div class="font-semibold text-ink tabular-nums text-sm">
                ${formatCurrency(p.amount)}
              </div>
            </div>
          `;
        });
        historyCard.appendChild(listEl);
      }

      container.appendChild(historyCard);

      renderShell({
        title: 'Fee Status',
        activeNav: 'fees',
        content: container
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load fee information.', 'error');
    }
  };

  /**
   * 6. Student Profile
   */
  Student.routes['/profile'] = async function () {
    renderShell({
      title: 'My Profile',
      activeNav: 'profile',
      content: '<div class="py-8 text-stone-500 text-xs">Loading profile...</div>'
    });

    try {
      const sid = getCurrentStudentId();
      const [student, batches, teachers] = await Promise.all([
        api(`students/${sid}`),
        api('batches'),
        api('teachers')
      ]);

      if (!student) {
        toast('Profile record not found.', 'error');
        return;
      }

      const enrolledBatches = [];
      if (student.batchIds && batches) {
        Object.keys(student.batchIds).forEach(bid => {
          if (batches[bid]) {
            const b = batches[bid];
            const t = teachers && teachers[b.teacherId];
            enrolledBatches.push({
              bid,
              ...b,
              teacherName: t ? t.name : 'Teacher'
            });
          }
        });
      }

      const container = h('div', { className: 'space-y-5 max-w-2xl mx-auto' });

      const card = h('div', { className: 'card p-5 text-xs' });
      card.innerHTML = `
        <div class="flex items-center justify-between pb-3 border-b border-line mb-4">
          <div>
            <h3 class="font-display text-lg font-semibold text-ink">${esc(student.name)}</h3>
            <span class="text-stone-500 font-mono text-[11px]">Admission No: ${esc(student.admissionNo || sid)}</span>
          </div>
          <div>
            ${student.status === 'active' ? badge('Active', 'success') : badge('Inactive', 'neutral')}
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span class="label">Grade / Class</span>
            <span class="font-medium text-ink">${esc(student.grade || '&mdash;')}</span>
          </div>
          <div>
            <span class="label">Date of Birth</span>
            <span class="font-medium text-ink">${formatDate(student.dob)}</span>
          </div>
          <div>
            <span class="label">Gender</span>
            <span class="font-medium text-ink">${esc(student.gender || '&mdash;')}</span>
          </div>
          <div>
            <span class="label">School</span>
            <span class="font-medium text-ink">${esc(student.school || '&mdash;')}</span>
          </div>
          <div>
            <span class="label">Guardian Name</span>
            <span class="font-medium text-ink">${esc(student.guardianName || '&mdash;')}</span>
          </div>
          <div>
            <span class="label">Guardian Phone</span>
            <span class="font-medium text-ink">${esc(student.guardianPhone || '&mdash;')}</span>
          </div>
          <div>
            <span class="label">Address</span>
            <span class="font-medium text-ink">${esc(student.address || '&mdash;')}</span>
          </div>
          <div>
            <span class="label">Enrolment Date</span>
            <span class="font-medium text-ink">${formatDate(student.joinedOn)}</span>
          </div>
        </div>
      `;
      container.appendChild(card);

      const batchCard = h('div', { className: 'card p-5' });
      batchCard.innerHTML = `
        <div class="pb-3 border-b border-line mb-3">
          <h4 class="font-display text-base font-semibold text-ink">My Batches & Subjects</h4>
        </div>
      `;

      if (enrolledBatches.length === 0) {
        batchCard.innerHTML += '<p class="text-stone-400 py-2">No batches enrolled.</p>';
      } else {
        const batchListEl = h('div', { className: 'divide-y divide-line' });
        enrolledBatches.forEach(b => {
          batchListEl.innerHTML += `
            <div class="py-2.5">
              <div class="flex justify-between items-baseline">
                <span class="font-medium text-ink">${esc(b.name)}</span>
                <span class="text-stone-500">${esc(b.teacherName)}</span>
              </div>
              <div class="text-[11px] text-stone-500 mt-0.5">
                ${esc(b.subject || '')} &bull; ${esc(b.schedule || '')} &bull; Room: ${esc(b.room || '&mdash;')}
              </div>
            </div>
          `;
        });
        batchCard.appendChild(batchListEl);
      }
      container.appendChild(batchCard);

      renderShell({
        title: 'My Profile',
        activeNav: 'profile',
        content: container
      });
    } catch (err) {
      console.error(err);
      toast('Failed to load profile.', 'error');
    }
  };

  Portal.student = Student;
})();
