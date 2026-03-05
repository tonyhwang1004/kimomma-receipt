import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://jcwveyvqdjqxpznsfmpz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjd3ZleXZxZGpxeHB6bnNmbXB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTMxODcsImV4cCI6MjA4ODE4OTE4N30.PjgghG0rWM73RdTTG9f5gsh1S8FA9y7GWByehux1JMM";

// ── 구글시트 자동 로드 (시트 이름으로 직접 접근)
const SHEET_ID = "1OVEffnCRTZ1A-cVCb4CYiYe3MicyI9TSkJNsau4mGVo";
const fetchSheetByGid = async (gid) => {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("구글시트 로드 실패 (gid=" + gid + " " + res.status + ")");
  const text = await res.text();
  const rows = text.trim().split("\n").map(r => {
    const cells = [];
    let cur = "", inQ = false;
    for (let i = 0; i < r.length; i++) {
      if (r[i] === '"') { inQ = !inQ; }
      else if (r[i] === ',' && !inQ) { cells.push(cur.trim().replace(/^"|"$/g, '')); cur = ""; }
      else { cur += r[i]; }
    }
    cells.push(cur.trim().replace(/^"|"$/g, ''));
    return cells;
  });
  return rows;
};

const fetchSheet = async (sheetName) => {
  const encodedName = encodeURIComponent(sheetName);
  // range를 크게 잡아서 빈 행 포함 전체 데이터 강제 로드
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedName}&range=A1:Z300`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("구글시트 로드 실패 (" + res.status + ")");
  const text = await res.text();
  const rows = text.trim().split("\n").map(r => {
    const cells = [];
    let cur = "", inQ = false;
    for (let i = 0; i < r.length; i++) {
      if (r[i] === '"') { inQ = !inQ; }
      else if (r[i] === ',' && !inQ) { cells.push(cur.trim().replace(/^"|"$/g, '')); cur = ""; }
      else { cur += r[i]; }
    }
    cells.push(cur.trim().replace(/^"|"$/g, ''));
    return cells;
  });
  return rows;
};

const getReceipts = async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/receipts?select=*&order=created_at.desc`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return [];
  return res.json();
};

const C = {
  bg: "#F5F7FF", surface: "#FFFFFF", surfaceHigh: "#EEF1FB",
  border: "#DDE2F0", borderLight: "#C8D0E8",
  primary: "#4C6EF5", primaryGlow: "#4C6EF518",
  success: "#2E9E5B", successBg: "#EDFAF3",
  danger: "#E03131", dangerBg: "#FFF0F0",
  warning: "#E67700", warningBg: "#FFF8E1",
  blue: "#1971C2", purple: "#7048E8",
  text: "#1A1E2E", textSub: "#495680", textMuted: "#9099BB",
};

const money = (n) => {
  const num = Number(n);
  if (isNaN(num) || n === "" || n === null || n === undefined) return "-";
  return num.toLocaleString("ko-KR") + "원";
};

const normalizePhone = (val) => {
  if (!val) return "";
  const s = String(val).replace(/[^0-9]/g, "");
  if (s.length === 10 && s.startsWith("1")) return "0" + s;
  return s;
};

// 이름 정규화: 한글+숫자 조합 이름 추출
// 김나현4→김나현4(동명이인구분), 심예나 예비고2→심예나, 이시우 고1→이시우, 김엄마 이유담→이유담
const normalizeName = (name) => {
  if (!name) return "";
  const cleaned = String(name).trim().replace(/^"|"$/g, '');
  // 한글+숫자로만 구성된 첫 토큰 추출 (공백 전까지)
  // 단, 뒤에 오는 게 순수 한글(예비고, 고, 예비 등)이면 무시
  const tokens = cleaned.split(/\s+/);
  // 첫 토큰이 한글로 시작하면 사용
  for (const token of tokens) {
    if (/^[가-힣]+[0-9]*$/.test(token)) {
      return token; // 한글(+숫자) 토큰
    }
  }
  // 못 찾으면 한글만 추출
  const match = cleaned.match(/[가-힣]+[0-9]*/);
  return match ? match[0] : cleaned;
};

// 이름에서 숫자 제거 (동명이인 매칭용: 김나현4 → 김나현)
const baseNameOnly = (name) => normalizeName(name).replace(/[0-9]+$/, '');

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

