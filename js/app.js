/**
 * Tuition Centre Management System - Main App & Authentication
 * Plain ES2020, zero dependencies, classic script.
 */

(function () {
  'use strict';

  const {
    h, esc, toast, signInWithPassword, signUpUser, studentSyntheticAuth,
    saveSession, getSession, clearSession, api, router
  } = Portal;

  const App = {
    mode: 'login', // 'login' | 'bootstrap'
    selectedTab: 'student' // 'student' | 'teacher' | 'principal'
  };

  /**
   * Render Login / Bootstrap Screen
   */
  App.renderAuth = function () {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    const centerName = (Portal.env && Portal.env.CENTER_NAME) || 'Tuition Centre';

    if (App.mode === 'bootstrap') {
      // -------------------------------------------------------------
      // INITIAL PRINCIPAL BOOTSTRAP VIEW (First-time setup only)
      // -------------------------------------------------------------
      appEl.innerHTML = `
        <div class="min-h-screen bg-paper flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div class="sm:mx-auto sm:w-full sm:max-w-md">
            <div class="text-center mb-6">
              <h1 class="font-display text-3xl font-semibold text-ink tracking-tight">${esc(centerName)}</h1>
              <p class="text-xs text-stone-600 mt-1">Initial Administrator Setup</p>
            </div>

            <div class="card p-6 shadow-none">
              <div class="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 mb-4 leading-relaxed">
                <strong>One-Time Setup:</strong> This form initializes the master Principal account. Once established, public registration is locked, and all subsequent accounts are provisioned inside the administrative portal.
              </div>

              <!-- Bootstrap Form -->
              <form id="bootstrap-form" class="space-y-3.5" novalidate>
                <div>
                  <label for="reg-name" class="label">Principal full name *</label>
                  <input type="text" id="reg-name" name="name" class="input text-xs" placeholder="e.g. Dr. Eleanor Vance" required autofocus autocomplete="name" />
                </div>

                <div>
                  <label for="reg-email" class="label">Principal email address *</label>
                  <input type="email" id="reg-email" name="email" class="input text-xs" placeholder="principal@centre.com" required autocomplete="email" />
                </div>

                <div>
                  <label for="reg-password" class="label">Password (minimum 6 characters) *</label>
                  <input type="password" id="reg-password" name="password" class="input text-xs" placeholder="Create a strong password" required minlength="6" autocomplete="new-password" />
                </div>

                <div>
                  <label for="reg-confirm-password" class="label">Confirm password *</label>
                  <input type="password" id="reg-confirm-password" name="confirmPassword" class="input text-xs" placeholder="Repeat your password" required minlength="6" autocomplete="new-password" />
                </div>

                <div id="bootstrap-error" class="hidden text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200"></div>

                <button type="submit" id="submit-bootstrap-btn" class="btn btn-primary w-full py-2 text-xs font-medium">
                  Initialize Principal Account
                </button>
              </form>

              <div class="mt-4 pt-4 border-t border-line flex flex-col gap-2 text-center">
                <button type="button" id="btn-switch-to-login" class="text-xs text-stone-600 hover:text-ink font-medium">
                  &larr; Back to sign in
                </button>
              </div>
            </div>

            <div class="text-center mt-6">
              <p class="text-[11px] text-stone-400">Tuition Centre Management System &bull; Secure Setup</p>
            </div>
          </div>
        </div>
      `;

      const switchToLogin = document.getElementById('btn-switch-to-login');
      const bootForm = document.getElementById('bootstrap-form');
      const bootError = document.getElementById('bootstrap-error');
      const bootSubmitBtn = document.getElementById('submit-bootstrap-btn');

      switchToLogin.addEventListener('click', () => {
        App.mode = 'login';
        App.renderAuth();
      });

      bootForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        bootError.classList.add('hidden');
        bootError.textContent = '';

        const nameInput = document.getElementById('reg-name');
        const emailInput = document.getElementById('reg-email');
        const passInput = document.getElementById('reg-password');
        const confirmInput = document.getElementById('reg-confirm-password');

        const name = (nameInput ? nameInput.value : '').trim();
        const email = (emailInput ? emailInput.value : '').trim();
        const password = passInput ? passInput.value : '';
        const confirmPassword = confirmInput ? confirmInput.value : '';

        if (!name) {
          bootError.textContent = 'Please enter your full name.';
          bootError.classList.remove('hidden');
          nameInput && nameInput.focus();
          return;
        }

        if (!email) {
          bootError.textContent = 'Please enter a valid email address.';
          bootError.classList.remove('hidden');
          emailInput && emailInput.focus();
          return;
        }

        if (!password || password.length < 6) {
          bootError.textContent = 'Password must be at least 6 characters.';
          bootError.classList.remove('hidden');
          passInput && passInput.focus();
          return;
        }

        if (password !== confirmPassword) {
          bootError.textContent = 'Passwords do not match.';
          bootError.classList.remove('hidden');
          confirmInput && confirmInput.focus();
          return;
        }

        bootSubmitBtn.disabled = true;
        bootSubmitBtn.textContent = 'Initializing...';

        try {
          let authResult = null;
          try {
            authResult = await signUpUser(email, password);
          } catch (signErr) {
            if (signErr.message && signErr.message.includes('EMAIL_EXISTS')) {
              try {
                authResult = await signInWithPassword(email, password);
              } catch (loginErr) {
                throw new Error('An account with this email already exists in Firebase Auth. Sign in with your password to complete setup.');
              }
            } else {
              throw signErr;
            }
          }

          // Save session so api requests are authenticated
          const expiresInSec = parseInt(authResult.expiresIn, 10) || 3600;
          const sessionData = {
            uid: authResult.uid,
            idToken: authResult.idToken,
            refreshToken: authResult.refreshToken,
            expiresAt: Math.floor(Date.now() / 1000) + expiresInSec,
            role: 'principal',
            name: name,
            email: email,
            studentId: null,
            teacherId: null
          };
          saveSession(sessionData);

          try {
            // Write initial principal node: users/{uid}
            await api(`users/${authResult.uid}`, {
              method: 'PUT',
              body: {
                role: 'principal',
                name: name,
                email: email,
                createdAt: new Date().toISOString()
              },
              idToken: authResult.idToken
            });

            toast(`Principal setup complete! Welcome, ${name}`, 'success');
            router.navigate('#/overview');
          } catch (dbErr) {
            clearSession();
            let dbMsg = dbErr.message || 'Database write failed.';
            if (dbMsg.includes('Unauthorized') || dbMsg.includes('Permission denied')) {
              bootError.innerHTML = `
                <div class="space-y-2">
                  <div class="font-semibold text-red-900">Cloud database rules are locked.</div>
                  <p class="text-[11px] text-stone-700 leading-normal">
                    Google Cloud rejected the write with <code>Permission denied</code>. Please publish <code>database.rules.json</code> in your Firebase Console, or test the full app right now in Interactive Test Mode.
                  </p>
                  <button type="button" id="btn-boot-demo-fallback" class="btn btn-sm btn-primary w-full text-xs py-1.5 font-medium mt-1">
                    Launch Principal Portal in Test Mode &rarr;
                  </button>
                </div>
              `;
              bootError.classList.remove('hidden');
              bootSubmitBtn.disabled = false;
              bootSubmitBtn.textContent = 'Initialize Principal Account';

              const bBtn = document.getElementById('btn-boot-demo-fallback');
              if (bBtn) {
                bBtn.addEventListener('click', () => {
                  Portal.enableDemoSession('principal');
                });
              }
              return;
            }
            throw new Error(dbMsg);
          }
        } catch (err) {
          console.error('Bootstrap error:', err);
          bootSubmitBtn.disabled = false;
          bootSubmitBtn.textContent = 'Initialize Principal Account';

          let msg = err.message || 'Failed to initialize account.';
          if (msg.includes('EMAIL_EXISTS')) {
            msg = 'An account with this email address already exists. Please sign in instead.';
          } else if (msg.includes('WEAK_PASSWORD')) {
            msg = 'Password should be at least 6 characters.';
          } else if (msg.includes('INVALID_EMAIL')) {
            msg = 'Please enter a valid email address.';
          }
          bootError.textContent = msg;
          bootError.classList.remove('hidden');
        }
      });
      return;
    }

    // -------------------------------------------------------------
    // SIGN IN VIEW
    // -------------------------------------------------------------
    appEl.innerHTML = `
      <div class="min-h-screen bg-paper flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="text-center mb-6">
            <h1 class="font-display text-3xl font-semibold text-ink tracking-tight">${esc(centerName)}</h1>
            <p class="text-xs text-stone-500 mt-1">Sign in to access your portal</p>
          </div>

          <div class="card p-6 shadow-none">
            <!-- Role Segmented Control -->
            <div class="flex rounded border border-line p-1 bg-paper mb-6">
              <button type="button" id="tab-student" class="flex-1 py-1.5 text-xs font-medium rounded transition-colors text-center ${App.selectedTab === 'student' ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'}">
                Student
              </button>
              <button type="button" id="tab-teacher" class="flex-1 py-1.5 text-xs font-medium rounded transition-colors text-center ${App.selectedTab === 'teacher' ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'}">
                Teacher
              </button>
              <button type="button" id="tab-principal" class="flex-1 py-1.5 text-xs font-medium rounded transition-colors text-center ${App.selectedTab === 'principal' ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'}">
                Principal
              </button>
            </div>

            <!-- Login Form -->
            <form id="login-form" class="space-y-4" novalidate>
              <div id="login-fields"></div>

              <div id="login-error" class="hidden text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200"></div>

              <button type="submit" id="submit-login-btn" class="btn btn-primary w-full py-2 text-xs font-medium">
                Sign in
              </button>
            </form>

            <div id="role-notice-container" class="mt-4 pt-4 border-t border-line text-center text-xs text-stone-500">
              <!-- Dynamically populated per tab -->
            </div>
          </div>

          <div class="text-center mt-6">
            <p class="text-[11px] text-stone-400">Secure Tuition Centre Management System</p>
          </div>
        </div>
      </div>
    `;

    const tabStudent = document.getElementById('tab-student');
    const tabTeacher = document.getElementById('tab-teacher');
    const tabPrincipal = document.getElementById('tab-principal');
    const form = document.getElementById('login-form');
    const fieldsContainer = document.getElementById('login-fields');
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('submit-login-btn');
    const noticeContainer = document.getElementById('role-notice-container');
    const exploreDemoBtn = document.getElementById('btn-explore-demo');

    if (exploreDemoBtn) {
      exploreDemoBtn.addEventListener('click', () => {
        Portal.enableDemoSession(App.selectedTab);
      });
    }

    const updateFields = () => {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';

      if (App.selectedTab === 'student') {
        fieldsContainer.innerHTML = `
          <div>
            <label for="admission-no" class="label">Admission number</label>
            <input type="text" id="admission-no" name="admissionNo" class="input uppercase tracking-wider text-xs" placeholder="e.g. S101" required autofocus autocomplete="off" />
          </div>
          <div class="mt-3">
            <label for="student-pass" class="label">Student Password / PIN (optional)</label>
            <input type="password" id="student-pass" name="studentPass" class="input text-xs" placeholder="Leave blank if using default" autocomplete="current-password" />
          </div>
        `;
        noticeContainer.innerHTML = `
          <p class="text-stone-400 text-[11px]">
            Student accounts are issued by the tuition office. Ask the office if your credentials are not accepted.
          </p>
        `;
      } else if (App.selectedTab === 'teacher') {
        fieldsContainer.innerHTML = `
          <div class="space-y-3">
            <div>
              <label for="email" class="label">Email address</label>
              <input type="email" id="email" name="email" class="input text-xs" placeholder="teacher@centre.com" required autofocus autocomplete="email" />
            </div>
            <div>
              <label for="password" class="label">Password</label>
              <input type="password" id="password" name="password" class="input text-xs" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" required autocomplete="current-password" />
            </div>
          </div>
        `;
        noticeContainer.innerHTML = `
          <p class="text-stone-400 text-[11px]">
            Teacher accounts are provisioned exclusively by the Principal in the administrative portal.
          </p>
        `;
      } else {
        fieldsContainer.innerHTML = `
          <div class="space-y-3">
            <div>
              <label for="email" class="label">Principal email address</label>
              <input type="email" id="email" name="email" class="input text-xs" placeholder="principal@centre.com" required autofocus autocomplete="email" />
            </div>
            <div>
              <label for="password" class="label">Password</label>
              <input type="password" id="password" name="password" class="input text-xs" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" required autocomplete="current-password" />
            </div>
          </div>
        `;
        noticeContainer.innerHTML = `
          <button type="button" id="btn-switch-to-bootstrap" class="text-xs text-brand hover:underline font-medium">
            First-time deployment? Initial Principal Setup &rarr;
          </button>
        `;

        const bootBtn = document.getElementById('btn-switch-to-bootstrap');
        if (bootBtn) {
          bootBtn.addEventListener('click', () => {
            App.mode = 'bootstrap';
            App.renderAuth();
          });
        }
      }
    };

    const switchTab = (tab) => {
      App.selectedTab = tab;
      [tabStudent, tabTeacher, tabPrincipal].forEach(btn => {
        btn.className = 'flex-1 py-1.5 text-xs font-medium rounded transition-colors text-center text-stone-500 hover:text-ink';
      });
      const activeBtn = tab === 'student' ? tabStudent : (tab === 'teacher' ? tabTeacher : tabPrincipal);
      activeBtn.className = 'flex-1 py-1.5 text-xs font-medium rounded transition-colors text-center bg-white text-ink shadow-sm';
      updateFields();
    };

    tabStudent.addEventListener('click', () => switchTab('student'));
    tabTeacher.addEventListener('click', () => switchTab('teacher'));
    tabPrincipal.addEventListener('click', () => switchTab('principal'));

    updateFields();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.add('hidden');
      errorEl.textContent = '';

      let email = '';
      let password = '';
      const chosenRole = App.selectedTab;

      if (chosenRole === 'student') {
        const admissionInput = document.getElementById('admission-no');
        const passInput = document.getElementById('student-pass');
        const adm = (admissionInput ? admissionInput.value : '').trim();
        const customPass = (passInput ? passInput.value : '').trim();

        if (!adm) {
          errorEl.textContent = 'Please enter your admission number.';
          errorEl.classList.remove('hidden');
          admissionInput && admissionInput.focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

        try {
          const creds = await studentSyntheticAuth(adm, customPass);
          email = creds.email;
          password = creds.password;
        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign in';
          errorEl.textContent = 'Failed to process admission credentials.';
          errorEl.classList.remove('hidden');
          return;
        }
      } else {
        const emailInput = document.getElementById('email');
        const passInput = document.getElementById('password');
        email = (emailInput ? emailInput.value : '').trim();
        password = passInput ? passInput.value : '';

        if (!email || !password) {
          errorEl.textContent = 'Please enter your email and password.';
          errorEl.classList.remove('hidden');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
      }

      try {
        const authResult = await signInWithPassword(email, password);

        const userNode = await api(`users/${authResult.uid}`, {
          noAuth: false,
          idToken: authResult.idToken
        });

        if (!userNode || !userNode.role) {
          throw new Error('User profile record not found in database.');
        }

        if (userNode.role !== chosenRole) {
          clearSession();
          throw new Error(`This account is registered as a ${userNode.role}, not a ${chosenRole}.`);
        }

        const sessionData = {
          ...authResult,
          role: userNode.role,
          name: userNode.name || '',
          studentId: userNode.studentId || null,
          teacherId: userNode.teacherId || null
        };
        saveSession(sessionData);

        toast(`Signed in as ${userNode.name || userNode.role}`, 'success');

        const defaultHash = chosenRole === 'student' ? '#/home' : '#/overview';
        router.navigate(defaultHash);
      } catch (err) {
        console.error('Sign in error:', err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';

        let displayMsg = err.message || 'Failed to sign in. Please check your credentials.';

        if (displayMsg.includes('Permission denied') || displayMsg.includes('Unauthorized')) {
          displayMsg = 'Permission denied by database security rules. Please check your account role.';
        }

        if (displayMsg.includes('INVALID_LOGIN_CREDENTIALS') || displayMsg.includes('EMAIL_NOT_FOUND') || displayMsg.includes('INVALID_PASSWORD')) {
          if (chosenRole === 'student') {
            displayMsg = 'Admission number or password not recognised. Please ask the office.';
          } else {
            displayMsg = 'Incorrect email or password.';
          }
        }

        errorEl.textContent = displayMsg;
        errorEl.classList.remove('hidden');
      }
    });
  };

  App.renderLogin = App.renderAuth;

  /**
   * App Bootstrap
   */
  App.boot = function () {
    const session = getSession();
    if (session && session.idToken) {
      Portal.session = session;
      router.init();
    } else {
      App.renderAuth();
      router.init();
    }
  };

  Portal.app = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
  } else {
    App.boot();
  }
})();
