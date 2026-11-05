import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getGoogleMapsDirectionUrl } from '../../services/location.service';
import './LocationPickerModal.css';

export interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number | null;
  initialLng?: number | null;
  initialAddress?: string;
  title?: string;
  subtitle?: string;
  onSave?: (lat: number, lng: number, address: string) => void;
  readOnly?: boolean;
}

const DEFAULT_CENTER = { lat: 15.8893, lng: 108.2392 }; // Khu vực Quảng Nam / Huế / Miền Trung

function createPinIcon() {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: #dc2626;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        border: 2px solid #ffffff;
      ">
        <div style="
          width: 12px;
          height: 12px;
          background: #ffffff;
          border-radius: 50%;
          transform: rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  initialLat,
  initialLng,
  initialAddress = '',
  title = 'Chọn tọa độ vị trí trên bản đồ',
  subtitle = 'Nhấp vào bản đồ hoặc kéo ghim để chọn tọa độ chính xác',
  onSave,
  readOnly = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [lat, setLat] = useState<number>(initialLat || DEFAULT_CENTER.lat);
  const [lng, setLng] = useState<number>(initialLng || DEFAULT_CENTER.lng);
  const [address, setAddress] = useState<string>(initialAddress);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Sync props when modal opens
  useEffect(() => {
    if (isOpen) {
      const activeLat = initialLat != null ? initialLat : DEFAULT_CENTER.lat;
      const activeLng = initialLng != null ? initialLng : DEFAULT_CENTER.lng;
      setLat(activeLat);
      setLng(activeLng);
      setAddress(initialAddress || '');
    }
  }, [isOpen, initialLat, initialLng, initialAddress]);

  // Reverse Geocoding helper
  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'vi' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          setAddress(data.display_name);
        }
      }
    } catch {
      // Ignore geocoding failure silently
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Small timeout to let DOM render completely
    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const activeLat = lat || DEFAULT_CENTER.lat;
      const activeLng = lng || DEFAULT_CENTER.lng;

      const map = L.map(mapContainerRef.current, {
        center: [activeLat, activeLng],
        zoom: initialLat ? 16 : 13,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([activeLat, activeLng], {
        icon: createPinIcon(),
        draggable: !readOnly,
      }).addTo(map);

      markerRef.current = marker;

      if (!readOnly) {
        // Drag marker
        marker.on('dragend', (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          const roundedLat = parseFloat(newPos.lat.toFixed(6));
          const roundedLng = parseFloat(newPos.lng.toFixed(6));
          setLat(roundedLat);
          setLng(roundedLng);
          reverseGeocode(roundedLat, roundedLng);
        });

        // Click map to move marker
        map.on('click', (e: L.LeafletMouseEvent) => {
          const roundedLat = parseFloat(e.latlng.lat.toFixed(6));
          const roundedLng = parseFloat(e.latlng.lng.toFixed(6));
          marker.setLatLng([roundedLat, roundedLng]);
          setLat(roundedLat);
          setLng(roundedLng);
          reverseGeocode(roundedLat, roundedLng);
        });
      }

      mapInstanceRef.current = map;
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  // Center update helper
  const updateMapPosition = (newLat: number, newLng: number, zoomLevel = 16) => {
    setLat(newLat);
    setLng(newLng);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([newLat, newLng], zoomLevel, { duration: 1 });
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([newLat, newLng]);
    }
  };

  // Get Current GPS Location
  const handleGetCurrentGps = () => {
    if (!navigator.geolocation) {
      setStatusMsg('Trình duyệt không hỗ trợ xác định vị trí GPS.');
      return;
    }
    setGpsLoading(true);
    setStatusMsg('Đang lấy vị trí GPS từ thiết bị...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const userLat = parseFloat(pos.coords.latitude.toFixed(6));
        const userLng = parseFloat(pos.coords.longitude.toFixed(6));
        updateMapPosition(userLat, userLng, 17);
        reverseGeocode(userLat, userLng);
        setStatusMsg('Đã xác định vị trí hiện tại thành công.');
        setTimeout(() => setStatusMsg(null), 3000);
      },
      (err) => {
        setGpsLoading(false);
        setStatusMsg(`Không thể lấy vị trí: ${err.message}`);
        setTimeout(() => setStatusMsg(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Search Address via Nominatim
  const handleSearchAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setStatusMsg('Đang tìm kiếm địa chỉ...');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&countrycodes=vn&limit=1`,
        { headers: { 'Accept-Language': 'vi' } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        const searchLat = parseFloat(parseFloat(first.lat).toFixed(6));
        const searchLng = parseFloat(parseFloat(first.lon).toFixed(6));
        updateMapPosition(searchLat, searchLng, 16);
        setAddress(first.display_name);
        setStatusMsg(null);
      } else {
        setStatusMsg('Không tìm thấy địa điểm phù hợp. Vui lòng thử tìm kiếm khác.');
      }
    } catch {
      setStatusMsg('Lỗi kết nối khi tìm kiếm địa chỉ.');
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="location-picker-overlay" onClick={onClose}>
      <div className="location-picker-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="location-picker-header">
          <div className="location-picker-title-group">
            <div className="location-picker-icon-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <h3 className="location-picker-title">{title}</h3>
              <p className="location-picker-subtitle">{subtitle}</p>
            </div>
          </div>
          <button className="location-picker-close-btn" onClick={onClose} aria-label="Đóng">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        {!readOnly && (
          <div className="location-picker-toolbar">
            <form className="location-picker-search-box" onSubmit={handleSearchAddress}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="location-picker-search-input"
                placeholder="Nhập địa chỉ, tỉnh thành, huyện, xã để tìm kiếm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSearching}
                style={{
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isSearching ? 'Tìm...' : 'Tìm'}
              </button>
            </form>

            <button
              type="button"
              className="location-picker-gps-btn"
              onClick={handleGetCurrentGps}
              disabled={gpsLoading}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              {gpsLoading ? 'Đang định vị...' : 'Vị trí GPS của tôi'}
            </button>
          </div>
        )}

        {statusMsg && (
          <div style={{ padding: '6px 20px', background: '#eff6ff', color: '#1d4ed8', fontSize: '12.5px' }}>
            {statusMsg}
          </div>
        )}

        {/* Map Canvas */}
        <div className="location-picker-map-wrapper">
          <div ref={mapContainerRef} className="location-picker-map-canvas" />
          {!readOnly && (
            <div className="location-picker-map-tip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Nhấp vào bản đồ hoặc kéo ghim đỏ để di chuyển vị trí
            </div>
          )}
        </div>

        {/* Coordinates and Address bar */}
        <div className="location-picker-coords-bar">
          <div className="location-picker-field">
            <label>Vĩ độ (Latitude)</label>
            <input
              type="number"
              step="any"
              value={lat}
              readOnly={readOnly}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setLat(val);
                if (markerRef.current) markerRef.current.setLatLng([val, lng]);
              }}
            />
          </div>
          <div className="location-picker-field">
            <label>Kinh độ (Longitude)</label>
            <input
              type="number"
              step="any"
              value={lng}
              readOnly={readOnly}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setLng(val);
                if (markerRef.current) markerRef.current.setLatLng([lat, val]);
              }}
            />
          </div>
          <div className="location-picker-field">
            <label>Địa chỉ ghi nhận</label>
            <input
              type="text"
              value={address}
              readOnly={readOnly}
              placeholder="Nhập địa chỉ mô tả (thôn, xã, huyện, tỉnh...)"
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="location-picker-footer">
          <a
            href={getGoogleMapsDirectionUrl(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="location-picker-external-link"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Xem trước & chỉ đường trên Google Maps
          </a>

          <div className="location-picker-actions">
            <button type="button" className="location-picker-btn cancel" onClick={onClose}>
              {readOnly ? 'Đóng' : 'Hủy bỏ'}
            </button>
            {!readOnly && onSave && (
              <button
                type="button"
                className="location-picker-btn save"
                onClick={() => {
                  onSave(lat, lng, address);
                  onClose();
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Xác nhận vị trí
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;

