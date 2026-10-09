import React from 'react';
import { Home, Map, ShieldAlert } from 'lucide-react';

const TABS = [
  { id: 'home', label: 'Beranda', Icon: Home },
  { id: 'map', label: 'Peta', Icon: Map },
  { id: 'guide', label: 'Panduan', Icon: ShieldAlert }
];

/**
 * App navigation. One component, two postures:
 * - Mobile (<900px): fixed bottom tab bar, thumb reach, 3 labeled tabs.
 * - Wide (>=900px): fixed left vertical rail, same tabs.
 */
export function NavBar({ activeView, onChangeView }) {
  return (
    <nav className="shell-nav" aria-label="Navigasi utama">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeView === id;
        return (
          <button
            key={id}
            onClick={() => onChangeView(id)}
            className={`shell-nav-btn${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2.1} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
