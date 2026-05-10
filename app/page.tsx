"use client";
import { useEffect, useRef, useState } from "react";

interface Record {
  id: string;
  lat: number;
  lng: number;
  download: number;
  upload: number;
  timestamp: string;
  address?: string;
}

const getColor = (speed: number) => {
  if (speed >= 10) return "#00d4aa";
  if (speed >= 3) return "#f59e0b";
  return "#ff6b6b";
};

const getLabel = (speed: number) => {
  if (speed >= 10) return "빠름";
  if (speed >= 3) return "보통";
  return "느림";
};

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [measuring, setMeasuring] = useState(false);
  const [status, setStatus] = useState("측정 버튼을 눌러주세요.");
  const [currentSpeed, setCurrentSpeed] = useState<{ download: number; upload: number } | null>(null);
  const [savedLocation, setSavedLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("signal-records");
    if (saved) setRecords(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      const map = L.map(mapRef.current!).setView([37.5665, 126.9780], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);
      mapInstanceRef.current = map;
    });
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      const map = mapInstanceRef.current;
      map.eachLayer((layer: any) => {
        if (layer instanceof L.CircleMarker) map.removeLayer(layer);
      });
      records.forEach((r) => {
        L.circleMarker([r.lat, r.lng], {
          radius: 10,
          fillColor: getColor(r.download),
          color: "white",
          weight: 1.5,
          fillOpacity: 0.85,
        })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:sans-serif;font-size:13px;min-width:160px;">
              <div style="font-weight:600;margin-bottom:6px;">${getLabel(r.download)}</div>
              <div>⬇ 다운: <b>${r.download.toFixed(1)} Mbps</b></div>
              <div>⬆ 업로드: <b>${r.upload.toFixed(1)} Mbps</b></div>
              <div style="color:#888;margin-top:6px;font-size:11px;">${r.timestamp}</div>
              ${r.address ? `<div style="color:#888;font-size:11px;">${r.address}</div>` : ""}
            </div>
          `);
      });
    });
  }, [records]);

  const measureDownload = async (): Promise<number> => {
    const url = `https://speed.cloudflare.com/__down?bytes=5000000&_=${Date.now()}`;
    const start = performance.now();
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const elapsed = (performance.now() - start) / 1000;
    const mbps = (buffer.byteLength * 8) / 1_000_000 / elapsed;
    return Math.round(mbps * 10) / 10;
  };

  const measureUpload = async (): Promise<number> => {
    const data = new Uint8Array(2 * 1024 * 1024);
    const url = `https://speed.cloudflare.com/__up?_=${Date.now()}`;
    const start = performance.now();
    try {
      await fetch(url, { method: "POST", body: data });
    } catch {}
    const elapsed = (performance.now() - start) / 1000;
    const mbps = (data.byteLength * 8) / 1_000_000 / elapsed;
    return Math.round(mbps * 10) / 10;
  };

  // 위치 저장 함수 (measure 함수 밖)
  const saveLocation = async () => {
    setMeasuring(true);
    setStatus("📍 위치 저장 중...");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      setSavedLocation({ lat, lng });
      setStatus(`✅ 위치 저장됨! 이제 지하에서 속도 측정하세요.`);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 15);
      }
    } catch (e: any) {
      setStatus(`❌ 위치 저장 실패. 위치 권한을 허용해주세요.`);
    } finally {
      setMeasuring(false);
    }
  };

  // CSV 내보내기 함수 (measure 함수 밖)
  const exportCSV = () => {
    const header = "시간,위도,경도,다운로드(Mbps),업로드(Mbps),상태\n";
    const rows = records.map((r) =>
      `${r.timestamp},${r.lat},${r.lng},${r.download},${r.upload},${getLabel(r.download)}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signal-checker-${new Date().toLocaleDateString("ko-KR")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const measure = async () => {
    setMeasuring(true);
    setCurrentSpeed(null);

    try {
      let lat: number, lng: number;

      if (savedLocation) {
        lat = savedLocation.lat;
        lng = savedLocation.lng;
        setStatus("⬇ 저장된 위치로 다운로드 측정 중...");
      } else {
        setStatus("📍 위치 가져오는 중...");
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }

      setStatus("⬇ 다운로드 속도 측정 중...");
      const download = await measureDownload();

      setStatus("⬆ 업로드 속도 측정 중...");
      const upload = await measureUpload();

      const now = new Date();
      const record: Record = {
        id: Date.now().toString(),
        lat, lng, download, upload,
        timestamp: now.toLocaleString("ko-KR"),
      };

      const newRecords = [record, ...records];
      setRecords(newRecords);
      localStorage.setItem("signal-records", JSON.stringify(newRecords));

      setCurrentSpeed({ download, upload });
      setStatus(`✅ 측정 완료! ${getLabel(download)}`);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 15);
      }
    } catch (e: any) {
      setStatus(`❌ ${e.message || "측정 실패. 위치 권한을 허용해주세요."}`);
    } finally {
      setMeasuring(false);
    }
  };

  const deleteRecord = (id: string) => {
    const newRecords = records.filter((r) => r.id !== id);
    setRecords(newRecords);
    localStorage.setItem("signal-records", JSON.stringify(newRecords));
  };

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0a0f" }}>

      {/* 헤더 */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#e8e8f0" }}>📶 Signal Checker</h1>
          <p style={{ fontSize: 12, color: "#7a7a9a", marginTop: 2 }}>GPS 기반 인터넷 속도 기록</p>
        </div>
        <div style={{ fontSize: 12, color: "#7a7a9a" }}>기록 {records.length}개</div>
      </div>

      {/* 지도 */}
      <div ref={mapRef} style={{ flex: 1, minHeight: 300 }} />

      {/* 측정 패널 */}
      <div style={{ background: "#111118", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "16px 20px" }}>

        {/* 현재 속도 */}
        {currentSpeed && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "#15151f", padding: "12px 16px", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#7a7a9a", marginBottom: 4 }}>⬇ 다운로드</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: getColor(currentSpeed.download) }}>{currentSpeed.download}</div>
              <div style={{ fontSize: 11, color: "#7a7a9a" }}>Mbps</div>
            </div>
            <div style={{ background: "#15151f", padding: "12px 16px", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#7a7a9a", marginBottom: 4 }}>⬆ 업로드</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: getColor(currentSpeed.upload) }}>{currentSpeed.upload}</div>
              <div style={{ fontSize: 11, color: "#7a7a9a" }}>Mbps</div>
            </div>
          </div>
        )}

        {/* 저장된 위치 표시 */}
        {savedLocation && (
          <div style={{ fontSize: 12, color: "#00a886", marginBottom: 10, textAlign: "center" }}>
            📍 저장된 위치: {savedLocation.lat.toFixed(4)}, {savedLocation.lng.toFixed(4)}
            <button onClick={() => setSavedLocation(null)}
              style={{ background: "none", border: "none", color: "#7a7a9a", cursor: "pointer", marginLeft: 8, fontSize: 12 }}>
              ✕ 초기화
            </button>
          </div>
        )}

        {/* 상태 */}
        <div style={{ fontSize: 13, color: "#a0a0c0", marginBottom: 12, textAlign: "center" }}>{status}</div>

        {/* 측정 버튼 두 개 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <button onClick={saveLocation} disabled={measuring}
            style={{ padding: "14px", background: measuring ? "#3a3a5c" : "#00a886", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: measuring ? "not-allowed" : "pointer", transition: "background 0.2s" }}>
            📍 위치 저장
          </button>
          <button onClick={measure} disabled={measuring}
            style={{ padding: "14px", background: measuring ? "#3a3a5c" : "#6c63ff", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: measuring ? "not-allowed" : "pointer", transition: "background 0.2s" }}>
            📶 속도 측정
          </button>
        </div>

        {/* 기록 목록 */}
        {records.length > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#7a7a9a", letterSpacing: "0.1em", textTransform: "uppercase" }}>최근 기록</div>
              <button onClick={exportCSV}
                style={{ background: "rgba(108,99,255,0.15)", border: "1px solid rgba(108,99,255,0.3)", color: "#6c63ff", borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>
                CSV 내보내기
              </button>
            </div>
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {records.slice(0, 10).map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: getColor(r.download), flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, color: "#e8e8f0" }}>⬇ {r.download} / ⬆ {r.upload} Mbps</span>
                    <span style={{ fontSize: 11, color: "#7a7a9a", marginLeft: 8 }}>{r.timestamp}</span>
                  </div>
                  <button onClick={() => deleteRecord(r.id)}
                    style={{ background: "none", border: "none", color: "#7a7a9a", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}