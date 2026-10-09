import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { TopBar } from './components/shell/TopBar';
import { NavBar } from './components/shell/NavBar';
import { SectionKicker } from './components/shell/SectionKicker';
import { EcoHealthCard } from './components/cards/EcoHealthCard';
import { AqiCard } from './components/cards/AqiCard';
import { WeatherCard } from './components/cards/WeatherCard';
import { EarthquakeCard } from './components/cards/EarthquakeCard';
import { UvCard } from './components/cards/UvCard';
import { VolcanoCard } from './components/cards/VolcanoCard';
import { KarhutlaCard } from './components/cards/KarhutlaCard';
import { fetchKarhutlaData } from './services/karhutla';
import { refreshVolcanoStatuses } from './services/volcano';
import { Footer } from './components/common/Footer';
import { WidgetEmbedView } from './components/embed/WidgetEmbedView';
import { INDONESIA_CITIES } from './utils/cities';
import { apiCache } from './utils/apiCache';
import { useGeolocation } from './hooks/useGeolocation';
import { useDarkMode } from './hooks/useDarkMode';
import { triggerHaptic } from './utils/haptics';
import { registerDisasterPush } from './utils/push';
import { playDisasterAlarm } from './utils/alarm';
import { fetchWeatherData } from './services/weather';
import { fetchAirQualityData } from './services/airQuality';
import { fetchLatestEarthquake, fetchRecentEarthquakes } from './services/bmkg';
import { i18n } from './utils/i18n';
import { Download, AlertTriangle, X, Loader2, WifiOff } from 'lucide-react';

// Lazy load heavy components for peak initial load speed & performance
const AqiChart = lazy(() =>
  import('./components/charts/AqiChart').then((m) => ({ default: m.AqiChart }))
);
const WeatherForecastChart = lazy(() =>
  import('./components/charts/WeatherForecastChart').then((m) => ({
    default: m.WeatherForecastChart
  }))
);
const IndonesiaMap = lazy(() =>
  import('./components/map/IndonesiaMap').then((m) => ({ default: m.IndonesiaMap }))
);
const CitySearchModal = lazy(() =>
  import('./components/common/CitySearchModal').then((m) => ({ default: m.CitySearchModal }))
);
const ShareCardModal = lazy(() =>
  import('./components/common/ShareCardModal').then((m) => ({ default: m.ShareCardModal }))
);
const EmergencyGuidePanel = lazy(() =>
  import('./components/common/EmergencyGuideModal').then((m) => ({
    default: m.EmergencyGuidePanel
  }))
);
const KarhutlaListModal = lazy(() =>
  import('./components/common/KarhutlaListModal').then((m) => ({
    default: m.KarhutlaListModal
  }))
);
const VolcanoListModal = lazy(() =>
  import('./components/common/VolcanoListModal').then((m) => ({
    default: m.VolcanoListModal
  }))
);
const EmbedWidgetModal = lazy(() =>
  import('./components/common/EmbedWidgetModal').then((m) => ({
    default: m.EmbedWidgetModal
  }))
);

