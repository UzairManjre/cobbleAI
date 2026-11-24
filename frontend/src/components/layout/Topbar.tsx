import { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api';
import { Logo } from '../ui/Logo';

const NAV = {
  student: [
    { to: '/courses', label: 'Courses' },
    { to: '/assignments', label: 'Assignments' },
    { to: '/tutor', label: 'Tutor' },
  ],
  professor: [
    { to: '/courses', label: 'Courses' },
    { to: '/students', label: 'Students' },
    { to: '/analytics', label: 'Analytics' },
  ],
};

/** Three zones, like a printed running head: mark left, sections centred, account right. */
const Topbar = () => {
  const { role, token, logout } = useAuthStore();
  const [user, setUser] = useState<{ name?: string; email?: string }>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    authApi.getCurrentUser()
      .then(res => setUser({ name: res.data?.name, email: res.data?.email }))
      .catch(err => console.error('Failed to fetch user in Topbar:', err));
  }, [token]);

  // Close the account menu on an outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  // A full page load, not navigate(): a client-side move raced the route guards (no token -> /signin,
  // "/" while signed in -> /courses). Reloading also clears every in-memory store (concept map, chats).
  const signOut = () => {
    logout();
    window.location.replace('/');
  };

  const displayName = user.name || 'Account';
  const initials = displayName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-sm border-b border-line">
      <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center gap-x-6 px-5 md:px-8 h-16">
        <Link to="/courses" className="justify-self-start text-ink hover:text-accent transition-colors" aria-label="Cobble home">
          <Logo markClassName="h-[22px] w-auto text-accent" />
        </Link>

        <nav aria-label="Main" className="hidden md:flex items-center gap-1 font-display text-[15px] tracking-[-0.015em]">
          {role && NAV[role].map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative px-3.5 py-2 rounded-full transition-colors ${isActive ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {isActive && <span aria-hidden className="absolute left-1/2 -bottom-[13px] -translate-x-1/2 h-[2px] w-5 bg-accent" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="justify-self-end relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-3 rounded-full pl-3 pr-1 py-1 hover:bg-sunken transition-colors cursor-pointer"
          >
            <span className="hidden sm:block text-sm text-ink-3 max-w-[14rem] truncate">{user.name}</span>
            <span className="h-8 w-8 rounded-full bg-ink text-white font-display text-[11px] font-semibold flex items-center justify-center">{initials}</span>
          </button>

          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] z-50">
              <div className="px-3 py-2.5 border-b border-line mb-1">
                <div className="text-sm text-ink truncate">{displayName}</div>
                <div className="text-xs text-ink-3 truncate">{user.email}</div>
                <div className="annot text-accent mt-2">{role}</div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-ink-2 hover:bg-sunken cursor-pointer"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Small screens: the sections sit on their own row */}
      <nav aria-label="Main" className="md:hidden flex gap-1 px-3 pb-2 overflow-x-auto font-display text-sm">
        {role && NAV[role].map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `px-3 py-1.5 rounded-full whitespace-nowrap ${isActive ? 'bg-ink text-white' : 'text-ink-3'}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
};

export default Topbar;
