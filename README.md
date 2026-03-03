# 📚 김엄마독서실 영수증 관리

핸드폰으로 영수증을 찍으면 AI가 자동으로 이름과 금액을 인식하여 저장·합산해주는 웹앱입니다.

## ✨ 기능

- 📷 **영수증 촬영** — 카메라로 바로 촬영하거나 갤러리에서 선택
- 🤖 **AI 자동 인식** — 이름, 금액, 날짜, 항목을 자동 추출
- ✏️ **수동 입력** — AI 인식이 어려울 때 직접 입력 가능
- 📊 **이름별 합산** — 누구에게 얼마를 받았는지 자동 합산
- 🔍 **필터링** — 이름별로 내역 조회
- 📱 **PWA 지원** — 홈 화면에 추가하면 앱처럼 사용

---

## 🚀 배포 방법 (Vercel)

### 1단계: GitHub에 올리기

```bash
# 프로젝트 폴더에서
git init
git add .
git commit -m "first commit"

# GitHub에서 새 저장소(repository) 만든 후
git remote add origin https://github.com/본인계정/kimomma-receipt.git
git branch -M main
git push -u origin main
```

### 2단계: Vercel 연결

1. [vercel.com](https://vercel.com) 가입 (GitHub 계정으로 로그인)
2. **"New Project"** 클릭
3. GitHub에서 `kimomma-receipt` 저장소 선택
4. **"Deploy"** 클릭

### 3단계: API 키 설정 ⚠️ 중요!

1. Vercel 대시보드 → 프로젝트 → **Settings** → **Environment Variables**
2. 아래 값을 추가:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: 본인의 Anthropic API 키 (https://console.anthropic.com 에서 발급)
3. **"Redeploy"** 클릭하여 적용

### 4단계: 완료! 🎉

Vercel이 제공하는 URL(예: `kimomma-receipt.vercel.app`)로 접속하면 됩니다.

---

## 📱 핸드폰에서 앱처럼 쓰기

### iPhone (Safari)
1. 사이트 접속 → 하단 공유 버튼(□↑) 탭
2. **"홈 화면에 추가"** 선택

### Android (Chrome)
1. 사이트 접속 → 메뉴(⋮) 탭
2. **"홈 화면에 추가"** 선택

---

## 🛠 로컬에서 개발하기

```bash
npm install
npm run dev
```

> 로컬 개발 시 `.env` 파일에 API 키를 넣어주세요:
> ```
> ANTHROPIC_API_KEY=sk-ant-...
> ```

---

## 📁 프로젝트 구조

```
kimomma-receipt/
├── api/
│   └── analyze.js        ← Vercel 서버리스 함수 (AI OCR)
├── public/
│   └── manifest.json     ← PWA 설정
├── src/
│   ├── main.jsx          ← React 엔트리
│   └── App.jsx           ← 메인 앱 컴포넌트
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── .env.example
```

---

## 💡 Anthropic API 키 발급 방법

1. [console.anthropic.com](https://console.anthropic.com) 접속
2. 회원가입 / 로그인
3. **API Keys** 메뉴에서 새 키 생성
4. `sk-ant-...` 형태의 키를 복사하여 Vercel에 설정

> ⚠️ API 사용량에 따라 비용이 발생할 수 있습니다.  
> 영수증 1건 분석 시 약 $0.01~0.03 정도입니다.
