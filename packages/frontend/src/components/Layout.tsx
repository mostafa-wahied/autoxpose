import { Link, Outlet, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/services', label: 'Services' },
  { path: '/settings', label: 'Settings' },
];

export function Layout(): JSX.Element {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-neutral-50">
      <nav className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center justify-between">
            <span className="text-lg font-medium tracking-tight">autoxpose</span>
            <div className="flex gap-6">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm ${
                    location.pathname === item.path
                      ? 'text-neutral-900'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
