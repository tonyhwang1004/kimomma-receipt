import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ══════════════════════════════════════════════
// 색상 & 스타일 시스템
// ══════════════════════════════════════════════
const C = {
  bg: "#F5F7FF",
  surface: "#FFFFFF",
  surfaceHigh: "#EEF1FB",
  border: "#DDE2F0",
  borderLight: "#C8D0E8",
  primary: "#4C6EF5",
  primaryGlow: "#4C6EF518",
  success: "#2E9E5B",
  successBg: "#EDFAF3",
  danger: "#E03131",
  dangerBg: "#FFF0F0",
  warning: "#E67700",
  warningBg: "#FFF8E1",
  blue: "#1971C2",
  purple: "#7048E8",
  text: "#1A1E2E",
  textSub: "#495680",
  textMuted: "#9099BB",
};

const money = (n) => {
  const num = Number(n);
  if (isNaN(num) || n === "" || n === null || n === undefined) return "-";
  return num.toLocaleString("ko-KR") + "원";
};

const normalizePhone = (val) => {
  if (!val) return "";
  const s = String(val).replace(/\D/g, "");
  if (s.length === 10 && s.startsWith("1")) return "0" + s;
  return s;
};

const parseDiscount = (text) => {
  if (!text || String(text).trim() === "") return "";
  const t = String(text).trim();
  if (t.includes("무료대성")) return "무료대성";
  const m = t.match(/장학생(\d+)%/);
  if (m) return `장학생${m[1]}%`;
  if (t.includes("멘토링60")) return "멘토링60분";
  if (t.includes("멘토링30")) return "멘토링30분";
  if (t.includes("신규가입비")) return "신규가입비혜택";
  return t;
};

// ══════════════════════════════════════════════
// 데이터 파싱
// ══════════════════════════════════════════════
function parseOnline(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  return rows
    .filter((r) => r["결제상태"] === "결제")
    .map((r) => ({
      이름: String(r["이름"] || "").trim(),
      전화: normalizePhone(r["휴대전화번호"]),
      금액: Number(r["금액(원)"] || 0),
      결제일: String(r["결제일시"] || "").slice(0, 10),
      결제수단: r["결제수단"] || "",
      카드사: r["카드사명"] || "",
      승인번호: r["승인번호"] || "",
      출처: "온라인",
    }));
}

function parseOffline(wb, sheetName, floor) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_array(ws, { defval: "" });
  if (raw.length < 2) return [];

  const results = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    const name = String(r[0] || "").trim();
    if (!name || name === "-" || name === "이름") continue;

    if (floor === "8층") {
      const 결제방식 = String(r[10] || "").trim();
      const 실결제 = r[9];
      const 특이사항 = String(r[12] || "").trim();
      results.push({
        이름: name,
        학생전화: normalizePhone(r[1]),
        학부모전화: normalizePhone(r[2]),
        학교: String(r[3] || "").trim(),
        층: "8층",
        좌석유형: String(r[4] || "").trim(),
        자리: String(r[5] || "").trim(),
        결제일: r[7] ? String(r[7]).slice(0, 10) : "",
        다음결제일: r[11] ? String(r[11]).slice(0, 10) : "",
        결제금액: Number(r[8]) || 0,
        실결제금액: 결제방식 === "미납" ? 0 : (Number(실결제) || 0),
        결제방식,
        할인정보: parseDiscount(특이사항),
        특이사항,
        미납: 결제방식 === "미납",
        출처: "오프라인",
      });
    } else {
      const 결제방식 = String(r[11] || "").trim();
      const 실결제 = r[10];
      const 특이사항 = String(r[13] || "").trim();
      results.push({
        이름: name,
        학생전화: normalizePhone(r[1]),
        학부모전화: normalizePhone(r[2]),
        학교: String(r[3] || "").trim(),
        층: "7층",
        좌석유형: String(r[4] || "").trim(),
        자리: String(r[5] || "").trim(),
        결제일: r[7] ? String(r[7]).slice(0, 10) : "",
        다음결제일: r[8] ? String(r[8]).slice(0, 10) : "",
        결제금액: Number(r[9]) || 0,
        실결제금액: 결제방식 === "미납" ? 0 : (Number(실결제) || 0),
        결제방식,
        할인정보: parseDiscount(특이사항),
        특이사항,
        미납: 결제방식 === "미납",
        출처: "오프라인",
      });
    }
  }
  return results;
}

// ══════════════════════════════════════════════
// UI 컴포넌트
// ══════════════════════════════════════════════
function Badge({ children, color = C.primary }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      background: color + "22", color, border: `1px solid ${color}44`,
    }}>{children}</span>
  );
}