// Loading Fallback Component
function ComponentSkeleton({ height = '200px', label = 'Memuat komponen...' }) {
  return (
    <div
      style={{
        minHeight: height,
        backgroundColor: 'var(--bg-card)',
        border: '2px solid var(--border-color, #e5e7eb)',
        borderRadius: 'var(--radius-lg, 12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        color: 'var(--text-muted, #6b7280)',
        fontSize: '0.85rem',
        fontWeight: '600'
      }}
    >
      <Loader2 size={24} className="animate-spin" color="var(--color-primary, #3b82f6)" />
      <span>{label}</span>
    </div>
  );
}

export function App() {
  const { isDark, toggleDarkMode } = useDarkMode();
  const { location, selectCity, requestGpsLocation, gpsLoading } = useGeolocation();

  const [weatherData, setWeatherData] = useState(null);
  const [airQualityData, setAirQualityData] = useState(null);
  const [latestEarthquake, setLatestEarthquake] = useState(null);
  const [recentEarthquakes, setRecentEarthquakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Language state: 'id' or 'en'
  const t = i18n.id;
// Embed mode check
  const isEmbedMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === 'true';
  const cityParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('city') : null;

  useEffect(() => {
    if (cityParam) {
      const match = INDONESIA_CITIES.find(
        (c) => c.name.toLowerCase() === cityParam.toLowerCase() ||
               c.name.toLowerCase().includes(cityParam.toLowerCase()) ||
               cityParam.toLowerCase().includes(c.name.toLowerCase())
      );
      if (match && (match.lat !== location.lat || match.lon !== location.lon)) {
        selectCity(match);
      }
    }
  }, [cityParam]);


  // Modals
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isVolcanoOpen, setIsVolcanoOpen] = useState(false);
  const [isKarhutlaOpen, setIsKarhutlaOpen] = useState(false);
  const [karhutlaData, setKarhutlaData] = useState(null);
  // Tick untuk re-render setelah status gunung api live termuat
  const [volcanoStatusTick, setVolcanoStatusTick] = useState(0);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);

  // Navigasi utama: Beranda / Peta / Panduan
  const [activeView, setActiveView] = useState('home');

  // PWA Prompt
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showPwaBanner, setShowPwaBanner] = useState(true);

  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const lastQuakeIdRef = useRef(null);
  // Online / Offline Status
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Koneksi kembali: langsung sedot data terbaru (mode siaga terbatas)
      loadData(true);
      // Daftarkan background sync: begitu sinyal hidup lagi di lain waktu
      // (bahkan aplikasi tertutup), service worker menyegarkan cache otomatis
      navigator.serviceWorker?.ready
        .then((reg) => reg.sync?.register('geosiaga-refresh'))
        .catch(() => {});
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic background sync (PWA terpasang di Chrome/Android):
  // cache data bencana disegarkan tiap beberapa jam tanpa membuka aplikasi
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) =>
          reg.periodicSync?.register('geosiaga-refresh', { minInterval: 6 * 60 * 60 * 1000 })
        )
        .catch(() => {});
    }
  }, []);

  // Dynamic SEO Title & Meta Tag Synchronization
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const aqiStr = airQualityData?.current?.aqi ? `AQI ${airQualityData.current.aqi}` : 'Real-Time';
      document.title = `GeoSiaga: ${location.name} • ${aqiStr} & Cuaca BMKG`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          'content',
          `Pantauan kualitas udara (${aqiStr}), suhu ${weatherData?.current?.temp || 29}°C, gempa BMKG & karhutla di ${location.name}, ${location.province}.`
        );
      }
    }
  }, [location.name, location.province, airQualityData?.current?.aqi, weatherData?.current?.temp]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if ('serviceWorker' in navigator) {
      if (import.meta.env.PROD) {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.log('SW error:', err);
        });
      } else {
        // Unregister SW in development to prevent stale caches
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) reg.unregister();
        });
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPwa = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleRequestNotification = async () => {
    if (!('Notification' in window)) {
      alert('Browser ini tidak mendukung notifikasi Web.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setNotificationsEnabled(true);
      // Daftar ke server peringatan dini berbasis daerah (kota saat ini)
      const result = location?.name
        ? await registerDisasterPush(location)
        : { ok: false, reason: 'no-city' };
      new Notification('GeoSiaga Aktif', {
        body: result.ok
          ? `Peringatan dini untuk wilayah ${location.name} aktif. Anda akan menerima notifikasi gempa, hujan ekstrem, dan karhutla di sekitar daerah Anda.`
          : 'Notifikasi aktif di aplikasi. Pilih kota Anda agar peringatan dini berbasis daerah bisa berjalan.',
        icon: '/leaf.svg'
      });
    }
  };

    // Load Nationwide Earthquake Data on mount or manual refresh
  const loadEarthquakeData = async (force = false) => {
    try {
      const [quake, quakeList] = await Promise.all([
        fetchLatestEarthquake(force),
        fetchRecentEarthquakes(force)
      ]);
      if (quake) {
        const isNew = lastQuakeIdRef.current !== null && lastQuakeIdRef.current !== quake.dateTime;
        lastQuakeIdRef.current = quake.dateTime;
        setLatestEarthquake(quake);
        // Alarm in-app: gempa baru M>=5.0 saat aplikasi terbuka
        if (
          isNew &&
          quake.magnitude >= 5 &&
          notificationsEnabled &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          playDisasterAlarm();
          new Notification(`🚨 Gempa M${quake.magnitude.toFixed(1)} — ${quake.wilayah}`, {
            body: `Kedalaman ${quake.depth} • ${quake.potensi}. Buka GeoSiaga untuk detail & panduan darurat.`,
            icon: '/leaf.svg',
            tag: 'gempa-terbaru'
          });
        }
      }
      if (quakeList && quakeList.length > 0) setRecentEarthquakes(quakeList);
    } catch (err) {
      console.warn('Earthquake fetch error:', err);
    }
  };

  useEffect(() => {
    loadEarthquakeData();
    // Status aktivitas gunung api real-time dari MAGMA ESDM (via /api/volcanoes)
    refreshVolcanoStatuses().then(() => setVolcanoStatusTick((n) => n + 1));
  }, []);

  // Load City-Specific Data (Weather, AQI, Karhutla) with Instant SWR Cache
  const loadData = async (force = false) => {
    // 1. Check synchronous cache first for instant 0ms UI render
    const safeLat = Number(location?.lat) || -6.1805;
    const safeLon = Number(location?.lon) || 106.8284;
    const cachedWeather = apiCache.get(`weather_${safeLat.toFixed(3)}_${safeLon.toFixed(3)}`);
    const cachedAqi = apiCache.get(`aqi_${safeLat.toFixed(3)}_${safeLon.toFixed(3)}`);

    if (cachedWeather && cachedAqi && !force) {
      setWeatherData(cachedWeather);
      setAirQualityData(cachedAqi);
      fetchKarhutlaData(location.lat, location.lon, cachedWeather, false).then(setKarhutlaData);
      setLoading(false);
      // Revalidate in background silently
      Promise.all([
        fetchWeatherData(location.lat, location.lon, true),
        fetchAirQualityData(location.lat, location.lon, true)
      ]).then(([freshWeather, freshAqi]) => {
        if (freshWeather) setWeatherData(freshWeather);
        if (freshAqi) setAirQualityData(freshAqi);
        fetchKarhutlaData(location.lat, location.lon, freshWeather, true).then(setKarhutlaData);
        setLastUpdated(new Date());
      }).catch(() => {});
      return;
    }

    // 2. If not in cache or forced, show loading and fetch parallel
    setLoading(true);
    try {
      const [weather, aqi] = await Promise.all([
        fetchWeatherData(location.lat, location.lon, force),
        fetchAirQualityData(location.lat, location.lon, force)
      ]);

      if (weather) setWeatherData(weather);
      if (aqi) setAirQualityData(aqi);

      const karhutla = await fetchKarhutlaData(location.lat, location.lon, weather, force);
      setKarhutlaData(karhutla);
      setLastUpdated(new Date());

      if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
        if (aqi?.current?.aqi > 150) {
          new Notification('Peringatan Polusi Udara', {
            body: `AQI di ${location.name} mencapai ${aqi.current.aqi} (Tidak Sehat).`,
            icon: '/leaf.svg'
          });
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [location?.lat, location?.lon]);

  // Saat kota berganti, perbarui langganan push ke daerah baru
  useEffect(() => {
    if (notificationsEnabled && location?.name && typeof location.lat === 'number') {
      registerDisasterPush(location).catch(() => {});
    }
  }, [notificationsEnabled, location?.lat, location?.lon, location?.name]);

  // Touch Pull-to-Refresh on Mobile
  const [touchStart, setTouchStart] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  const handleTouchStart = (e) => {
    if (window.scrollY === 0 && e.touches.length === 1) {
      setTouchStart(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e) => {
    if (touchStart > 0 && window.scrollY === 0) {
      const dist = e.touches[0].clientY - touchStart;
      if (dist > 70) {
        setIsPulling(true);
      }
    }
  };

  const handleTouchEnd = () => {
    if (isPulling) {
      triggerHaptic(20);
      handleManualRefresh();
    }
    setTouchStart(0);
    setIsPulling(false);
  };

  const handleManualRefresh = () => {
    triggerHaptic(15);
    loadEarthquakeData(true);
    loadData(true);
  };

  const handleFocusQuake = (quake) => {
    if (quake && quake.lat && quake.lon) {
      selectCity({
        name: `Lokasi Gempa (${quake.magnitude} SR)`,
        province: quake.wilayah,
        lat: quake.lat,
        lon: quake.lon
      });
    }
  };

  // Alerts
  const currentAqi = airQualityData?.current?.aqi || 0;
  const isAqiAlert = currentAqi > 150;
  const isQuakeAlert = latestEarthquake && latestEarthquake.magnitude >= 5.5;

  if (isEmbedMode) {
    return (
      <WidgetEmbedView
        location={location}
        weatherData={weatherData}
        airQualityData={airQualityData}
        loading={loading}
        onRefresh={handleManualRefresh}
      />
    );
  }

  const handleViewChange = (view) => {
    if (view === activeView) return;
    triggerHaptic(10);
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  return (
    <div
      className="app-shell"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <TopBar
        location={location}
        onOpenSearch={() => setIsSearchOpen(true)}
        onGpsClick={requestGpsLocation}
        gpsLoading={gpsLoading}
        isDark={isDark}
        onToggleDark={toggleDarkMode}
        onRefresh={handleManualRefresh}
        lastUpdated={lastUpdated}
        notificationsEnabled={notificationsEnabled}
        onRequestNotification={handleRequestNotification}
        onOpenShare={() => setIsShareOpen(true)}
      />

      <NavBar activeView={activeView} onChangeView={handleViewChange} />

      {/* Lazy Loaded City Search Modal */}
      {isSearchOpen && (
        <Suspense fallback={null}>
          <CitySearchModal
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            onSelectCity={selectCity}
            currentCity={location}
          />
        </Suspense>
      )}

      {/* Lazy Loaded Share Card Modal */}
      {isShareOpen && (
        <Suspense fallback={null}>
          <ShareCardModal
            isOpen={isShareOpen}
            onClose={() => setIsShareOpen(false)}
            location={location}
            airQualityData={airQualityData}
            weatherData={weatherData}
            latestEarthquake={latestEarthquake}
            karhutlaData={karhutlaData}
          />
        </Suspense>
      )}


      {/* Lazy Loaded Embed Widget Modal */}
      {isWidgetOpen && (
        <Suspense fallback={null}>
          <EmbedWidgetModal
            isOpen={isWidgetOpen}
            onClose={() => setIsWidgetOpen(false)}
            location={location}
            airQualityData={airQualityData}
            weatherData={weatherData}
          />
        </Suspense>
      )}

      
      {/* Lazy Loaded Karhutla Hotspot Modal */}
      {isKarhutlaOpen && (
        <Suspense fallback={null}>
          <KarhutlaListModal
            isOpen={isKarhutlaOpen}
            onClose={() => setIsKarhutlaOpen(false)}
            userLocation={location}
            hotspots={karhutlaData?.allHotspots || []}
            unavailable={karhutlaData ? karhutlaData.available !== true : false}
            error={karhutlaData?.error || null}
          />
        </Suspense>
      )}

      {/* Lazy Loaded Volcano List Modal */}
      {isVolcanoOpen && (
        <Suspense fallback={null}>
          <VolcanoListModal
            isOpen={isVolcanoOpen}
            onClose={() => setIsVolcanoOpen(false)}
            userLocation={location}
          />
        </Suspense>
      )}


      <main className="shell-main">

        {activeView === 'home' && (
          <div className="view view-home">

      {/* PWA Install Banner */}
      {installPrompt && showPwaBanner && (
        <div className="pwa-banner animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Download size={18} color="var(--color-primary)" />
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
              Pasang aplikasi GeoSiaga di layar utama HP Anda untuk akses instan & offline.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={handleInstallPwa}
              className="flat-btn-primary"
              style={{ minHeight: '36px', padding: '6px 14px', fontSize: '0.8rem' }}
            >
              {t.pwaInstall || 'Pasang Aplikasi'}
            </button>
            <button
              onClick={() => setShowPwaBanner(false)}
              aria-label="Tutup"
              className="flat-btn-secondary"
              style={{ minHeight: '36px', padding: '6px 10px' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Offline Mode Indicator */}
      {!isOnline && (
        <div style={{
          backgroundColor: '#92400e',
          color: '#fef3c7',
          padding: '0.55rem 1rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          fontSize: '0.8rem',
          fontWeight: '700'
        }}>
          <WifiOff size={16} />
          <span>Mode Offline: Menampilkan data cache lokal terakhir.</span>
        </div>
      )}

      {/* Critical Alert Banner */}
      {(isAqiAlert || isQuakeAlert) && (
        <div className="alert-banner animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertTriangle size={20} color="var(--color-danger)" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.85rem', color: 'var(--color-danger)', display: 'block' }}>
                {isAqiAlert ? t.alertAqiTitle : t.alertQuakeTitle}
              </strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: '600' }}>
                {isAqiAlert
                  ? `${t.alertAqiDesc} (AQI: ${currentAqi})`
                  : `Gempa M ${latestEarthquake?.magnitude} terjadi di ${latestEarthquake?.wilayah}.`}
              </span>
            </div>
          </div>
        </div>
      )}

            <EcoHealthCard
              aqiData={airQualityData}
              weatherData={weatherData}
              loading={loading}
            />

            <section className="feed-section">
              <SectionKicker
                number="01"
                title="Lingkungan Sekitar"
                hint="Kualitas udara, cuaca, dan sinar UV di lokasi pantauan."
              />
              <div className="feed-row">
                <AqiCard data={airQualityData} loading={loading} />
                <WeatherCard data={weatherData} locationName={location.name} loading={loading} />
                <UvCard uvIndex={weatherData?.current?.uvIndex || 0} loading={loading} />
              </div>
            </section>

            <section className="feed-section">
              <SectionKicker
                number="02"
                title="Kesiapsiagaan Bencana"
                hint="Gempa terbaru BMKG, sebaran titik api, dan gunung api terdekat."
              />
              <div className="feed-stack">
                <EarthquakeCard
                  earthquake={latestEarthquake}
                  recentQuakes={recentEarthquakes}
                  onFocusQuake={handleFocusQuake}
                  loading={loading}
                />
                <KarhutlaCard
                  karhutlaData={karhutlaData}
                  airQualityData={airQualityData}
                  location={location}
                  onOpenModal={() => setIsKarhutlaOpen(true)}
                  loading={loading}
                />
                <VolcanoCard
                  location={location}
                  onOpenModal={() => setIsVolcanoOpen(true)}
                />
              </div>
            </section>

            <section className="feed-section">
              <SectionKicker
                number="03"
                title="Tren & Prakiraan"
                hint="Pergerakan ISPU 24 jam terakhir dan prakiraan cuaca seminggu ke depan."
              />
              <div className="feed-grid-2">
                <Suspense fallback={<ComponentSkeleton height="240px" label="Memuat Grafik Tren AQI..." />}>
                  <AqiChart hourlyData={airQualityData?.hourly} />
                </Suspense>
                <Suspense fallback={<ComponentSkeleton height="260px" label="Memuat Prakiraan Cuaca 7 Hari..." />}>
                  <WeatherForecastChart dailyData={weatherData?.daily} />
                </Suspense>
              </div>
            </section>

            <Footer onOpenWidget={() => setIsWidgetOpen(true)} />
          </div>
        )}

        {activeView === 'map' && (
          <div className="view view-map">
            <div className="map-view-head">
              <span className="map-view-kicker">Peta Pantauan</span>
              <p>Gempa BMKG terkini, titik api NASA FIRMS, dan kota pantauan. Sentuh ikon untuk pindah lokasi.</p>
            </div>
            <div className="map-view-frame">
              <Suspense fallback={<ComponentSkeleton height="100%" label="Memuat Peta Interaktif Indonesia..." />}>
                <IndonesiaMap
                  currentLocation={location}
                  earthquakes={recentEarthquakes}
                  hotspots={karhutlaData?.allHotspots || []}
                  onSelectCity={selectCity}
                />
              </Suspense>
            </div>
          </div>
        )}

        {activeView === 'guide' && (
          <div className="view view-guide">
            <Suspense fallback={<ComponentSkeleton height="420px" label="Memuat Panduan Kesiapsiagaan..." />}>
              <EmergencyGuidePanel />
            </Suspense>
          </div>
        )}

      </main>

      <Analytics />
    </div>
  );
}

export default App;
