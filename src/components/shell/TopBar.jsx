import React from 'react';
import {
  Compass, MapPin, ChevronDown, Search, LocateFixed,
  RefreshCw, Bell, BellRing, Share2, Sun, Moon, Loader2, Satellite
} from 'lucide-react';
import { i18n } from '../../utils/i18n';

const TIME_FMT = { hour: '2-digit', minute: '2-digit' };

export function TopBar({
  location,
  onOpenSearch,
  onGpsClick,
  gpsLoading,
  isDark,
  onToggleDark,
  onRefresh,
  lastUpdated,
  notificationsEnabled,
  onRequestNotification,
  onOpenShare
}) {
  const t = i18n.id;
  const displayName = location?.name || 'Jakarta Pusat';
  const updated = lastUpdated
    ? `Diperbarui ${lastUpdated.toLocaleTimeString('id-ID', TIME_FMT)} WITA`
    : 'Menyiapkan data...';

  const iconBtn = (label, onClick, children, extra = {}) => (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={extra.className ? `topbar-icon-btn ${extra.className}` : 'topbar-icon-btn'}
      aria-pressed={extra['aria-pressed']}
    >
      {children}
    </button>
  );

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Brand */}
        <div className="topbar-brand" aria-hidden="true">
          <Compass size={20} strokeWidth={2.5} />
        </div>

        {/* Location chip: primary identity of the app */}
        <button className="city-chip" onClick={onOpenSearch} aria-label={`${t.searchCity}: ${displayName}`}>
          <MapPin size={15} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <span className="city-chip-name">{displayName}</span>
          <ChevronDown size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        </button>

        <span className="topbar-updated" aria-live="polite">
          <Satellite size={12} strokeWidth={2.5} />
          {updated}
        </span>

        {/* Actions */}
        <div className="topbar-actions">
          {iconBtn(t.searchCity, onOpenSearch, <Search size={19} strokeWidth={2.25} />)}
          {iconBtn(
            t.gps,
            onGpsClick,
            gpsLoading ? <Loader2 size={19} className="animate-spin" /> : <LocateFixed size={19} strokeWidth={2.25} />
          )}
          {iconBtn(
            notificationsEnabled ? t.notifyActive : t.notifyEnable,
            onRequestNotification,
            notificationsEnabled
              ? <BellRing size={19} strokeWidth={2.25} className="topbar-btn-live" />
              : <Bell size={19} strokeWidth={2.25} />,
            { 'aria-pressed': notificationsEnabled }
          )}
          {iconBtn(t.refresh, onRefresh, <RefreshCw size={19} strokeWidth={2.25} />, { className: 'topbar-wide-only' })}
          {iconBtn(t.share, onOpenShare, <Share2 size={19} strokeWidth={2.25} />, { className: 'topbar-wide-only' })}
          {iconBtn(
            t.themeToggle,
            onToggleDark,
            isDark ? <Sun size={19} strokeWidth={2.25} /> : <Moon size={19} strokeWidth={2.25} />
          )}
        </div>
      </div>
    </header>
  );
}
