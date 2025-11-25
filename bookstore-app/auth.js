// Client-side auth that communicates with the Node/Express backend
(function(){
    function updateAuthLink(){
        const authEl = document.getElementById('auth-link');
        if(!authEl) return;
        fetch('/api/session', {credentials: 'same-origin'}).then(r=>r.json()).then(data=>{
            if(data && data.user){
                authEl.innerHTML = ` <a href="#" id="logout-link">Logout (${data.user.username})</a>`;
                const logoutLink = document.getElementById('logout-link');
                if(logoutLink){
                    logoutLink.addEventListener('click', function(e){ e.preventDefault(); logout(); });
                }
            } else {
                authEl.innerHTML = `<a href="login.html">Login</a>`;
            }
        }).catch(()=>{ authEl.innerHTML = `<a href="login.html">Login</a>`; });
    }

    async function login(username, password){
        const resp = await fetch('/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ username, password })
        });
        if(resp.ok) return resp.json();
        const err = await resp.json().catch(()=>({ error: 'Login failed' }));
        throw new Error(err.error || 'Login failed');
    }

    async function logout(){
        await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(()=>null);
        updateAuthLink();
        window.location.href = 'index.html';
    }

    function requireAuth(){
        // synchronous guard is not possible without blocking; use a quick fetch
        fetch('/api/session', { credentials: 'same-origin' }).then(r=>r.json()).then(data=>{
            if(!data || !data.user){
                const next = encodeURIComponent(window.location.pathname.split('/').pop() || 'index.html');
                window.location.href = `login.html?next=${next}`;
            }
        }).catch(()=>{
            const next = encodeURIComponent(window.location.pathname.split('/').pop() || 'index.html');
            window.location.href = `login.html?next=${next}`;
        });
    }

    // Wire up login form if present
    document.addEventListener('DOMContentLoaded', function(){
        updateAuthLink();
        const form = document.getElementById('login-form');
        if(form){
            form.addEventListener('submit', async function(e){
                e.preventDefault();
                const u = document.getElementById('username').value.trim();
                const p = document.getElementById('password').value;
                const err = document.getElementById('login-error');
                try{
                    await login(u,p);
                    const params = new URLSearchParams(window.location.search);
                    const next = params.get('next') || 'index.html';
                    window.location.href = next;
                } catch(ex){
                    if(err) err.textContent = ex.message || 'Invalid username or password';
                }
            });
        }

        // If on protected pages, enforce auth
        const protectedPages = ['inventory.html', 'supplier_sync'];
        const current = window.location.pathname.split('/').pop();
        if(protectedPages.includes(current) || window.location.pathname.indexOf('supplier_sync')!==-1){
            requireAuth();
        }
    });

    window.bookAuth = { login, logout, requireAuth };
})();
