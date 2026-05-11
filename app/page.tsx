"use client";
import { useEffect, useRef, useState } from "react";

interface Record {
  id: string;
  lat: number;
  lng: number;
  download: number;
  upload: number;
  timestamp: string;
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
  const [status, setStatus] = useState("지도를 이동하거나 GPS로 위치를 잡아주세요.");
  const [currentSpeed, setCurrentSpeed] = useState<{ download: number; upload: number } | null>(null);
  const [setSavedLocation] = useState<{ lat: number; lng: number } | null>(null);

  // 로컬스토리지에서 기록 불러오기
  useEffect(() => {
    const saved = localStorage.getItem("signal-records");
    if (saved) setRecords(JSON.parse(saved));
  }, []);

  // 지도 초기화
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

  // 기록 변경 시 마커 업데이트
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
              <div style="font-weight:600;margin-bottom:6px;color:${getColor(r.download)}">${getLabel(r.download)}</div>
              <div>⬇ 다운: <b>${r.download.toFixed(1)} Mbps</b></div>
              <div>⬆ 업로드: <b>${r.upload.toFixed(1)} Mbps</b></div>
              <div style="color:#888;margin-top:6px;font-size:11px;">${r.timestamp}</div>
            </div>
          `);
      });
    });
  }, [records]);

  // 다운로드 속도 측정
  const measureDownload = async (): Promise<number> => {
    const url = `https://speed.cloudflare.com/__down?bytes=5000000&_=${Date.now()}`;
    const start = performance.now();
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const elapsed = (performance.now() - start) / 1000;
    const mbps = (buffer.byteLength * 8) / 1_000_000 / elapsed;
    return Math.round(mbps * 10) / 10;
  };

  // 업로드 속도 측정
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

  // 속도 측정
  const measure = async () => {
    setMeasuring(true);
    setCurrentSpeed(null);

    try {
      setStatus("📍 위치 가져오는 중...");
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;

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
        mapInstanceRef.current.setView([lat, lng], 16);
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

  const clearAll = () => {
    if (!confirm("모든 기록을 삭제할까요?")) return;
    setRecords([]);
    localStorage.removeItem("signal-records");
  };

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0a0f" }}>

      {/* 헤더 */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 600, color: "#e8e8f0" }}>📶 Signal Checker</h1>
          <p style={{ fontSize: 11, color: "#7a7a9a", marginTop: 2 }}>GPS 기반 인터넷 속도 기록</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#7a7a9a" }}>기록 {records.length}개</div>
          {records.length > 0 && (
            <button onClick={clearAll}
              style={{ background: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.3)", color: "#ff6b6b", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>
              전체 삭제
            </button>
          )}
        </div>
      </div>

      {/* 지도 + 중심 마커 */}
      <div style={{ position: "relative", flex: 1, minHeight: 300 }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        {/* 지도 중심 십자선 */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1000, pointerEvents: "none" }}>
          <div style={{ width: 20, height: 2, background: "#6c63ff", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
          <div style={{ width: 2, height: 20, background: "#6c63ff", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        </div>
      </div>

      {/* 측정 패널 */}
      <div style={{ background: "#111118", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px" }}>

        {/* 현재 속도 */}
        {currentSpeed && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div style={{ background: "#15151f", padding: "10px 14px", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#7a7a9a", marginBottom: 4 }}>⬇ 다운로드</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: getColor(currentSpeed.download) }}>{currentSpeed.download}</div>
              <div style={{ fontSize: 11, color: "#7a7a9a" }}>Mbps</div>
            </div>
            <div style={{ background: "#15151f", padding: "10px 14px", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#7a7a9a", marginBottom: 4 }}>⬆ 업로드</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: getColor(currentSpeed.upload) }}>{currentSpeed.upload}</div>
              <div style={{ fontSize: 11, color: "#7a7a9a" }}>Mbps</div>
            </div>
          </div>
        )}

        {/* 상태 */}
        <div style={{ fontSize: 12, color: "#a0a0c0", marginBottom: 10, textAlign: "center" }}>{status}</div>

        {/* 버튼 1개 */}
        <button onClick={measure} disabled={measuring}
          style={{ width: "100%", padding: "14px", background: measuring ? "#3a3a5c" : "#6c63ff", color: "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: measuring ? "not-allowed" : "pointer", transition: "background 0.2s", marginBottom: 12 }}>
          {measuring ? "측정 중..." : "📶 현재 위치 속도 측정"}
        </button>

        {/* 기록 목록 */}
        {records.length > 0 && (
          <div style={{ maxHeight: 150, overflowY: "auto" }}>
            <div style={{ fontSize: 11, color: "#7a7a9a", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>최근 기록</div>
            {records.slice(0, 10).map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: getColor(r.download), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: "#e8e8f0" }}>⬇ {r.download} / ⬆ {r.upload} Mbps</span>
                  <span style={{ fontSize: 11, color: "#7a7a9a", marginLeft: 6 }}>{r.timestamp}</span>
                </div>
                <button onClick={() => deleteRecord(r.id)}
                  style={{ background: "none", border: "none", color: "#7a7a9a", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}