function StatCard({ icon, label, value, sub, color = C.primary, glow = false }) {
  return (
    <div style={{
      background: C.surface, borderRadius: 16, padding: "20px 24px",
      border: `1px solid ${C.border}`,
      boxShadow: glow ? `0 0 24px ${color}22` : "none",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -20, right: -20, width: 80, height: 80,
        borderRadius: "50%", background: color + "15",
      }} />
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: "flex", gap: 4, background: C.surface,
      borderRadius: 12, padding: 4, border: `1px solid ${C.border}`,
    }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          flex: 1, padding: "8px 12px", borderRadius: 9, border: "none",
          background: active === t.key ? C.primary : "transparent",
          color: active === t.key ? "#fff" : C.textSub,
          fontSize: 13, fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit", transition: "all 0.15s",
          boxShadow: active === t.key ? `0 2px 8px ${C.primary}55` : "none",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function StudentRow({ s, online }) {
  const matched = online.find(
    (o) => o.이름 === s.이름 &&
      (o.전화.slice(-4) === s.학생전화.slice(-4) ||
       o.전화.slice(-4) === s.학부모전화.slice(-4))
  );
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 60px 80px 100px 110px 110px 100px 120px",
      gap: 8, padding: "12px 16px",
      background: s.미납 ? C.dangerBg : C.surface,
      borderRadius: 10, marginBottom: 4,
      border: `1px solid ${s.미납 ? C.danger + "44" : C.border}`,
      alignItems: "center", fontSize: 13,
    }}>
      <div>
        <span style={{ fontWeight: 600, color: C.text }}>{s.이름}</span>
        {s.학교 && <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>{s.학교}</span>}
      </div>
      <div><Badge color={s.층 === "8층" ? C.blue : C.purple}>{s.층}</Badge></div>
      <div style={{ color: C.textSub, fontSize: 12 }}>{s.좌석유형}</div>
      <div style={{ color: C.textSub, fontSize: 12 }}>{s.결제일}</div>
      <div style={{ fontWeight: 600, color: C.text }}>{money(s.결제금액)}</div>
      <div style={{ fontWeight: 700, color: s.미납 ? C.danger : C.success }}>
        {s.미납 ? "⚠️ 미납" : money(s.실결제금액)}
      </div>
      <div>
        <Badge color={s.결제방식 === "카드" ? C.blue : s.결제방식 === "현금" ? C.success : C.danger}>
          {s.결제방식 || "-"}
        </Badge>
      </div>
      <div style={{ fontSize: 11, color: C.warning }}>{s.할인정보}</div>
    </div>
  );
}

// ══════════════════════════════════════════════
// 업로드 드롭존
// ══════════════════════════════════════════════
function DropZone({ label, icon, onFile, loaded }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);

  const handle = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: "array" });
      onFile(wb, file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      style={{
        border: `2px dashed ${loaded ? C.success : drag ? C.primary : C.border}`,
        borderRadius: 14, padding: "20px 16px", cursor: "pointer",
        background: loaded ? C.successBg : drag ? C.primaryGlow : C.surface,
        textAlign: "center", transition: "all 0.2s",
      }}
    >
      <input ref={ref} type="file" accept=".xlsx" style={{ display: "none" }}
        onChange={(e) => handle(e.target.files[0])} />
      <div style={{ fontSize: 28, marginBottom: 8 }}>{loaded ? "✅" : icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: loaded ? C.success : C.textSub }}>{label}</div>
      {loaded && <div style={{ fontSize: 11, color: C.success, marginTop: 4 }}>업로드 완료</div>}
    </div>
  );
}

