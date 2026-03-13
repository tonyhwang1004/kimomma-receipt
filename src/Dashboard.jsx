import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://jcwveyvqdjqxpznsfmpz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjd3ZleXZxZGpxeHB6bnNmbXB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTMxODcsImV4cCI6MjA4ODE4OTE4N30.PjgghG0rWM73RdTTG9f5gsh1S8FA9y7GWByehux1JMM";

// ── 구글시트 자동 로드 (시트 이름으로 직접 접근)
const SHEET_ID = "1OVEffnCRTZ1A-cVCb4CYiYe3MicyI9TSkJNsau4mGVo";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwiXGtjVut9hOGZpbN5QkEVHKanQbYeA1jA1_LbTbA7pbhtMj68wOJ0vCcMMc9LPEykTA/exec";
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
  const payAmountMapRef = useRef({});
  const pay8Ref = useRef(null);
  const pay7Ref = useRef(null);
  const [scholarCount, setScholarCount] = useState(0);
  const [scholarList, setScholarList] = useState([]);
  const scholarAmountsRef = useRef({});
  const [scholarTotal, setScholarTotal] = useState(0);
  const [editAmounts, setEditAmounts] = useState({});
  const [resetting, setResetting] = useState(false);
  const [pastMonths, setPastMonths] = useState([]);
  const [bankRows, setBankRows] = useState([]);
  const [showBankModal, setShowBankModal] = useState(false);
  const [excludedBank, setExcludedBank] = useState(new Set());
  const [showOnlineModal, setShowOnlineModal] = useState(false);
  const [showUnpaidModal, setShowUnpaidModal] = useState(false);
  const [excludedUnpaid, setExcludedUnpaid] = useState(new Set());
  const [searchOnline, setSearchOnline] = useState("");
  const [searchReceipt, setSearchReceipt] = useState("");
  const [searchBank, setSearchBank] = useState("");
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [excludedOnline, setExcludedOnline] = useState(new Set());
  const bankRef = useRef([]);

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
      // 장학생 실납부액 = 8층만 현금결제 × 90% 합산 (계좌이체로 납부한 장학생 제외)
      const bankNorms = new Set((bankRef.current||[]).map(b => normalizeName(b.rawName)));
      const scholarTotal = Object.entries(scholarAmounts)
        .filter(([name]) => !pay7ScholarNames.has(name) && !bankNorms.has(name))
        .reduce((s, [, a]) => s + Math.round(a * 0.9), 0);
      console.log("장학생 실납부액 합계:", scholarTotal);
      scholarSetRef.current = scholars;
      scholarTotalRef.current = scholarTotal;
      scholarAmountsRef.current = scholarAmounts;
      // 결제표 금액 맵 생성
      // 8층: I열(8번)=결제금액, 7층: J열(9번)=결제금액
      payAmountMapRef.current = {};
      pay8?.forEach(r => {
        const name = normalizeName(String(r[0]||"").trim().replace(/^"|"$/g,''));
        if (!name || name === "이름" || name === "학생이름" || name === "-") return;
        const amt = Number(String(r[8]||"0").replace(/[^0-9.-]/g,'')) || 0;
        if (amt > 0) payAmountMapRef.current[name] = amt;
      });
      pay7?.forEach(r => {
        const name = normalizeName(String(r[0]||"").trim().replace(/^"|"$/g,''));
        if (!name || name === "이름" || name === "학생이름" || name === "-") return;
        const amt = Number(String(r[9]||"0").replace(/[^0-9.-]/g,'')) || 0;
        if (amt > 0) payAmountMapRef.current[name] = amt;
      });
      pay8Ref.current = pay8;
      pay7Ref.current = pay7;
      const mapKeys = Object.keys(payAmountMapRef.current);
      console.log("결제표 금액 맵:", mapKeys.length, "명", mapKeys.slice(0,5));
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

  const processData = useCallback((owb, rows8, rows7, rcpts, bRows) => {
    if (!owb || !rows8 || !rows7) return;
    const online = parseOnline(owb);
    const payAmountMap = payAmountMapRef.current || {};
    const bankData = bRows || bankRef.current || [];
    const bankMatched = new Set();
    const bankAmountMap = {};
    bankData.forEach(b => {
      const norm = normalizeName(b.rawName);
      bankMatched.add(norm);
      bankAmountMap[norm] = (bankAmountMap[norm] || 0) + b.amount;
    });
    const off8Raw = parseSheetRows(rows8, "8층");
    const off7Raw = parseSheetRows(rows7, "7층");
    // 결제표 금액 매핑 (processData 안에서 처리)
    const off8 = off8Raw.map(s => {
      const name = s.이름;
      const norm = name.match(/^([가-힣]+[0-9]*)/) ? name.match(/^([가-힣]+[0-9]*)/)[1] : name;
      const base = norm.replace(/[0-9]+$/, '');
      return { ...s, 결제금액: payAmountMap[norm] || payAmountMap[base] || 0 };
    });
    const off7 = off7Raw.map(s => {
      const name = s.이름;
      const norm = name.match(/^([가-힣]+[0-9]*)/) ? name.match(/^([가-힣]+[0-9]*)/)[1] : name;
      const base = norm.replace(/[0-9]+$/, '');
      return { ...s, 결제금액: payAmountMap[norm] || payAmountMap[base] || 0 };
    });
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

      // 계좌이체 매칭
      const bankMatch = bankMatched.has(normalName) || bankMatched.has(baseName);

      return onlineMatch || receiptMatch || bankMatch;
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
        bankTotal: Object.values(bankAmountMap).reduce((s,a)=>s+a,0),
        bankCnt: Object.keys(bankAmountMap).length,
        bankRows: bankData.map(b => ({ ...b, matched: bankMatched.has(normalizeName(b.rawName)), norm: normalizeName(b.rawName) })),
        unpaidCnt: unpaid8.length + unpaid7.length,
        unpaid8Cnt: unpaid8.length, unpaid7Cnt: unpaid7.length,
        unpaidAmt: [...unpaid8, ...unpaid7].reduce((s, u) => s + (u.결제금액||0), 0),
        students8: off8.length, students7: off7.length,
        paid8Cnt: off8WithPaid.filter(s => s.납부여부).length,
        paid7Cnt: off7WithPaid.filter(s => s.납부여부).length,
      },
      discountStats: {},
    });
    setTab("summary");
  }, []);

  const handleOnline = (wb) => {
    onlineRef.current = wb;
    setOnlineWb(wb);
    // 계좌이체도 올라와 있을 때만 대시보드로 넘어감
    if (bankRef.current && bankRef.current.length > 0) {
      processData(wb, sheet8Ref.current, sheet7Ref.current, receiptsRef.current, bankRef.current);
    }
  };

  const handleBank = (wb) => {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    let dataStart = 0;
    raw.forEach((r, i) => { if (String(r[0]).trim() === "No") dataStart = i + 1; });

    // 학생 명단 이름 목록 (8층 + 7층)
    const studentNames = [
      ...(sheet8Ref.current || []),
      ...(sheet7Ref.current || [])
    ].map(r => normalizeName(String(r[0]||"").trim().replace(/^"|"$/g,'')))
     .filter(n => n && n !== "이름" && n !== "학생이름");

    const rows = raw.slice(dataStart).filter(r => {
      const income = Number(String(r[4]||"0").replace(/[^0-9.-]/g,''));
      if (income <= 0) return false;
      // 입금자 이름에 학생 이름이 포함되어 있는지 확인
      const rawName = String(r[2]||"").trim();
      const normRaw = normalizeName(rawName);
      return studentNames.some(sn => sn.length >= 2 && (normRaw.includes(sn) || sn.includes(normRaw)));
    }).map(r => ({
      date: String(r[1]||"").substring(0,10),
      rawName: String(r[2]||"").trim(),
      amount: Number(String(r[4]||"0").replace(/[^0-9.-]/g,'')),
    }));
    setBankRows(rows);
    bankRef.current = rows;
    if (onlineRef.current) {
      processData(onlineRef.current, sheet8Ref.current, sheet7Ref.current, receiptsRef.current, rows);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("⚠️ 이번 달 영수증을 구글시트에 저장하고 Supabase를 초기화할까요?\n\n이 작업은 되돌릴 수 없어요!")) return;
    setResetting(true);
    try {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}_${String(now.getMonth()+1).padStart(2,'0')}`;
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "backup", yearMonth, receipts: receiptsRef.current })
      });
      const result = await res.json();
      if (!result.success) throw new Error("구글시트 저장 실패");
      await fetch(`${SUPABASE_URL}/rest/v1/receipts?id=gte.0`, {
        method: "DELETE",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }
      });
      setReceipts([]); receiptsRef.current = [];
      setData(null); setOnlineWb(null); onlineRef.current = null;
      setBankRows([]); bankRef.current = [];
      setPastMonths(prev => [yearMonth, ...prev.filter(m => m !== yearMonth)]);
      alert(`✅ ${yearMonth.replace('_','년 ')}월 데이터 저장 완료!\n영수증 ${result.count}건 백업\n\n새 달이 시작됐어요 🎉`);
    } catch(e) { alert("❌ 리셋 실패: " + e.message); }
    setResetting(false);
  };

  const filteredStudents = data?.allOff.filter((s) => {
    if (floorFilter !== "전체" && s.층 !== floorFilter) return false;
    if (unpaidOnly && s.납부여부) return false;
    if (search && !s.이름.includes(search) && !s.학교.includes(search)) return false;
    return true;
  }) || [];

  // ── 업로드 화면
  // 구글시트 로드되고 결제선생 올리면 자동 실행
  useEffect(() => {
    if (onlineWb && sheet8Rows && sheet7Rows && bankRef.current.length > 0) {
      processData(onlineWb, sheet8Rows, sheet7Rows, receiptsRef.current, bankRef.current);
    }
  }, [sheet8Rows, sheet7Rows]);

  const UnpaidModal = () => {
    if (!showUnpaidModal) return null;
    const allUnpaid = [...(data.off8||[]), ...(data.off7||[])].filter(s => !s.납부여부);
    const unpaid = allUnpaid.filter(s => !excludedUnpaid.has(s.이름));
    const excludedCount = allUnpaid.length - unpaid.length;
    const u8 = unpaid.filter(s => s.층 === "8층");
    const u7 = unpaid.filter(s => s.층 === "7층");
    const total = unpaid.reduce((sum, s) => sum + (editAmounts[s.이름] !== undefined ? editAmounts[s.이름] : (s.결제금액||0)), 0);
    const Row = ({s}) => {
      const amt = editAmounts[s.이름] !== undefined ? editAmounts[s.이름] : (s.결제금액||0);
      return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 130px 44px", gap:10, alignItems:"center", padding:"10px 14px", background:"#fef2f2", borderRadius:10, border:"1px solid #fecaca", marginBottom:6 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14 }}>{s.이름} {scholarSetRef.current.has(normalizeName(s.이름)) && <span style={{ fontSize:11, color:"#f59e0b" }}>🎓</span>}</div>
            <div style={{ fontSize:11, color:"#9ca3af" }}>{s.좌석유형} · {s.자리}번 · {s.층}</div>
          </div>
          <div style={{ fontSize:12, color:"#6b7280" }}>{s.전화||""}</div>
          <div style={{ fontWeight:700, color:"#ef4444", textAlign:"right", fontSize:14 }}>{amt > 0 ? money(amt) : "미확인"}</div>
          <button onClick={()=>setExcludedUnpaid(prev=>{const ns=new Set(prev);ns.add(s.이름);return ns;})} style={{ background:"#fee2e2", border:"none", borderRadius:8, width:36, height:36, cursor:"pointer", fontSize:16 }}>🗑</button>
        </div>
      );
    };
    return (
      <div onMouseDown={() => setShowUnpaidModal(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <div onMouseDown={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:800, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:20 }}>⚠️ 미납 학생 현황</div>
              <div style={{ fontSize:13, color:"#6b7280", marginTop:4 }}>
                총 {unpaid.length}명 · {excludedCount > 0 && <span style={{color:"#ef4444"}}>제외 {excludedCount}명 · </span>}추정 미수금 {total.toLocaleString()}원
              </div>
            </div>
            <button onClick={()=>setShowUnpaidModal(false)} style={{ border:"none", background:"#f3f4f6", borderRadius:10, width:36, height:36, fontSize:18, cursor:"pointer" }}>✕</button>
          </div>
          {u8.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:14, color:"#3b82f6", marginBottom:8 }}>🏢 8층 ({u8.length}명)</div>
              {u8.map((s,i) => <Row key={i} s={s} />)}
            </div>
          )}
          {u7.length > 0 && (
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#8b5cf6", marginBottom:8 }}>🏢 7층 ({u7.length}명)</div>
              {u7.map((s,i) => <Row key={i} s={s} />)}
            </div>
          )}
          {excludedCount > 0 && (
            <button onClick={()=>setExcludedUnpaid(new Set())} style={{ marginTop:16, padding:"8px 16px", borderRadius:10, border:"1px solid #d1d5db", background:"transparent", color:"#6b7280", fontSize:13, cursor:"pointer" }}>🔄 제외 항목 복원</button>
          )}
        </div>
      </div>
    );
  };

  const OnlineModal = () => {
    if (!showOnlineModal) return null;
    const rows = data.online.filter(o => !excludedOnline.has(o.이름+o.금액) && o.이름.includes(searchOnline));
    const excluded = data.online.length - data.online.filter(o => !excludedOnline.has(o.이름+o.금액)).length;
    return (
      <div onMouseDown={() => setShowOnlineModal(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <div onMouseDown={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:800, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:20 }}>💳 결제선생 상세 내역</div>
              <div style={{ fontSize:13, color:"#6b7280", marginTop:4 }}>총 {rows.length}건 · {excluded>0 && <span style={{color:"#ef4444"}}>제외 {excluded}건 · </span>}합계 {rows.reduce((s,o)=>s+o.금액,0).toLocaleString()}원</div>
            </div>
            <button onClick={()=>{setShowOnlineModal(false);setSearchOnline("");}} style={{ border:"none", background:"#f3f4f6", borderRadius:10, width:36, height:36, fontSize:18, cursor:"pointer" }}>✕</button>
          </div>
          <SearchBox value={searchOnline} onChange={setSearchOnline} />
          <div style={{ display:"grid", gap:8 }}>
            {rows.map((o,i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 130px 110px 44px", gap:12, alignItems:"center", padding:"12px 16px", background:"#eff6ff", borderRadius:12, border:"1px solid #bfdbfe" }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{o.이름}</div>
                <div style={{ fontWeight:700, fontSize:15, color:"#3b82f6", textAlign:"right" }}>{o.금액.toLocaleString()}원</div>
                <div style={{ fontSize:12, color:"#9ca3af", textAlign:"right" }}>{o.결제일||""}</div>
                <button onClick={()=>setExcludedOnline(prev=>{const s=new Set(prev);s.add(o.이름+o.금액);return s;})} style={{ background:"#fee2e2", border:"none", borderRadius:8, width:36, height:36, cursor:"pointer", fontSize:16 }}>🗑</button>
              </div>
            ))}
          </div>
          {excluded>0 && <button onClick={()=>setExcludedOnline(new Set())} style={{ marginTop:16, padding:"8px 16px", borderRadius:10, border:"1px solid #d1d5db", background:"transparent", color:"#6b7280", fontSize:13, cursor:"pointer" }}>🔄 제외 항목 복원</button>}
          {(() => {
            const paidNames = new Set(rows.map(o => normalizeName(o.이름)));
            const unpaid = data.allOff.filter(s => !s.납부여부);
            const notInOnline = unpaid.filter(s => !paidNames.has(normalizeName(s.이름)));
            if (notInOnline.length === 0) return null;
            return (
              <div style={{ marginTop:24 }}>
                <div style={{ fontWeight:700, color:"#ef4444", fontSize:15, marginBottom:12 }}>⚠️ 결제선생 미포함 학생 ({notInOnline.length}명)</div>
                <div style={{ display:"grid", gap:6 }}>
                  {notInOnline.map((s,i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 80px 130px", gap:12, alignItems:"center", padding:"10px 14px", background:"#fef2f2", borderRadius:10, border:"1px solid #fecaca", fontSize:14 }}>
                      <div style={{ fontWeight:700 }}>{s.이름} <span style={{ fontSize:11, color:"#9ca3af" }}>{s.층} · {s.좌석유형}</span></div>
                      <div style={{ fontSize:12, color:"#9ca3af" }}>{s.전화||""}</div>
                      <div style={{ fontWeight:700, color:"#ef4444", textAlign:"right" }}>{(payAmountMapRef.current[normalizeName(s.이름)]||0).toLocaleString()}원</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  const ReceiptModal = () => {
    if (!showReceiptModal) return null;
    return (
      <div onMouseDown={() => setShowReceiptModal(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <div onMouseDown={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:800, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:20 }}>🧾 영수증앱 상세 내역</div>
              <div style={{ fontSize:13, color:"#6b7280", marginTop:4 }}>총 {receipts.length}건 · 합계 {data.stats.receiptTotal.toLocaleString()}원</div>
            </div>
            <button onClick={()=>{setShowReceiptModal(false);setSearchReceipt("");}} style={{ border:"none", background:"#f3f4f6", borderRadius:10, width:36, height:36, fontSize:18, cursor:"pointer" }}>✕</button>
          </div>
          <SearchBox value={searchReceipt} onChange={setSearchReceipt} />
          <div style={{ display:"grid", gap:8 }}>
            {receipts.filter(r => r.name.includes(searchReceipt)).map((r,i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 130px 110px", gap:12, alignItems:"center", padding:"12px 16px", background:"#fffbeb", borderRadius:12, border:"1px solid #fde68a" }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{r.name}</div>
                <div style={{ fontWeight:700, fontSize:15, color:"#f59e0b", textAlign:"right" }}>{Number(r.amount).toLocaleString()}원</div>
                <div style={{ fontSize:12, color:"#9ca3af", textAlign:"right" }}>{r.date||""}</div>
              </div>
            ))}
          </div>
          {(() => {
            const paidNames = new Set(receipts.map(r => normalizeName(r.name)));
            const unpaid = data.allOff.filter(s => !s.납부여부);
            const notInReceipt = unpaid.filter(s => !paidNames.has(normalizeName(s.이름)));
            if (notInReceipt.length === 0) return null;
            return (
              <div style={{ marginTop:24 }}>
                <div style={{ fontWeight:700, color:"#ef4444", fontSize:15, marginBottom:12 }}>⚠️ 영수증 미발행 학생 ({notInReceipt.length}명)</div>
                <div style={{ display:"grid", gap:6 }}>
                  {notInReceipt.map((s,i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 80px 130px", gap:12, alignItems:"center", padding:"10px 14px", background:"#fef2f2", borderRadius:10, border:"1px solid #fecaca", fontSize:14 }}>
                      <div style={{ fontWeight:700 }}>{s.이름} <span style={{ fontSize:11, color:"#9ca3af" }}>{s.층} · {s.좌석유형}</span></div>
                      <div style={{ fontSize:12, color:"#9ca3af" }}>{s.전화||""}</div>
                      <div style={{ fontWeight:700, color:"#ef4444", textAlign:"right" }}>{(payAmountMapRef.current[normalizeName(s.이름)]||0).toLocaleString()}원</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  const SearchBox = ({ value, onChange }) => (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="🔍 이름 검색..."
      style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"2px solid #6366f1", fontSize:15, marginBottom:16, boxSizing:"border-box", outline:"none" }}
    />
  );

  const BankModal = () => {
    if (!showBankModal) return null;
    const rows = (data?.stats?.bankRows || []).filter(r => !excludedBank.has(r.rawName + r.date) && r.rawName.includes(searchBank));
    const active = rows.length;
    const total = data?.stats?.bankRows?.length || 0;
    const excluded = total - active;
    return (
      <div onMouseDown={() => setShowBankModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onMouseDown={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 800, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>🏦 계좌이체 상세 내역</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                총 {active}건 · {excluded > 0 && <span style={{ color: "#ef4444" }}>제외 {excluded}건 · </span>}
                합계 {rows.reduce((s,r)=>s+r.amount,0).toLocaleString()}원
              </div>
            </div>
            <button onClick={() => {setShowBankModal(false);setSearchBank("");}} style={{ border: "none", background: "#f3f4f6", borderRadius: 10, width: 36, height: 36, fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
          <SearchBox value={searchBank} onChange={setSearchBank} />
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 44px", gap: 12, alignItems: "center", padding: "12px 16px", background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{r.rawName}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#10b981", textAlign: "right" }}>{r.amount.toLocaleString()}원</div>
                <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "right" }}>{r.date}</div>
                <button onClick={() => setExcludedBank(prev => { const s = new Set(prev); s.add(r.rawName + r.date); return s; })}
                  style={{ background: "#fee2e2", border: "none", borderRadius: 8, width: 36, height: 36, cursor: "pointer", fontSize: 16, color: "#ef4444" }}>🗑</button>
              </div>
            ))}
          </div>
          {excluded > 0 && (
            <button onClick={() => setExcludedBank(new Set())} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 10, border: "1px solid #d1d5db", background: "transparent", color: "#6b7280", fontSize: 13, cursor: "pointer" }}>
              🔄 제외 항목 복원
            </button>
          )}
        </div>
      </div>
    );
  };

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
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textSub, marginBottom: 8 }}>📂 결제선생 + 계좌이체 파일을 모두 업로드하면 됩니다!</div>
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
              <DropZone label="계좌이체 xls 업로드" icon="🏦" onFile={handleBank} loaded={bankRows.length > 0} />
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
    <>
    <UnpaidModal />
    <OnlineModal />
    <ReceiptModal />
    <BankModal />
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
        <button onClick={() => { setOnlineWb(null); onlineRef.current = null; setData(null); setBankRows([]); bankRef.current = []; }} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, marginLeft: 8 }}>🏠 홈으로</button>
        <button onClick={handleReset} disabled={resetting} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, marginLeft: 8 }}>
          {resetting ? "⏳ 저장 중..." : "🔄 월 마감·리셋"}
        </button>
        {pastMonths.length > 0 && (
          <select onChange={e => { if(!e.target.value) return; const ym=e.target.value; fetch(`${APPS_SCRIPT_URL}?action=getReceipts&yearMonth=${ym}`).then(r=>r.json()).then(d=>alert(`📋 ${ym.replace('_','년 ')}월\n${d.receipts?.length||0}건 · ${(d.receipts||[]).reduce((s,r)=>s+Number(r.amount||0),0).toLocaleString()}원`)); }} value="" style={{ marginLeft: 8, padding: "8px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <option value="">📂 과거 기록</option>
            {pastMonths.map(m => <option key={m} value={m}>{m.replace('_','년 ')}월</option>)}
          </select>
        )}
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
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>✅ 정확한 전체 수납 합계 (결제선생 + 영수증앱 + 장학생 + 계좌이체)</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.primary, letterSpacing: -1 }}>{money(
                data.online.filter(o=>!excludedOnline.has(o.이름+o.금액)).reduce((s,o)=>s+o.금액,0) + data.stats.receiptTotal + data.stats.scholarPaid +
                (data.stats.bankRows||[]).filter(r => !excludedBank.has(r.rawName + r.date)).reduce((s,r)=>s+r.amount,0)
              )}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
              <div onClick={() => setShowOnlineModal(true)} style={{ cursor: "pointer" }}>
                <StatCard icon="💳" label="결제선생 (온라인)" value={money(data.online.filter(o=>!excludedOnline.has(o.이름+o.금액)).reduce((s,o)=>s+o.금액,0))} sub={`${data.online.filter(o=>!excludedOnline.has(o.이름+o.금액)).length}건 · 클릭해서 상세보기`} color={C.blue} glow />
              </div>
              <div onClick={() => setShowReceiptModal(true)} style={{ cursor: "pointer" }}>
                <StatCard icon="🧾" label="영수증앱 (오프라인)" value={money(data.stats.receiptTotal)} sub={`${receipts.length}건 · 클릭해서 상세보기`} color={C.warning} glow />
              </div>

              {data.stats.bankCnt > 0 && (() => {
                const activeBankRows = (data.stats.bankRows||[]).filter(r => !excludedBank.has(r.rawName + r.date));
                const activeTotal = activeBankRows.reduce((s,r)=>s+r.amount,0);
                return (
                  <div onClick={() => setShowBankModal(true)} style={{ cursor: "pointer" }}>
                    <StatCard icon="🏦" label="계좌이체" value={money(activeTotal)} sub={`${activeBankRows.length}건 · 클릭해서 상세보기`} color="#10b981" />
                  </div>
                );
              })()}
              {(() => {
                const activeUnpaid = [...(data.off8||[]), ...(data.off7||[])].filter(s => !s.납부여부 && !excludedUnpaid.has(s.이름));
                const activeAmt = activeUnpaid.reduce((sum,s) => sum + (editAmounts[s.이름] !== undefined ? editAmounts[s.이름] : (s.결제금액||0)), 0);
                return (
                  <div onClick={() => setShowUnpaidModal(true)} style={{ cursor: "pointer" }}>
                    <StatCard icon="⚠️" label="미납 학생" value={`${activeUnpaid.length}명`} sub={`추정 미수금 ${money(activeAmt)} · 클릭해서 상세보기`} color={C.danger} />
                  </div>
                );
              })()}
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
                {!s.납부여부 && s.미납금액 > 0 && (
                  <div style={{ fontSize: 11, color: C.danger, marginTop: 2, fontWeight: 600 }}>{money(s.미납금액)}</div>
                )}
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
                <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>
                  총 {data.stats.unpaidCnt}명 ·
                  <span style={{ color: C.danger, fontWeight: 700 }}> 미납 추정 총액: {money(
                    [...(data.off8||[]), ...(data.off7||[])].filter(s=>!s.납부여부).reduce((sum, s) => sum + (editAmounts[s.이름] !== undefined ? editAmounts[s.이름] : (s.결제금액||0)), 0)
                  )}</span>
                </div>
              </div>
              <button onClick={() => {
                const unpaid = [...(data.off8||[]), ...(data.off7||[])].filter(s=>!s.납부여부);
                const total = unpaid.reduce((sum, s) => sum + (editAmounts[s.이름] !== undefined ? editAmounts[s.이름] : (s.결제금액||0)), 0);
                const u8 = unpaid.filter(s=>s.층==="8층");
                const u7 = unpaid.filter(s=>s.층==="7층");
                const fmt = (list) => list.map(s => {
                  const amt = editAmounts[s.이름] !== undefined ? editAmounts[s.이름] : (s.결제금액||0);
                  return `• ${s.이름} (${s.좌석유형} ${s.자리}번) ${amt > 0 ? money(amt) : "금액미확인"}`;
                }).join("\n");
                const text = `📚 김엄마독서실 미납 현황 (${new Date().toLocaleDateString("ko-KR")})\n\n🏢 8층 미납 ${u8.length}명\n${fmt(u8)}\n\n🏢 7층 미납 ${u7.length}명\n${fmt(u7)}\n\n💰 미납 추정 총액: ${money(total)}\n총 ${unpaid.length}명`;
                navigator.clipboard.writeText(text).then(() => alert("📋 클립보드에 복사됐어요!\n카카오톡에 붙여넣기 하세요 😊"));
              }} style={{ padding: "8px 16px", borderRadius: 10, background: "#FEE500", color: "#3A1D1D", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                📋 카카오톡 복사
              </button>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 12, color: C.textMuted }}>미납금액:</span>
                          <input
                            type="number"
                            value={editAmounts[s.이름] !== undefined ? editAmounts[s.이름] : (s.결제금액 || "")}
                            onChange={e => setEditAmounts(prev => ({ ...prev, [s.이름]: Number(e.target.value) }))}
                            placeholder="금액 입력"
                            style={{ width: 110, padding: "2px 6px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", color: C.danger, fontWeight: 700 }}
                          />
                          <span style={{ fontSize: 12, color: C.danger, fontWeight: 700 }}>원</span>
                        </div>
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
  </>
  );
}
