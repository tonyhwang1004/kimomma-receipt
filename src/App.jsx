import { useState, useEffect, useRef, useCallback } from "react";

// ─── 색상 팔레트 ───
const C = {
  bg: "#FDF6EC", card: "#FFFFFF", primary: "#D4A373", primaryDark: "#B8864E",
  accent: "#E9C46A", danger: "#E76F51", dangerLight: "#FDEAE5",
  text: "#3D2C1E", textLight: "#8B7355", border: "#E8DDD0",
  success: "#6A9B6A", successLight: "#EDF5ED",
};

const money = (n) => Number(n).toLocaleString("ko-KR") + "원";
const todayStr = () => new Date().toISOString().slice(0, 10);

// ─── 로컬 스토리지 헬퍼 ───
const STORAGE_KEY = "kimomma_receipts";
const loadRecords = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
};
const persistRecords = (records) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

// ─── 서브 컴포넌트 ───
function Header({ title, onBack }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "18px 16px 14px",
      borderBottom: `1px solid ${C.border}`, background: C.card, position: "sticky", top: 0, zIndex: 10,
    }}>
      <button onClick={onBack} style={{
        width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`,
        background: C.bg, fontSize: 18, cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>←</button>
      <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{title}</span>
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 16px", borderRadius: 20,
      border: active ? "none" : `1px solid ${C.border}`,
      background: active ? C.primary : C.card,
      color: active ? "#fff" : C.textLight,
      fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
      boxShadow: active ? `0 2px 8px ${C.primary}44` : "none",
    }}>{label}</button>
  );
}

// ─── 메인 앱 ───
export default function App() {
  const [records, setRecords] = useState(loadRecords);
  const [view, setView] = useState("home");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [filterName, setFilterName] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const fileRef = useRef();

  // 레코드 변경 시 저장
  const save = useCallback((newRecords) => {
    setRecords(newRecords);
    persistRecords(newRecords);
  }, []);

  // 이미지 → base64
  const toBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  // ─── AI OCR 호출 (Vercel 서버리스 함수 경유) ───
  const analyzeReceipt = async (base64, mediaType) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType, today: todayStr() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "서버 오류");
      }

      const parsed = await res.json();
      setPreview({
        name: parsed.name || "미확인",
        amount: Number(parsed.amount) || 0,
        date: parsed.date || todayStr(),
        memo: parsed.memo || "",
      });
      setView("confirm");
    } catch (e) {
      console.error(e);
      setError("영수증 인식에 실패했어요. 다시 시도하거나 수동 입력해 주세요.");
    }
    setLoading(false);
  };

  // 파일 선택
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await toBase64(file);
    analyzeReceipt(base64, file.type || "image/jpeg");
    e.target.value = "";
  };

  // 저장
  const confirmSave = () => {
    if (!preview) return;
    save([{ ...preview, id: Date.now() }, ...records]);
    setPreview(null);
    setManualMode(false);
    setView("home");
  };

  // 삭제
  const deleteRecord = (id) => save(records.filter((r) => r.id !== id));

  // 통계
  const uniqueNames = [...new Set(records.map((r) => r.name))];
  const totalAmount = records.reduce((s, r) => s + r.amount, 0);
  const byName = uniqueNames.map((name) => {
    const items = records.filter((r) => r.name === name);
    return { name, total: items.reduce((s, r) => s + r.amount, 0), count: items.length };
  }).sort((a, b) => b.total - a.total);
  const filtered = filterName ? records.filter((r) => r.name === filterName) : records;

  // ─── 스피너 ───
  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ textAlign: "center", fontFamily: "'Noto Sans KR', sans-serif" }}>
          <div style={{
            width: 56, height: 56, border: `4px solid ${C.border}`, borderTopColor: C.primary,
            borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px",
          }} />
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>🔍 영수증 분석 중...</div>
          <div style={{ color: C.textLight, marginTop: 8, fontSize: 14 }}>AI가 이름과 금액을 읽고 있어요</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  // ─── 확인 / 수동입력 화면 ───
  if (view === "confirm" || manualMode) {
    const data = preview || { name: "", amount: 0, date: todayStr(), memo: "" };
    return (
      <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <Header title={manualMode && !preview ? "수동 입력" : "영수증 확인"} onBack={() => { setPreview(null); setManualMode(false); setView("home"); }} />
        <div style={{ padding: "20px 16px" }}>
          <div style={{
            background: C.card, borderRadius: 20, padding: 28,
            boxShadow: "0 2px 20px rgba(0,0,0,0.06)", border: `1px solid ${C.border}`,
          }}>
            {!manualMode && (
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🧾</div>
                <div style={{ fontSize: 14, color: C.success, fontWeight: 600, background: C.successLight, display: "inline-block", padding: "4px 14px", borderRadius: 20 }}>
                  ✓ 인식 완료
                </div>
              </div>
            )}
            {manualMode && !preview && (
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>✏️</div>
                <div style={{ fontSize: 14, color: C.textLight }}>직접 입력해 주세요</div>
              </div>
            )}

            {[
              { label: "이름 / 상호", key: "name", icon: "👤", placeholder: "예: 홍길동" },
              { label: "금액", key: "amount", icon: "💰", type: "number", placeholder: "예: 50000" },
              { label: "날짜", key: "date", icon: "📅", type: "date" },
              { label: "메모", key: "memo", icon: "📝", placeholder: "예: 3월 독서실비" },
            ].map(({ label, key, icon, type, placeholder }) => (
              <div key={key} style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 13, color: C.textLight, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  {icon} {label}
                </label>
                <input
                  type={type || "text"}
                  value={data[key]}
                  placeholder={placeholder}
                  onChange={(e) => {
                    const val = type === "number" ? Number(e.target.value) : e.target.value;
                    if (preview) setPreview({ ...preview, [key]: val });
                    else setPreview({ ...data, [key]: val });
                  }}
                  style={{
                    width: "100%", padding: "12px 16px", border: `1.5px solid ${C.border}`, borderRadius: 12,
                    fontSize: 16, fontFamily: "inherit", color: C.text, background: "#FAFAF7",
                    boxSizing: "border-box", outline: "none",
                  }}
                  onFocus={(e) => e.target.style.borderColor = C.primary}
                  onBlur={(e) => e.target.style.borderColor = C.border}
                />
              </div>
            ))}

            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              <button onClick={() => { setPreview(null); setManualMode(false); setView("home"); }}
                style={{
                  flex: 1, padding: "14px", borderRadius: 14, border: `1.5px solid ${C.border}`,
                  background: C.card, fontSize: 15, fontWeight: 600, color: C.textLight, cursor: "pointer", fontFamily: "inherit",
                }}>취소</button>
              <button onClick={confirmSave}
                style={{
                  flex: 2, padding: "14px", borderRadius: 14, border: "none",
                  background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                  fontSize: 15, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "inherit",
                  boxShadow: `0 4px 14px ${C.primary}55`,
                  opacity: (!preview || !preview.name) ? 0.5 : 1,
                }}
                disabled={!preview || !preview.name}
              >✓ 저장하기</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── 내역 화면 ───
  if (view === "history") {
    return (
      <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <Header title="영수증 내역" onBack={() => { setView("home"); setFilterName(""); }} />
        <div style={{ padding: "12px 16px" }}>
          {uniqueNames.length > 0 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 8 }}>
              <Chip label="전체" active={!filterName} onClick={() => setFilterName("")} />
              {uniqueNames.map((n) => <Chip key={n} label={n} active={filterName === n} onClick={() => setFilterName(n)} />)}
            </div>
          )}
          {filterName && (
            <div style={{
              background: C.successLight, borderRadius: 14, padding: "14px 18px", marginBottom: 14,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 14, color: C.success, fontWeight: 600 }}>{filterName} 합계</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.success }}>
                {money(filtered.reduce((s, r) => s + r.amount, 0))}
              </span>
            </div>
          )}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: C.textLight }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>저장된 영수증이 없어요
            </div>
          ) : filtered.map((r) => (
            <div key={r.id} style={{
              background: C.card, borderRadius: 16, padding: "16px 18px", marginBottom: 10,
              border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{r.name}</div>
                <div style={{ fontSize: 12, color: C.textLight, marginTop: 3 }}>{r.date}{r.memo ? ` · ${r.memo}` : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.primary }}>{money(r.amount)}</div>
                <button onClick={() => deleteRecord(r.id)} style={{
                  width: 30, height: 30, borderRadius: 8, border: "none", background: C.dangerLight,
                  color: C.danger, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── 홈 화면 ───
  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* 헤더 */}
      <div style={{
        background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
        padding: "40px 20px 28px", borderRadius: "0 0 32px 32px",
        boxShadow: `0 6px 24px ${C.primary}33`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 32 }}>📚</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>김엄마독서실</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>영수증 관리</div>
          </div>
        </div>
        <div style={{
          background: "rgba(255,255,255,0.18)", borderRadius: 18, padding: "18px 22px",
          backdropFilter: "blur(10px)",
        }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>총 누적 금액</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", letterSpacing: -1 }}>{money(totalAmount)}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>영수증 {records.length}건</div>
        </div>
      </div>

      <div style={{ padding: "20px 16px" }}>
        {error && (
          <div style={{
            background: C.dangerLight, color: C.danger, padding: "12px 16px",
            borderRadius: 12, fontSize: 14, marginBottom: 16, fontWeight: 500,
          }}>{error}</div>
        )}

        {/* 액션 버튼 */}
        <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handleFile} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()}
          style={{
            width: "100%", padding: "18px", borderRadius: 18,
            border: "none", background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
            fontSize: 16, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "inherit",
            marginBottom: 10, boxShadow: `0 4px 16px ${C.primary}44`,
          }}>📷 영수증 촬영하기</button>

        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <button onClick={() => {
            const input = document.createElement("input");
            input.type = "file"; input.accept = "image/*";
            input.onchange = handleFile; input.click();
          }} style={{
            flex: 1, padding: "14px", borderRadius: 14, border: `1.5px solid ${C.border}`,
            background: C.card, fontSize: 14, fontWeight: 500, color: C.textLight, cursor: "pointer", fontFamily: "inherit",
          }}>🖼️ 갤러리</button>
          <button onClick={() => { setManualMode(true); setPreview({ name: "", amount: 0, date: todayStr(), memo: "" }); }}
            style={{
              flex: 1, padding: "14px", borderRadius: 14, border: `1.5px solid ${C.border}`,
              background: C.card, fontSize: 14, fontWeight: 500, color: C.textLight, cursor: "pointer", fontFamily: "inherit",
            }}>✏️ 수동 입력</button>
        </div>

        {/* 이름별 합산 */}
        {byName.length > 0 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📊 이름별 합산</span>
              <button onClick={() => setView("history")} style={{
                background: "none", border: "none", color: C.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>전체 내역 →</button>
            </div>
            {byName.map(({ name, total, count }) => (
              <div key={name} onClick={() => { setFilterName(name); setView("history"); }}
                style={{
                  background: C.card, borderRadius: 16, padding: "16px 20px", marginBottom: 10,
                  border: `1px solid ${C.border}`, cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{name}</div>
                  <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>{count}건</div>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.primary }}>{money(total)}</div>
              </div>
            ))}
          </>
        )}

        {/* 빈 상태 */}
        {records.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.textLight }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🧾</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: C.text }}>영수증을 촬영해보세요!</div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>사진을 찍으면 AI가 자동으로<br />이름과 금액을 인식해줍니다</div>
          </div>
        )}

        {/* 최근 내역 */}
        {records.length > 0 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 12, marginBottom: 14 }}>🕐 최근 영수증</div>
            {records.slice(0, 5).map((r) => (
              <div key={r.id} style={{
                background: C.card, borderRadius: 14, padding: "14px 18px", marginBottom: 8,
                border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>{r.date}{r.memo ? ` · ${r.memo}` : ""}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>{money(r.amount)}</div>
              </div>
            ))}
          </>
        )}

        {/* 초기화 */}
        {records.length > 0 && (
          <button onClick={() => { if (confirm("모든 데이터를 삭제하시겠습니까?")) save([]); }}
            style={{
              width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${C.border}`,
              background: "transparent", fontSize: 13, color: C.textLight, cursor: "pointer", fontFamily: "inherit", marginTop: 24,
            }}>🗑️ 전체 데이터 초기화</button>
        )}

        <div style={{ textAlign: "center", padding: "20px 0 10px", fontSize: 11, color: C.textLight }}>
          김엄마독서실 영수증 관리 v1.0
        </div>
      </div>
    </div>
  );
}