// ══════════════════════════════════════════════
// 메인 앱
// ══════════════════════════════════════════════
export default function App() {
  const [onlineWb, setOnlineWb] = useState(null);
  const [wb8, setWb8] = useState(null);
  const [wb7, setWb7] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("summary");
  const [floorFilter, setFloorFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  const processData = useCallback((owb, w8, w7) => {
    if (!owb || !w8 || !w7) return;
    const online = parseOnline(owb);

    // 8층 시트 찾기
    const sheet8 = w8.SheetNames.find(n => n.includes("8층결제")) || w8.SheetNames[0];
    const sheet7 = w7.SheetNames.find(n => n.includes("7층결제")) || w7.SheetNames[0];
    const off8 = parseOffline(w8, sheet8, "8층");
    const off7 = parseOffline(w7, sheet7, "7층");
    const allOff = [...off8, ...off7];

    // 온라인 매칭
    const matchedOnlineIds = new Set();
    allOff.forEach((s) => {
      const match = online.find(
        (o) => o.이름 === s.이름 &&
          (o.전화.slice(-4) === s.학생전화.slice(-4) ||
           o.전화.slice(-4) === s.학부모전화.slice(-4))
      );
      if (match) matchedOnlineIds.add(match.승인번호);
    });

    const unmatchedOnline = online.filter((o) => !matchedOnlineIds.has(o.승인번호));

    // 집계
    const onlinePaid = online.reduce((s, o) => s + o.금액, 0);
    const off8Paid = off8.filter(s => !s.미납).reduce((s, o) => s + o.실결제금액, 0);
    const off7Paid = off7.filter(s => !s.미납).reduce((s, o) => s + o.실결제금액, 0);
    const unpaid8 = off8.filter(s => s.미납);
    const unpaid7 = off7.filter(s => s.미납);
    const unpaidAmt = [...unpaid8, ...unpaid7].reduce((s, o) => s + o.결제금액, 0);

    // 할인 통계
    const discountStats = {};
    allOff.forEach((s) => {
      if (s.할인정보) {
        discountStats[s.할인정보] = (discountStats[s.할인정보] || 0) + 1;
      }
    });

    setData({
      online, allOff, off8, off7, unmatchedOnline,
      stats: {
        onlinePaid, off8Paid, off7Paid,
        total: onlinePaid + off8Paid + off7Paid,
        unpaidCnt: unpaid8.length + unpaid7.length,
        unpaidAmt,
        students8: off8.length,
        students7: off7.length,
      },
      discountStats,
    });
    setTab("summary");
  }, []);

  const handleOnline = (wb) => {
    setOnlineWb(wb);
    processData(wb, wb8, wb7);
  };
  const handle8 = (wb) => {
    setWb8(wb);
    processData(onlineWb, wb, wb7);
  };
  const handle7 = (wb) => {
    setWb7(wb);
    processData(onlineWb, wb8, wb);
  };

  // 필터링
  const filteredStudents = data?.allOff.filter((s) => {
    if (floorFilter !== "전체" && s.층 !== floorFilter) return false;
    if (unpaidOnly && !s.미납) return false;
    if (search && !s.이름.includes(search) && !s.학교.includes(search)) return false;
    return true;
  }) || [];

  const isReady = !!(onlineWb && wb8 && wb7);

  // ── 업로드 화면
  if (!data) {
    return (
      <div style={{
        minHeight: "100dvh", background: C.bg,
        fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ width: "100%", maxWidth: 560, padding: "0 20px" }}>
          {/* 로고 */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 72, height: 72, borderRadius: 20,
              background: `linear-gradient(135deg, ${C.primary}, #A78BFA)`,
              fontSize: 32, marginBottom: 16,
              boxShadow: `0 8px 32px ${C.primary}44`,
            }}>📚</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>
              김엄마독서실
            </h1>
            <p style={{ color: C.textSub, fontSize: 14, margin: 0 }}>통합 결제 관리 대시보드</p>
          </div>

          {/* 업로드 카드 */}
          <div style={{
            background: C.surface, borderRadius: 20, padding: 28,
            border: `1px solid ${C.border}`,
            boxShadow: "0 8px 40px rgba(76,110,245,0.10)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textSub, marginBottom: 20 }}>
              📂 파일 3개를 업로드하면 자동으로 통합됩니다
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <DropZone label="온라인 결제 (결제선생 xlsx)" icon="🌐" onFile={handleOnline} loaded={!!onlineWb} />
              <DropZone label="8층 결제표 xlsx" icon="8️⃣" onFile={handle8} loaded={!!wb8} />
              <DropZone label="7층 결제표 xlsx" icon="7️⃣" onFile={handle7} loaded={!!wb7} />
            </div>
            {(onlineWb || wb8 || wb7) && !isReady && (
              <div style={{
                marginTop: 16, padding: "12px 16px", borderRadius: 10,
                background: C.warningBg, border: `1px solid ${C.warning}44`,
                color: C.warning, fontSize: 13, textAlign: "center",
              }}>
                나머지 파일도 업로드해 주세요 ({[onlineWb, wb8, wb7].filter(Boolean).length}/3)
              </div>
            )}
          </div>

          <p style={{ textAlign: "center", color: C.textMuted, fontSize: 12, marginTop: 20 }}>
            파일은 브라우저에서만 처리되며 서버에 업로드되지 않습니다
          </p>
        </div>
      </div>
    );
  }

  // ── 대시보드 화면
  const TABS = [
    { key: "summary", label: "📊 집계" },
    { key: "students", label: "👥 학생 현황" },
    { key: "unpaid", label: `⚠️ 미납 (${data.stats.unpaidCnt})` },
    { key: "online", label: `🔵 온라인 미매칭 (${data.unmatchedOnline.length})` },
  ];

  return (
    <div style={{
      minHeight: "100dvh", background: C.bg,
      fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
      color: C.text,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* 상단 헤더 */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "16px 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(10px)", background: "rgba(255,255,255,0.92)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.primary}, #A78BFA)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>📚</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>김엄마독서실</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>통합 결제 관리</div>
          </div>
        </div>
        <button onClick={() => { setData(null); setOnlineWb(null); setWb8(null); setWb7(null); }}
          style={{
            padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.border}`,
            background: "transparent", color: C.textSub, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
          }}>🔄 새로 불러오기</button>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        {/* 탭 */}
        <div style={{ marginBottom: 28 }}>
          <TabBar tabs={TABS} active={tab} onChange={setTab} />
        </div>

        {/* ── 집계 탭 */}
        {tab === "summary" && (
          <div>
            {/* 주요 통계 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
              <StatCard icon="💰" label="전체 수납 합계" value={money(data.stats.total)}
                sub={`온라인 + 오프라인`} color={C.primary} glow />
              <StatCard icon="🌐" label="온라인 (결제선생)" value={money(data.stats.onlinePaid)}
                sub={`${data.online.length}건`} color={C.blue} />
              <StatCard icon="8️⃣" label="8층 수납" value={money(data.stats.off8Paid)}
                sub={`${data.off8.filter(s=>!s.미납).length}명 결제`} color={C.purple} />
              <StatCard icon="7️⃣" label="7층 수납" value={money(data.stats.off7Paid)}
                sub={`${data.off7.filter(s=>!s.미납).length}명 결제`} color="#34D399" />
              <StatCard icon="⚠️" label="미납 합계" value={`${data.stats.unpaidCnt}명`}
                sub={money(data.stats.unpaidAmt) + " 미수"} color={C.danger} />
            </div>

            {/* 층별 상세 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              {[
                { label: "8층", students: data.off8, color: C.blue },
                { label: "7층", students: data.off7, color: C.purple },
              ].map(({ label, students, color }) => {
                const paid = students.filter(s => !s.미납);
                const unpaid = students.filter(s => s.미납);
                const 카드 = paid.filter(s => s.결제방식 === "카드").length;
                const 현금 = paid.filter(s => s.결제방식 === "현금").length;
                return (
                  <div key={label} style={{
                    background: C.surface, borderRadius: 16, padding: 24,
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <Badge color={color}>{label}</Badge>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>결제 현황</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[
                        { k: "전체 학생", v: `${students.length}명` },
                        { k: "결제 완료", v: `${paid.length}명`, c: C.success },
                        { k: "미납", v: `${unpaid.length}명`, c: unpaid.length > 0 ? C.danger : C.textMuted },
                        { k: "카드", v: `${카드}명` },
                        { k: "현금", v: `${현금}명` },
                        { k: "수납액", v: money(paid.reduce((s,o)=>s+o.실결제금액,0)), c: color },
                      ].map(({ k, v, c }) => (
                        <div key={k} style={{ background: C.surfaceHigh, borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{k}</div>
                          <div style={{ fontWeight: 700, color: c || C.text }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 할인 유형 */}
            {Object.keys(data.discountStats).length > 0 && (
              <div style={{
                background: C.surface, borderRadius: 16, padding: 24,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>🎓 할인 유형별 현황</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {Object.entries(data.discountStats).sort((a,b)=>b[1]-a[1]).map(([k, v]) => (
                    <div key={k} style={{
                      background: C.surfaceHigh, borderRadius: 10, padding: "10px 16px",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{k}</span>
                      <Badge color={C.warning}>{v}명</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 학생 현황 탭 */}
        {tab === "students" && (
          <div>
            {/* 필터 바 */}
            <div style={{
              display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center",
            }}>
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="이름 또는 학교 검색..."
                style={{
                  flex: 1, minWidth: 200, padding: "10px 16px",
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 10, color: C.text, fontSize: 14,
                  fontFamily: "inherit", outline: "none",
                }}
              />
              {["전체", "8층", "7층"].map((f) => (
                <button key={f} onClick={() => setFloorFilter(f)} style={{
                  padding: "10px 18px", borderRadius: 10, border: "none",
                  background: floorFilter === f ? C.primary : C.surface,
                  color: floorFilter === f ? "#fff" : C.textSub,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit", border: `1px solid ${floorFilter === f ? C.primary : C.border}`,
                }}>{f}</button>
              ))}
              <button onClick={() => setUnpaidOnly(!unpaidOnly)} style={{
                padding: "10px 18px", borderRadius: 10,
                background: unpaidOnly ? C.dangerBg : C.surface,
                color: unpaidOnly ? C.danger : C.textSub,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", border: `1px solid ${unpaidOnly ? C.danger + "44" : C.border}`,
              }}>⚠️ 미납만</button>
              <span style={{ fontSize: 13, color: C.textMuted }}>{filteredStudents.length}명</span>
            </div>

            {/* 헤더 */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 60px 80px 100px 110px 110px 100px 120px",
              gap: 8, padding: "8px 16px", marginBottom: 4,
            }}>
              {["이름", "층", "좌석유형", "결제일", "결제금액", "실결제", "방식", "할인"].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>

            {filteredStudents.map((s, i) => (
              <StudentRow key={i} s={s} online={data.online} />
            ))}

            {filteredStudents.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: C.textMuted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                검색 결과가 없습니다
              </div>
            )}
          </div>
        )}

        {/* ── 미납 탭 */}
        {tab === "unpaid" && (
          <div>
            <div style={{
              background: C.dangerBg, borderRadius: 14, padding: "16px 20px",
              border: `1px solid ${C.danger}44`, marginBottom: 20,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontWeight: 700, color: C.danger, fontSize: 15 }}>⚠️ 미납 학생 현황</div>
                <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>
                  총 {data.stats.unpaidCnt}명 · 미수금 {money(data.stats.unpaidAmt)}
                </div>
              </div>
            </div>

            {["8층", "7층"].map((floor) => {
              const unpaidList = (floor === "8층" ? data.off8 : data.off7).filter(s => s.미납);
              if (unpaidList.length === 0) return null;
              return (
                <div key={floor} style={{ marginBottom: 24 }}>
                  <div style={{ marginBottom: 10 }}>
                    <Badge color={floor === "8층" ? C.blue : C.purple}>{floor}</Badge>
                    <span style={{ marginLeft: 8, fontSize: 13, color: C.textSub }}>{unpaidList.length}명</span>
                  </div>
                  {unpaidList.map((s, i) => (
                    <div key={i} style={{
                      background: C.dangerBg, borderRadius: 12, padding: "14px 18px",
                      border: `1px solid ${C.danger}33`, marginBottom: 8,
                      display: "grid", gridTemplateColumns: "1fr 80px 100px 120px 120px",
                      gap: 12, alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, color: C.text }}>{s.이름}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          {s.학교} · {s.좌석유형} {s.자리}번
                        </div>
                      </div>
                      <Badge color={floor === "8층" ? C.blue : C.purple}>{floor}</Badge>
                      <div style={{ fontSize: 13, color: C.textSub }}>{s.결제일}</div>
                      <div style={{ fontWeight: 700, color: C.danger }}>{money(s.결제금액)}</div>
                      <div style={{ fontSize: 12, color: C.textMuted }}>
                        {s.학생전화 || s.학부모전화 || "-"}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── 온라인 미매칭 탭 */}
        {tab === "online" && (
          <div>
            <div style={{
              background: C.surfaceHigh, borderRadius: 14, padding: "16px 20px",
              border: `1px solid ${C.border}`, marginBottom: 20,
              fontSize: 13, color: C.textSub,
            }}>
              온라인 결제는 됐지만 7층/8층 시트에 이름이 없는 건입니다. 확인 후 오프라인 시트에 추가해 주세요.
            </div>
            {data.unmatchedOnline.map((o, i) => (
              <div key={i} style={{
                background: C.surface, borderRadius: 12, padding: "14px 18px",
                border: `1px solid ${C.border}`, marginBottom: 8,
                display: "grid", gridTemplateColumns: "1fr 120px 120px 100px 120px",
                gap: 12, alignItems: "center", fontSize: 13,
              }}>
                <div style={{ fontWeight: 700 }}>{o.이름}</div>
                <div style={{ color: C.textSub }}>{o.결제일}</div>
                <div style={{ fontWeight: 600, color: C.primary }}>{money(o.금액)}</div>
                <Badge color={C.blue}>{o.결제수단}</Badge>
                <div style={{ color: C.textMuted, fontSize: 11 }}>{o.카드사}</div>
              </div>
            ))}
            {data.unmatchedOnline.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: C.textMuted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                미매칭 건이 없습니다
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
