import { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, LayoutGrid, Users, BarChart3, ClipboardList, MessageCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api';
import { Logo } from '../ui/Logo';

const NAV = {
  student: [
    { to: '/courses', label: 'Courses', icon: LayoutGrid },
    { to: '/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/tutor', label: 'Tutor', icon: MessageCircle },
  ],
  professor: [
    { to: '/courses', label: 'Courses', icon: LayoutGrid },
    { to: '/students', label: 'Students', icon: Users },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  ],
};

const pill = (isActive: boolean) =>
  `inline-flex items-center gap-2 h-10 px-4 rounded-full text-[14px] whitespace-nowrap border transition-colors ${
    isActive ? 'bg-white/15 border-white/25 text-white' : 'bg-white/[0.06] border-white/10 text-white/75 hover:bg-white/10 hover:text-white'}`;

/**
 * Dark teal header: mark left, frosted section pills centred, account right.
 * `embedded` drops the bar's own background so it can sit inside a page's gradient header.
 */
const Topbar = ({ embedded = false }: { embedded?: boolean }) => {
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
    <header
      className={`${embedded ? 'relative' : 'sticky top-0'} z-40 text-white`}
      // Same tones as the home gradient: near-navy teal on the left, lighter steel teal on the right
      style={embedded ? undefined : { background: 'linear-gradient(90deg, #0a2230 0%, #17404f 45%, #3c6f82 100%)' }}
    >
      <div className={`grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center gap-x-6 h-[72px] ${embedded ? '' : 'px-5 md:px-8'}`}>
        <Link to="/courses" className="justify-self-start text-white hover:text-accent-200 transition-colors" aria-label="Cobble home">
          <Logo markClassName="h-[22px] w-auto text-accent-200" />
        </Link>

        <nav aria-label="Main" className="hidden md:flex items-center gap-2">
          {role && NAV[role].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => pill(isActive)}>
              <Icon size={15} aria-hidden /> {label}
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
            className="flex items-center gap-3 rounded-full pl-3 pr-1 py-1 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span className="hidden sm:block text-sm text-white/80 max-w-[14rem] truncate">{user.name}</span>
            <span className="h-9 w-9 rounded-full bg-white text-accent-strong font-display text-[11px] font-semibold flex items-center justify-center ring-2 ring-white/25">{initials}</span>
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
      <nav aria-label="Main" className={`md:hidden flex gap-2 pb-3 overflow-x-auto ${embedded ? '' : 'px-4'}`}>
        {role && NAV[role].map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => pill(isActive)}>
            <Icon size={14} aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
};

export default Topbar;