function parseOnline(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  return rows.filter((r) => r["결제상태"] === "결제").map((r) => ({
    이름: normalizeName(r["이름"]),
    전화: normalizePhone(r["휴대전화번호"]),
    금액: Number(r["금액(원)"] || 0),
    결제일: String(r["결제일시"] || "").slice(0, 10),
    결제수단: r["결제수단"] || "",
    카드사: r["카드사명"] || "",
    승인번호: r["승인번호"] || "",
  }));
}

function parseOffline(wb, sheetName, floor) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const results = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    const name = String(r[0] || "").trim();
    if (!name || name === "-" || name === "이름") continue;
    if (floor === "8층") {
      const 결제방식 = String(r[10] || "").trim();
      results.push({
        이름: name, 학생전화: normalizePhone(r[1]), 학부모전화: normalizePhone(r[2]),
        학교: String(r[3] || "").trim(), 층: "8층",
        좌석유형: String(r[4] || "").trim(), 자리: String(r[5] || "").trim(),
        결제일: r[7] ? String(r[7]).slice(0, 10) : "",
        다음결제일: r[11] ? String(r[11]).slice(0, 10) : "",
        결제금액: Number(r[8]) || 0,
        실결제금액: 결제방식 === "미납" ? 0 : (Number(r[9]) || 0),
        결제방식, 할인정보: parseDiscount(String(r[12] || "")),
        특이사항: String(r[12] || ""), 미납: 결제방식 === "미납",
      });
    } else {
      const 결제방식 = String(r[11] || "").trim();
      results.push({
        이름: name, 학생전화: normalizePhone(r[1]), 학부모전화: normalizePhone(r[2]),
        학교: String(r[3] || "").trim(), 층: "7층",
        좌석유형: String(r[4] || "").trim(), 자리: String(r[5] || "").trim(),
        결제일: r[7] ? String(r[7]).slice(0, 10) : "",
        다음결제일: r[8] ? String(r[8]).slice(0, 10) : "",
        결제금액: Number(r[9]) || 0,
        실결제금액: 결제방식 === "미납" ? 0 : (Number(r[10]) || 0),
        결제방식, 할인정보: parseDiscount(String(r[13] || "")),
        특이사항: String(r[13] || ""), 미납: 결제방식 === "미납",
      });
    }
  }
  return results;
}

function Badge({ children, color = C.primary }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: color + "22", color, border: `1px solid ${color}44` }}>{children}</span>
  );
}

function StatCard({ icon, label, value, sub, color = C.primary, glow = false }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, padding: "20px 24px", border: `1px solid ${C.border}`, boxShadow: glow ? `0 0 24px ${color}22` : "none", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: color + "15" }} />
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, background: C.surface, borderRadius: 12, padding: 4, border: `1px solid ${C.border}`, flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{ flex: 1, minWidth: 80, padding: "8px 12px", borderRadius: 9, border: "none", background: active === t.key ? C.primary : "transparent", color: active === t.key ? "#fff" : C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", boxShadow: active === t.key ? `0 2px 8px ${C.primary}55` : "none" }}>{t.label}</button>
      ))}
    </div>
  );
}

function DropZone({ label, icon, onFile, loaded }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  const handle = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { const wb = XLSX.read(e.target.result, { type: "array" }); onFile(wb); };
    reader.readAsArrayBuffer(file);
  };
  return (
    <div onClick={() => ref.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      style={{ border: `2px dashed ${loaded ? C.success : drag ? C.primary : C.border}`, borderRadius: 14, padding: "20px 16px", cursor: "pointer", background: loaded ? C.successBg : drag ? C.primaryGlow : C.surface, textAlign: "center", transition: "all 0.2s" }}>
      <input ref={ref} type="file" accept=".xlsx" style={{ display: "none" }} onChange={(e) => handle(e.target.files[0])} />
      <div style={{ fontSize: 28, marginBottom: 8 }}>{loaded ? "✅" : icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: loaded ? C.success : C.textSub }}>{label}</div>
      {loaded && <div style={{ fontSize: 11, color: C.success, marginTop: 4 }}>업로드 완료</div>}
    </div>
  );
}

export default function App() {
  const [onlineWb, setOnlineWb] = useState(null);
  const [wb8, setWb8] = useState(null);
  const [wb7, setWb7] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("summary");
  const [floorFilter, setFloorFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [receipts, setReceipts] = useState([]);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [sheet8Rows, setSheet8Rows] = useState(null);
  const [sheet7Rows, setSheet7Rows] = useState(null);
  const [sheetLoading, setSheetLoading] = useState(true);
  const [sheetError, setSheetError] = useState("");

  // ref로 최신 wb 값 추적 (useState 비동기 문제 해결)
  const onlineRef = useRef(null);
  const sheet8Ref = useRef(null);
  const sheet7Ref = useRef(null);
  const receiptsRef = useRef([]);
  const scholarSetRef = useRef(new Set());
  const scholarTotalRef = useRef(0);
  const [scholarCount, setScholarCount] = useState(0);
  const [scholarList, setScholarList] = useState([]);
  const [scholarTotal, setScholarTotal] = useState(0);

  // ── 구글시트 자동 로드 (명단 + 결제표 장학생 정보)
  useEffect(() => {
    setSheetLoading(true);
    Promise.all([
      fetchSheet("8층전체학생명단"),
      fetchSheet("7층전체학생명단"),
      fetchSheet("3월8층결제표"),
      fetchSheetByGid("1777631490"),
    ]).then(([rows8, rows7, pay8, pay7]) => {
      setSheet8Rows(rows8);
      setSheet7Rows(rows7);
      sheet8Ref.current = rows8;
      sheet7Ref.current = rows7;
      // 장학생 이름 추출
      // 8층결제표: A열=이름, M열(12번째)=장학생
      // 7층결제표: A열=이름, N열(13번째)=장학생
      const scholars = new Set();
      const scholarAmounts = {};

      // 8층/7층 결제표 전체 셀 스캔 - "장학생" 텍스트 있는 행의 A열=이름, K열=실결제금액
      const scanScholar = (rows, label) => {
        if (!rows) return;
        // 헤더에서 실결제금액 열 찾기 (전체 행 스캔)
        let amtCol = -1;
        rows.forEach(r => {
          if (amtCol >= 0) return;
          r.forEach((cell, i) => {
            const h = String(cell||"").replace(/^"|"$/g,'').split(' ').join('');
            if (h === "실결제금액") { amtCol = i; }
          });
        });
        console.log(label, "실결제금액 열:", amtCol);
        rows.forEach((r, ri) => {
          const name = String(r[0]||"").trim().replace(/^"|"$/g,'');
          if (!name || name === "이름" || name === "학생이름" || name === "-") return;
          // 해당 행 모든 셀에서 장학생 텍스트 찾기
          const hasScholar = r.some(c => String(c||"").replace(/^"|"$/g,'').includes("장학생"));
          if (hasScholar) {
            const norm = normalizeName(name);
            // 금액: 헤더로 못 찾으면 행에서 가장 큰 숫자 사용
            let amt = 0;
            if (amtCol >= 0) {
              amt = Number(String(r[amtCol]||"0").replace(/[^0-9.-]/g,'')) || 0;
            } else {
              r.forEach(c => {
                const n = Number(String(c||"").replace(/[^0-9]/g,''));
                if (n > 100000 && n > amt) amt = n;
              });
            }
            scholars.add(norm);
            scholarAmounts[norm] = amt;
            console.log(label, "장학생:", name, "→", norm, "금액:", amt, "행:", ri);
          }
        });
      };

      const pay7ScholarNames = new Set();
      scanScholar(pay8, "8층");
      // 7층 장학생은 카드결제 → 결제선생에 포함됨 → 납부액 별도 계산 불필요
      pay7?.forEach(r => {
        const name = String(r[0]||"").trim().replace(/^"|"$/g,'');
        if (!name || name === "이름" || name === "학생이름" || name === "-") return;
        const hasScholar = r.some(c => String(c||"").replace(/^"|"$/g,'').includes("장학생"));
        if (hasScholar) pay7ScholarNames.add(normalizeName(name));
      });
      // 7층 장학생도 미납 제외를 위해 scholars에는 추가
      pay7ScholarNames.forEach(n => scholars.add(n));
      scanScholar(pay7, "7층");
      // 장학생 실납부액 = 8층만 현금결제 × 90% 합산 (7층은 카드결제로 결제선생에 포함)
      const scholarTotal = Object.entries(scholarAmounts)
        .filter(([name]) => !pay7ScholarNames.has(name))
        .reduce((s, [, a]) => s + Math.round(a * 0.9), 0);
      console.log("장학생 실납부액 합계:", scholarTotal);
      scholarSetRef.current = scholars;
      scholarTotalRef.current = scholarTotal;
      console.log("총 장학생:", [...scholars]);
      scholarSetRef.current = scholars;
      setScholarCount(scholars.size);
      setScholarList([...scholars]);
      setSheetLoading(false);
    }).catch(e => {
      setSheetError("구글시트 로드 실패: " + e.message);
      setSheetLoading(false);
    });
  }, []);

  // ── Supabase에서 영수증 자동 로드
  useEffect(() => {
    setReceiptLoading(true);
    getReceipts().then((data) => {
      const r = data || [];
      setReceipts(r);
      receiptsRef.current = r;
      setReceiptLoading(false);
      if (onlineRef.current && sheet8Ref.current && sheet7Ref.current) {
        processData(onlineRef.current, sheet8Ref.current, sheet7Ref.current, r);
      }
    });
  }, []);

  // 구글시트 rows → 학생 목록 파싱
  const parseSheetRows = useCallback((rows, floor) => {
    if (!rows) return [];
    // 빈 행 무시하고 이름 있는 행만 파싱 (중간 빈 행도 건너뜀)
    return rows
      .filter(r => {
        const name = String(r[0] || "").trim();
        return name !== "" && name !== "학생이름" && name !== "이름" && name !== "-";
      })
      .map(r => ({
        이름: String(r[0] || "").trim(),
        학생전화: normalizePhone(r[1]),
        학부모전화: normalizePhone(r[2]),
        학교: String(r[3] || "").trim(),
        층: floor,
        좌석유형: String(r[4] || "").trim(),
        자리: String(r[5] || "").trim(),
      }));
  }, []);

  const processData = useCallback((owb, rows8, rows7, rcpts) => {
    if (!owb || !rows8 || !rows7) return;
    const online = parseOnline(owb);
    const off8 = parseSheetRows(rows8, "8층");
    const off7 = parseSheetRows(rows7, "7층");
    const allOff = [...off8, ...off7];
    const receipts = rcpts || [];

    // ── 결제선생 납부 세트 (정규화된이름_전화끝4자리)
    const onlinePaidSet = new Set(
      online
        .filter(o => o.전화 && o.전화.length >= 4)
        .map(o => `${normalizeName(o.이름)}_${o.전화.slice(-4)}`)
    );
    // 이름만으로도 매칭 (전화번호 없는 경우 대비)
    const onlineNameSet = new Set([
      ...online.map(o => normalizeName(o.이름)),
      ...online.map(o => baseNameOnly(o.이름)),
    ]);

    // ── 영수증앱 납부 세트 (이름 기준)
    const receiptPaidSet = new Set(receipts.map(r => r.name?.trim()));

    // 장학생 세트
    const scholarSet = scholarSetRef.current;

    // ── 납부여부 체크: 결제선생 OR 영수증앱 OR 장학생
    const checkPaid = (s) => {
      const normalName = normalizeName(s.이름);
      const baseName = baseNameOnly(s.이름);

      // 장학생은 현금결제 → 무조건 납부
      if (scholarSet.has(normalName) || scholarSet.has(baseName)) return true;

      // 결제선생 이름 매칭
      const onlineMatch = onlineNameSet.has(normalName) || onlineNameSet.has(baseName);

      // 영수증앱 이름 매칭
      const receiptMatch = receiptPaidSet.has(normalName) || receiptPaidSet.has(baseName) || receiptPaidSet.has(s.이름);

      return onlineMatch || receiptMatch;
    };

    const off8WithPaid = off8.map(s => ({ ...s, 납부여부: checkPaid(s) }));
    const off7WithPaid = off7.map(s => ({ ...s, 납부여부: checkPaid(s) }));

    const unpaid8 = off8WithPaid.filter(s => !s.납부여부);
    const unpaid7 = off7WithPaid.filter(s => !s.납부여부);

    // ── 온라인 미매칭 (명단에 없는 결제선생 건) - 이름으로만 비교
    const allOffNameSet = new Set([
      ...allOff.map(s => normalizeName(s.이름)),
      ...allOff.map(s => baseNameOnly(s.이름)),
    ]);
    const unmatchedOnline = online.filter((o) => {
      const norm = normalizeName(o.이름);
      const base = baseNameOnly(o.이름);
      return !allOffNameSet.has(norm) && !allOffNameSet.has(base);
    });

    // ── 정확한 수납 합계
    const onlinePaid = online.reduce((s, o) => s + o.금액, 0);
    const receiptTotal = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
    const scholarPaid = scholarTotalRef.current;
    const totalPaid = onlinePaid + receiptTotal + scholarPaid;

    setData({
      online, allOff: [...off8WithPaid, ...off7WithPaid],
      off8: off8WithPaid, off7: off7WithPaid, unmatchedOnline,
      stats: {
        onlinePaid, receiptTotal, scholarPaid, total: totalPaid,
        off8Paid: 0, off7Paid: 0,
        unpaidCnt: unpaid8.length + unpaid7.length,
        unpaid8Cnt: unpaid8.length, unpaid7Cnt: unpaid7.length,
        students8: off8.length, students7: off7.length,
        paid8Cnt: off8WithPaid.filter(s => s.납부여부).length,
        paid7Cnt: off7WithPaid.filter(s => s.납부여부).length,
      },
      discountStats: {},
    });
    setTab("summary");
  }, []);

  const handleOnline = (wb) => { onlineRef.current = wb; setOnlineWb(wb); processData(wb, sheet8Ref.current, sheet7Ref.current, receiptsRef.current); };

  const filteredStudents = data?.allOff.filter((s) => {
    if (floorFilter !== "전체" && s.층 !== floorFilter) return false;
    if (unpaidOnly && s.납부여부) return false;
    if (search && !s.이름.includes(search) && !s.학교.includes(search)) return false;
    return true;
  }) || [];

  // ── 업로드 화면
  // 구글시트 로드되고 결제선생 올리면 자동 실행
  useEffect(() => {
    if (onlineWb && sheet8Rows && sheet7Rows) {
      processData(onlineWb, sheet8Rows, sheet7Rows, receiptsRef.current);
    }
  }, [sheet8Rows, sheet7Rows]);

  if (!data) {
    return (
      <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ width: "100%", maxWidth: 560, padding: "0 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 20, background: `linear-gradient(135deg, ${C.primary}, #7048E8)`, fontSize: 32, marginBottom: 16, boxShadow: `0 8px 32px ${C.primary}44` }}>📚</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>김엄마독서실</h1>
            <p style={{ color: C.textSub, fontSize: 14, margin: 0 }}>통합 결제 관리 대시보드</p>
            {receiptLoading ? (
              <div style={{ marginTop: 12, fontSize: 13, color: C.primary }}>☁️ 영수증 앱 데이터 로드 중...</div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 13, color: C.success }}>✅ 영수증 앱 {receipts.length}건 연동 완료</div>
            )}
          </div>
          <div style={{ background: C.surface, borderRadius: 20, padding: 28, border: `1px solid ${C.border}`, boxShadow: "0 8px 40px rgba(76,110,245,0.10)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textSub, marginBottom: 8 }}>📂 결제선생 파일만 업로드하면 됩니다!</div>
            {sheetLoading && <div style={{ fontSize: 13, color: C.primary, marginBottom: 16 }}>⟳ 학생 명단 자동 로드 중...</div>}
            {sheetError && <div style={{ fontSize: 13, color: C.danger, marginBottom: 16 }}>⚠️ {sheetError}</div>}
            {!sheetLoading && !sheetError && (
              <div style={{ fontSize: 13, color: C.success, marginBottom: 4 }}>
                ✅ 학생 명단 자동 로드 완료 (8층 {sheet8Rows?.filter(r=>r[0]&&r[0].trim()&&r[0].trim()!=='학생이름').length-1 || 0}명 · 7층 {sheet7Rows?.filter(r=>r[0]&&r[0].trim()&&r[0].trim()!=='학생이름').length-1 || 0}명)
              </div>
            )}
            {!sheetLoading && scholarCount > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#f59e0b", marginBottom: 6 }}>
                  🎓 장학생 {scholarCount}명 자동 로드 완료 (현금결제 · 미납 제외)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {scholarList.map((name, i) => (
                    <span key={i} style={{ background: "#fef3c7", color: "#92400e", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                      🎓 {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <DropZone label="결제선생 xlsx 업로드" icon="💳" onFile={handleOnline} loaded={!!onlineWb} />
            </div>
          </div>
          <p style={{ textAlign: "center", color: C.textMuted, fontSize: 12, marginTop: 20 }}>학생 명단 · 영수증 앱 데이터는 자동으로 불러옵니다 ☁️</p>
        </div>
      </div>
    );
  }

  const receiptTotal = data.stats.receiptTotal;
  const TABS = [
    { key: "summary", label: "📊 집계" },
    { key: "students", label: `👥 학생 현황 (${data.allOff.length}명)` },
    { key: "unpaid", label: `⚠️ 미납 (${data.stats.unpaidCnt})` },
    { key: "receipts", label: `📱 영수증 앱 (${receipts.length})` },
    { key: "online", label: `🔵 미매칭 (${data.unmatchedOnline.length})` },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* 헤더 */}
      <div style={{ background: "rgba(255,255,255,0.92)", borderBottom: `1px solid ${C.border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(10px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, #7048E8)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📚</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>김엄마독서실</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>통합 결제 관리 · ☁️ Supabase 연동</div>
          </div>
        </div>
        <button onClick={() => { setData(null); setOnlineWb(null); setWb8(null); setWb7(null); }}
          style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>🔄 새로 불러오기</button>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ marginBottom: 28 }}>
          <TabBar tabs={TABS} active={tab} onChange={setTab} />
        </div>

        {/* 집계 */}
        {tab === "summary" && (
          <div>
            {/* 정확한 수납 집계 */}
            <div style={{ background: C.surface, borderRadius: 16, padding: "16px 20px", border: `2px solid ${C.primary}`, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>✅ 정확한 전체 수납 합계 (결제선생 + 영수증앱 + 장학생)</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.primary, letterSpacing: -1 }}>{money(data.stats.total)}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
              <StatCard icon="💳" label="결제선생 (온라인)" value={money(data.stats.onlinePaid)} sub={`${data.online.length}건 · 카드/간편결제`} color={C.blue} glow />
              <StatCard icon="🧾" label="영수증앱 (오프라인)" value={money(data.stats.receiptTotal)} sub={`${receipts.length}건 · 현장 현금 등`} color={C.warning} glow />
              <StatCard icon="🎓" label="장학생 납부 (현금·90%)" value={money(data.stats.scholarPaid)} sub={`${scholarCount}명 · 할인 10% 적용`} color="#f59e0b" glow />
              <StatCard icon="⚠️" label="미납 학생" value={`${data.stats.unpaidCnt}명`} sub={`추정 미수금 ${money(data.stats.unpaidAmt)}`} color={C.danger} />
            </div>

            {/* 7/8층 참고용 */}
            <div style={{ background: C.surfaceHigh, borderRadius: 14, padding: "14px 20px", border: `1px solid ${C.border}`, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 12 }}>📋 7층/8층 결제표 참고용 (집계 합계에 미포함)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ background: C.surface, borderRadius: 10, padding: "12px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>8️⃣ 8층 납부 현황</div>
                  <div style={{ fontWeight: 700, color: C.blue }}>{data.stats.paid8Cnt}명 납부</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{data.stats.unpaid8Cnt}명 미납 · 전체 {data.stats.students8}명</div>
                </div>
                <div style={{ background: C.surface, borderRadius: 10, padding: "12px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>7️⃣ 7층 납부 현황</div>
                  <div style={{ fontWeight: 700, color: C.purple }}>{data.stats.paid7Cnt}명 납부</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{data.stats.unpaid7Cnt}명 미납 · 전체 {data.stats.students7}명</div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              {[{ label: "8층", students: data.off8, color: C.blue }, { label: "7층", students: data.off7, color: C.purple }].map(({ label, students, color }) => {
                const paid = students.filter(s => !s.미납);
                const unpaid = students.filter(s => s.미납);
                return (
                  <div key={label} style={{ background: C.surface, borderRadius: 16, padding: 24, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <Badge color={color}>{label}</Badge>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>결제 현황</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[
                        { k: "전체 학생", v: `${students.length}명` },
                        { k: "결제 완료", v: `${students.filter(s=>s.납부여부).length}명`, c: C.success },
                        { k: "미납", v: `${students.filter(s=>!s.납부여부).length}명`, c: students.filter(s=>!s.납부여부).length > 0 ? C.danger : C.textMuted },
                        { k: "납부율", v: `${Math.round(students.filter(s=>s.납부여부).length/students.length*100)||0}%`, c: color },
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

            {Object.keys(data.discountStats).length > 0 && (
              <div style={{ background: C.surface, borderRadius: 16, padding: 24, border: `1px solid ${C.border}` }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>🎓 할인 유형별 현황</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {Object.entries(data.discountStats).sort((a,b)=>b[1]-a[1]).map(([k, v]) => (
                    <div key={k} style={{ background: C.surfaceHigh, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{k}</span>
                      <Badge color={C.warning}>{v}명</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 학생 현황 */}
        {tab === "students" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 또는 학교 검색..."
                style={{ flex: 1, minWidth: 200, padding: "10px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
              {["전체", "8층", "7층"].map((f) => (
                <button key={f} onClick={() => setFloorFilter(f)} style={{ padding: "10px 18px", borderRadius: 10, background: floorFilter === f ? C.primary : C.surface, color: floorFilter === f ? "#fff" : C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${floorFilter === f ? C.primary : C.border}` }}>{f}</button>
              ))}
              <button onClick={() => setUnpaidOnly(!unpaidOnly)} style={{ padding: "10px 18px", borderRadius: 10, background: unpaidOnly ? C.dangerBg : C.surface, color: unpaidOnly ? C.danger : C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${unpaidOnly ? C.danger + "44" : C.border}` }}>⚠️ 미납만</button>
              <span style={{ fontSize: 13, color: C.textMuted }}>{filteredStudents.length}명</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px 100px 110px 110px 100px 120px", gap: 8, padding: "8px 16px", marginBottom: 4 }}>
              {["이름", "층", "좌석유형", "결제일", "결제금액", "실결제", "방식", "할인"].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>
            {filteredStudents.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px 100px 110px 110px 100px 120px", gap: 8, padding: "12px 16px", background: s.미납 ? C.dangerBg : C.surface, borderRadius: 10, marginBottom: 4, border: `1px solid ${s.미납 ? C.danger + "44" : C.border}`, alignItems: "center", fontSize: 13 }}>
                <div><span style={{ fontWeight: 600 }}>{s.이름}</span>{s.학교 && <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6 }}>{s.학교}</span>}</div>
                <div><Badge color={s.층 === "8층" ? C.blue : C.purple}>{s.층}</Badge></div>
                <div style={{ color: C.textSub, fontSize: 12 }}>{s.좌석유형}</div>
                <div style={{ color: C.textSub, fontSize: 12 }}>{s.결제일}</div>
                <div style={{ fontWeight: 600 }}>{money(s.결제금액)}</div>
                <div style={{ fontWeight: 700, color: !s.납부여부 ? C.danger : C.success }}>
                  {!s.납부여부 ? "⚠️ 미납" : scholarSetRef.current.has(normalizeName(s.이름)) ? "🎓 장학생" : "✅ 납부"}
                </div>
                <div><Badge color={s.결제방식 === "카드" ? C.blue : s.결제방식 === "현금" ? C.success : C.danger}>{s.결제방식 || "-"}</Badge></div>
                <div style={{ fontSize: 11, color: C.warning }}>{s.할인정보}</div>
              </div>
            ))}
          </div>
        )}

        {/* 미납 */}
        {tab === "unpaid" && (
          <div>
            <div style={{ background: C.dangerBg, borderRadius: 14, padding: "16px 20px", border: `1px solid ${C.danger}44`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, color: C.danger, fontSize: 15 }}>⚠️ 미납 학생 현황</div>
                <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>총 {data.stats.unpaidCnt}명 · 결제선생 미매칭 기준</div>
              </div>
            </div>
            {["8층", "7층"].map((floor) => {
              const unpaidList = (floor === "8층" ? data.off8 : data.off7).filter(s => !s.납부여부);
              if (unpaidList.length === 0) return null;
              return (
                <div key={floor} style={{ marginBottom: 24 }}>
                  <div style={{ marginBottom: 10 }}><Badge color={floor === "8층" ? C.blue : C.purple}>{floor}</Badge><span style={{ marginLeft: 8, fontSize: 13, color: C.textSub }}>{unpaidList.length}명</span></div>
                  {unpaidList.map((s, i) => (
                    <div key={i} style={{ background: C.dangerBg, borderRadius: 12, padding: "14px 18px", border: `1px solid ${C.danger}33`, marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 80px 100px 120px 140px", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.이름} {scholarSetRef.current.has(normalizeName(s.이름)) && <span style={{ fontSize: 11, color: C.warning, fontWeight: 700 }}>🎓 장학생</span>}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{s.학교} · {s.좌석유형} {s.자리}번</div>
                      </div>
                      <Badge color={floor === "8층" ? C.blue : C.purple}>{floor}</Badge>
                      <div style={{ fontSize: 13, color: C.textSub }}>{s.결제일}</div>
                      <div style={{ fontWeight: 700, color: C.danger }}>{money(s.결제금액)}</div>
                      <div style={{ fontSize: 12, color: C.textMuted }}>{s.학생전화 || s.학부모전화 || "-"}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* 📱 영수증 앱 탭 */}
        {tab === "receipts" && (
          <div>
            <div style={{ background: C.warningBg, borderRadius: 14, padding: "16px 20px", border: `1px solid ${C.warning}33`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, color: C.warning, fontSize: 15 }}>📱 영수증 앱 현장 결제 내역</div>
                <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>{receipts.length}건 · 합계 {money(receiptTotal)} · ☁️ 모든 기기 데이터 통합</div>
              </div>
              <button onClick={() => getReceipts().then(setReceipts)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${C.warning}44`, background: "transparent", color: C.warning, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>🔄 새로고침</button>
            </div>

            {receipts.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: C.textMuted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div>영수증 앱에 저장된 데이터가 없습니다</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>kimomma-receipt.vercel.app 에서 영수증을 촬영해 주세요</div>
              </div>
            ) : (
              <>
                {/* 이름별 합산 */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.textSub, marginBottom: 12 }}>👤 이름별 합산</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {Object.entries(receipts.reduce((acc, r) => { acc[r.name] = (acc[r.name] || 0) + Number(r.amount || 0); return acc; }, {}))
                      .sort((a,b) => b[1]-a[1]).map(([name, total]) => (
                      <div key={name} style={{ background: C.warningBg, borderRadius: 12, padding: "12px 18px", border: `1px solid ${C.warning}22`, display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontWeight: 700, color: C.text }}>{name}</span>
                        <span style={{ fontWeight: 700, color: C.warning }}>{money(total)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 기기별 현황 */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.textSub, marginBottom: 12 }}>📱 기기별 현황</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {Object.entries(receipts.reduce((acc, r) => { acc[r.device||"미확인"] = (acc[r.device||"미확인"] || 0) + 1; return acc; }, {})).map(([device, cnt]) => (
                      <div key={device} style={{ background: C.surface, borderRadius: 10, padding: "10px 16px", border: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: C.text }}>{device}</span>
                        <Badge color={C.primary}>{cnt}건</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 전체 내역 */}
                <div style={{ fontWeight: 700, fontSize: 14, color: C.textSub, marginBottom: 12 }}>📋 전체 내역</div>
                {receipts.map((r) => (
                  <div key={r.id} style={{ background: C.surface, borderRadius: 12, padding: "14px 18px", border: `1px solid ${C.border}`, marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 100px 120px 100px 150px", gap: 12, alignItems: "center", fontSize: 13 }}>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div style={{ color: C.textSub }}>{r.date}</div>
                    <div style={{ fontWeight: 700, color: C.warning }}>{money(r.amount)}</div>
                    <Badge color={C.primary}>{r.device || "미확인"}</Badge>
                    <div style={{ color: C.textMuted, fontSize: 12 }}>{r.memo || "-"}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* 온라인 미매칭 */}
        {tab === "online" && (
          <div>
            <div style={{ background: C.surfaceHigh, borderRadius: 14, padding: "16px 20px", border: `1px solid ${C.border}`, marginBottom: 20, fontSize: 13, color: C.textSub }}>
              퇴원생 명단 · 결제는 완료됐으나 현재 학생 명단에 없는 학생입니다.
            </div>
            {data.unmatchedOnline.map((o, i) => (
              <div key={i} style={{ background: C.surface, borderRadius: 12, padding: "14px 18px", border: `1px solid ${C.border}`, marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 120px 120px 100px 120px", gap: 12, alignItems: "center", fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{o.이름}</div>
                <div style={{ color: C.textSub }}>{o.결제일}</div>
                <div style={{ fontWeight: 600, color: C.primary }}>{money(o.금액)}</div>
                <Badge color={C.blue}>{o.결제수단}</Badge>
                <div style={{ color: C.textMuted, fontSize: 11 }}>{o.카드사}</div>
              </div>
            ))}
            {data.unmatchedOnline.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: C.textMuted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>미매칭 건이 없습니다
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
