// chart.js / 차트 데이터 및 이벤트 제어 파일

// Chart 인스턴스 저장용
let revenueChartInstance;
let salesChartInstance;

// 캐시 및 데이터 저장
let dashboardData = null;
let rankingsData = null;
window.currentUserType = window.currentUserType || null;

let lastMonthPieChartInstance = null;

let selectedProductIds = [];  // 선택된 제품 ID 전역 변수로 이동
let currentSupplyData = [];
// 날짜 범위 생성 함수들 추가
function getLast12Months() {
  const months = [];
  const today = new Date();
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }
  
  return months;
}

function getLast30Days() {
  const days = [];
  const today = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    days.push(date.toISOString().split('T')[0]);
  }
  
  return days;
}

function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

// ✅ 오늘 기준 최근 30일 일별 라벨과 데이터 생성
function getLastNDaysLabels(n = 30) {
  const today = new Date();
  const labels = [];

  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const month = date.getMonth() + 1;
    const day = String(date.getDate()).padStart(2, '0');
    labels.push(`${month}/${day}`);
  }

  return labels;
}

const dummyDailyLabels = getLastNDaysLabels(30);
const dummyRevenueDaily = dummyDailyLabels.map(() =>
  Math.floor(180000 + Math.random() * 100000)
);
const dummySalesDaily = dummyDailyLabels.map(() =>
  Math.floor(15 + Math.random() * 20)
);


// ✅ 최근 6개월 라벨 자동 생성
function getRecent6MonthsLabels() {
  const today = new Date();
  const labels = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    labels.push(`${date.getMonth() + 1}월`);
  }
  return labels;
}

// 더미 월별 데이터 생성 함수
function generateDummyMonthlyData() {
    // 12개월 더미 데이터 반환
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

// ✅ 최근 월별 데이터 정의
const dummyMonthlyLabels = getRecent6MonthsLabels();
const dummyRevenueMonthly = generateDummyMonthlyData();
const dummySalesMonthly = dummyRevenueMonthly.map(v => Math.floor(v / 10000)); // 판매량은 매출 대비 축소


// 📌 차트 그리기 함수
function renderChart(id, labels, data, labelText, fontSize = 12, rotate = 0) {
  const ctx = document.getElementById(id).getContext('2d');
  
  const maxValue = Math.max(...data, 1);
  const yMax = Math.ceil(maxValue * 1.2);
  
  const chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: labelText,
        data: data,
        backgroundColor: 'rgba(214, 170, 103, 1)',
        borderColor: 'rgba(235, 186, 112, 1)',
        borderWidth: 2,
        fill: false
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          bodyFont: { size: 20 },
          titleFont: { size: 18 },
          padding: 12,
         // renderChart 함수의 callbacks 부분 수정 (약 120번 라인)
callbacks: {
    label: function(context) {
        if (labelText.includes('매출')) {
            const labels = [];
            labels.push(`매출액: $${context.parsed.y.toLocaleString()}`);
            
       
            // 관리자만 매출원가 추가 표시
            if (window.currentUserType === 'admin' && window.supplyAmounts && window.supplyAmounts[context.dataIndex]) {
                labels.push(`매출원가: $${window.supplyAmounts[context.dataIndex].toLocaleString()}`);
            }
            return labels;
        } else {
            return `${context.dataset.label}: ${context.parsed.y.toLocaleString()}개`;
        }
    }
}
        }
      },
      scales: {
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: rotate,
            minRotation: rotate,
            font: { size: fontSize }
          }
        },
        y: { 
          beginAtZero: true,
          max: yMax
        }
      }
    }
  });
  return chartInstance;
}

// 📌 모든 차트 초기 로딩
function loadInitialCharts() {
  if (revenueChartInstance) revenueChartInstance.destroy();
  if (salesChartInstance) salesChartInstance.destroy();

  revenueChartInstance = renderChart('revenueChart', dummyMonthlyLabels, dummyRevenueMonthly, '월별 매출');
  salesChartInstance = renderChart('salesChart', dummyMonthlyLabels, dummySalesMonthly, '월별 판매량');
}

// 📌 필터 버튼 클릭 시
async function setChartView(mode, event) {
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  document.getElementById('startDate').style.display = 'none';
  document.getElementById('endDate').style.display = 'none';
  document.getElementById('dateRangeText').style.display = 'none';
  document.getElementById('applyRange').style.display = 'none';

if (mode === 'monthly') {
    // ⭐️ 선택된 제품 필터 유지!
    await loadChartData('monthly', selectedProductIds.length > 0 ? selectedProductIds.join(',') : null);
} 
else if (mode === 'daily') {
    // ⭐️ 선택된 제품 필터 유지!
    await loadChartData('daily', selectedProductIds.length > 0 ? selectedProductIds.join(',') : null);
}
else if (mode === 'range') {
    document.getElementById('startDate').style.display = 'inline-block';
    document.getElementById('endDate').style.display = 'inline-block';
    document.getElementById('dateRangeText').style.display = 'inline-block';
    document.getElementById('applyRange').style.display = 'inline-block';
  }
}

// 📌 특정 기간 적용
async function applyRangeChart() {
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;

  if (!start || !end) {
    alert('시작일과 종료일을 선택해주세요.');
    return;
  }

  try {
    let url = `${window.API_BASE_URL}/api/chart/range?start_date=${start}&end_date=${end}`;
    if (selectedProductIds.length > 0) {
        url += `&product_ids=${selectedProductIds.join(',')}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    const data = await response.json();
    
    // 전체 기간 날짜 생성
    const allDays = getDateRange(start, end);
    const dataMap = {};
    
    // 서버 데이터를 맵에 저장
    data.forEach(d => {
      dataMap[d.date] = d;
    });
    
    // 모든 날짜에 대해 라벨과 데이터 설정
    const labels = allDays.map(date => {
      const d = new Date(date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    
    // applyRangeChart 함수 내부
const revenueData = allDays.map(date => {
    const d = dataMap[date];
    return d ? (d.amount || 0) : 0;  // 숫자만
});

const supplyAmounts = allDays.map(date => {
    const d = dataMap[date];
    return d ? (d.supply_amount || 0) : 0;
});

window.supplyAmounts = supplyAmounts;

const salesData = allDays.map(date => {
    const d = dataMap[date];
    return d ? (d.quantity || 0) : 0;
});

updateCharts(labels, revenueData, salesData, '특정기간', 10, 45, supplyAmounts);
    
  } catch (error) {
    console.error('특정기간 데이터 로드 실패:', error);
  }
}

// 📌 공통 차트 업데이트
function updateCharts(labels, revenueData, salesData, prefix, fontSize = 12, rotate = 0) {
  if (revenueChartInstance) revenueChartInstance.destroy();
  if (salesChartInstance) salesChartInstance.destroy();

  window.supplyAmounts = supplyAmounts || [];

  revenueChartInstance = renderChart('revenueChart', labels, revenueData, `${prefix} 매출`, fontSize, rotate);
  salesChartInstance = renderChart('salesChart', labels, salesData, `${prefix} 판매량`, fontSize, rotate);
}
// === API 데이터 로드 함수 ===
async function loadDashboardSummary() {
  try {
     const response = await fetch(`${window.API_BASE_URL}/api/dashboard-summary`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
     const data = await response.json();
    currentUserType = data.user_type;  // 원래대로
    window.currentUserType = currentUserType;  // 이 줄 추가

    // 🔴 섹션 제목 업데이트
        const summaryTitle = document.querySelector('#summarySection .section-title');
        if (summaryTitle && window.currentUserInfo) {
            if (currentUserType === 'admin') {
                summaryTitle.textContent = '전체 판매 요약';
            } else {
                summaryTitle.textContent = `${window.currentUserInfo.displayName} 요약`;
            }
        }
    
   // 관리자 화면
if (currentUserType === 'admin') {
  // 누적
  document.getElementById('totalRevenue').innerHTML = 
    `<div style="color: #333; font-size: 14px;">원가 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.cumulative.supply.toLocaleString()}</span></div>` +
    `<div style="color: #333; font-size: 14px;">매출 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.cumulative.sale.toLocaleString()}</span></div>`;
  document.getElementById('totalSales').innerHTML = 
    `<div style="color: #333; font-size: 14px;">판매 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">${data.cumulative.quantity.toLocaleString()}개</span></div>`;
  
  // 이번달
  document.getElementById('monthRevenue').innerHTML = 
    `<div style="color: #333; font-size: 14px;">원가 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.month.supply.toLocaleString()}</span></div>` +
    `<div style="color: #333; font-size: 14px;">매출 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.month.sale.toLocaleString()}</span></div>`;
  document.getElementById('monthSales').innerHTML = 
    `<div style="color: #333; font-size: 14px;">판매 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">${data.month.quantity.toLocaleString()}개</span></div>`;
  
  // 이번주
  document.getElementById('weekRevenue').innerHTML = 
    `<div style="color: #333; font-size: 14px;">원가 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.week.supply.toLocaleString()}</span></div>` +
    `<div style="color: #333; font-size: 14px;">매출 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.week.sale.toLocaleString()}</span></div>`;
  document.getElementById('weekSales').innerHTML = 
    `<div style="color: #333; font-size: 14px;">판매 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">${data.week.quantity.toLocaleString()}개</span></div>`;
  
  // 전일
  document.getElementById('todayRevenue').innerHTML = 
    `<div style="color: #333; font-size: 14px;">원가 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.yesterday.supply.toLocaleString()}</span></div>` +
    `<div style="color: #333; font-size: 14px;">매출 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.yesterday.sale.toLocaleString()}</span></div>`;
  document.getElementById('todaySales').innerHTML = 
    `<div style="color: #333; font-size: 14px;">판매 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">${data.yesterday.quantity.toLocaleString()}개</span></div>`;
    
} else {
  // 입점사 화면
  document.getElementById('totalRevenue').innerHTML = 
    `<div style="color: #333; font-size: 14px;">매출 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">$${data.cumulative.revenue.toLocaleString()}</span></div>`;
  document.getElementById('totalSales').innerHTML = 
    `<div style="color: #333; font-size: 14px;">판매 <span style="color: #346dff; font-size: 1.5em; font-weight: bold;">${data.cumulative.quantity.toLocaleString()}개</span></div>`;
  
  // 나머지도 동일하게...
}
    
  } catch (error) {
    console.error('대시보드 요약 로드 실패:', error);
  }
}

// 차트 데이터 로드
async function loadChartData(viewType, productIds = null) {
    try {
        let url = `${window.API_BASE_URL}/api/chart/${viewType}`;
        if (productIds) {
            url += `?product_ids=${productIds}`;
        }
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
window.supplyAmounts = [];  // 전역 변수로 추가
let labels = [];
let revenueData = [];
let salesData = [];
let supplyAmounts = [];  // ✅ 추가
let period = '';
let fontSize = 12;
let rotate = 0;

if (viewType === 'monthly') {
    period = '월별';
    const allMonths = getLast12Months();
    const dataMap = {};
    
    data.forEach(d => {
        dataMap[d.month] = d;
    });
    
    labels = allMonths;
    
    // ✅ 숫자 배열로 변경
    // 월별
revenueData = allMonths.map(month => {
        const d = dataMap[month];
        return d ? (d.amount || 0) : 0;
    });
    
    window.supplyAmounts = allMonths.map(month => {
        const d = dataMap[month];
        return d ? (d.supply_amount || 0) : 0;
    });
    
    salesData = allMonths.map(month => {
        const d = dataMap[month];
        return d ? (d.quantity || 0) : 0;
    });

} else if (viewType === 'daily') {
    period = '일별';
    rotate = 45;
    fontSize = 10;
    
    const allDays = getLast30Days();
    const dataMap = {};
    
    data.forEach(d => {
        dataMap[d.date] = d;
    });
    
    labels = allDays.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    
    // ✅ 숫자 배열로 변경
    revenueData = allDays.map(date => {
        const d = dataMap[date];
        return d ? (d.amount || 0) : 0;
    });
    
    window.supplyAmounts = allDays.map(date => {
        const d = dataMap[date];
        return d ? (d.supply_amount || 0) : 0;
    });
    
    salesData = allDays.map(date => {
        const d = dataMap[date];
        return d ? (d.quantity || 0) : 0;
    });
}

// ✅ supplyAmounts 추가로 전달
updateCharts(labels, revenueData, salesData, period, fontSize, rotate, supplyAmounts);
        
    } catch (error) {
        console.error('차트 데이터 로드 실패:', error);
    }
}

// TOP5 랭킹 로드
async function loadRankings() {
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/rankings`, {  // 수정!
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
    rankingsData = await response.json();
    
    // 매출 랭킹 표시
    updateRankingDisplay('cumulative_revenue', 'revenueCumulative');
    updateRankingDisplay('year_revenue', 'revenueYear');
    updateRankingDisplay('month_revenue', 'revenueMonth');
    updateRankingDisplay('week_revenue', 'revenueWeek');
    
    // 판매량 랭킹 표시
    updateRankingDisplay('cumulative_quantity', 'quantityCumulative');
    updateRankingDisplay('year_quantity', 'quantityYear');
    updateRankingDisplay('month_quantity', 'quantityMonth');
    updateRankingDisplay('week_quantity', 'quantityWeek');
    
  } catch (error) {
    console.error('랭킹 데이터 로드 실패:', error);
  }
}

// 랭킹 표시 업데이트 - 개선된 레이아웃
// 랭킹 표시 업데이트 - 빈 데이터 처리 추가
function updateRankingDisplay(dataKey, elementId) {
  const data = rankingsData[dataKey] || [];
  const element = document.querySelector(`#${elementId}`);
  
  if (!element) return;
  
  let html = '<ul class="ranking-list">';
  
  // 항상 5개 표시하기 위해 빈 데이터 채우기
  for (let i = 0; i < 5; i++) {
    const item = data[i];
    const rankNum = i + 1;
    let rankClass = `rank-number rank-${rankNum}`;
    
    if (item) {
      // 실제 데이터가 있는 경우
      if (dataKey.includes('revenue')) {
        // 매출 랭킹
        html += `
          <li>
            <div class="ranking-item">
              <span class="${rankClass}">${rankNum}.</span>
              <div class="product-details">
                <div class="product-main">
                  <span class="product-name" title="${item.product_name}">
                    ${item.product_name}
                  </span>
                  <span class="product-value">$${item.amount.toLocaleString()}</span>
                </div>
                ${currentUserType === 'admin' && item.seller_name ? 
                  `<div class="seller-name">(${item.seller_name})</div>` : ''}
              </div>
            </div>
          </li>`;
      } else {
        // 판매량 랭킹
        html += `
          <li>
            <div class="ranking-item">
              <span class="${rankClass}">${rankNum}.</span>
              <div class="product-details">
                <div class="product-main">
                  <span class="product-name" title="${item.product_name}">
                    ${item.product_name}
                  </span>
                  <span class="product-value">${item.quantity.toLocaleString()}개</span>
                </div>
                ${currentUserType === 'admin' && item.seller_name ? 
                  `<div class="seller-name">(${item.seller_name})</div>` : ''}
              </div>
            </div>
          </li>`;
      }
    } else {
      // 데이터가 없는 경우 - 빈 랭킹 표시
      if (dataKey.includes('revenue')) {
        // 매출 랭킹 빈 데이터
        html += `
          <li>
            <div class="ranking-item">
              <span class="${rankClass}">${rankNum}.</span>
              <div class="product-details">
                <div class="product-main">
                  <span class="product-name" style="color: #ccc;">-</span>
                  <span class="product-value" style="color: #ccc;">-</span>
                </div>
                ${currentUserType === 'admin' ? 
                  `<div class="seller-name" style="color: #ccc;">-</div>` : ''}
              </div>
            </div>
          </li>`;
      } else {
        // 판매량 랭킹 빈 데이터
        html += `
          <li>
            <div class="ranking-item">
              <span class="${rankClass}">${rankNum}.</span>
              <div class="product-details">
                <div class="product-main">
                  <span class="product-name" style="color: #ccc;">-</span>
                  <span class="product-value" style="color: #ccc;">-개</span>
                </div>
                ${currentUserType === 'admin' ? 
                  `<div class="seller-name" style="color: #ccc;">-</div>` : ''}
              </div>
            </div>
          </li>`;
      }
    }
  }
  
  html += '</ul>';
  element.innerHTML = html;
}
document.addEventListener('DOMContentLoaded', async () => {
  
  // 현재 연도 설정
const currentYear = new Date().getFullYear();
const yearElements = document.querySelectorAll('#currentYear');
yearElements.forEach(el => {
    el.textContent = currentYear;
});
  
  // 실제 데이터 로드
  await loadDashboardSummary();
  await loadChartData('monthly');
  await loadRankings();

  document.getElementById('startDate').style.display = 'none';
  document.getElementById('endDate').style.display = 'none';
  document.getElementById('dateRangeText').style.display = 'none';
  document.getElementById('applyRange').style.display = 'none';


  // 제품 데이터 예시 (실제로는 서버에서 불러옴)
  const allProducts = [
    { id: 1, name: '상품 A' },
    { id: 2, name: '상품 B' },
    { id: 3, name: '상품 C' },
    { id: 4, name: '상품 D' },
  ];

// 제품 필터 구현
        

        const productFilterBtn = document.getElementById('productFilterBtn');
        const resetFilterBtn = document.getElementById('resetFilterBtn');
        const selectedProductsContainer = document.getElementById('selectedProducts');

        // 제품 필터 버튼 클릭
        // 제품 필터 버튼 클릭
productFilterBtn.addEventListener('click', async () => {
    
    // 1. 먼저 로딩 모달 띄우기
    window.openModal({
        title: '제품 필터',
        bodyHTML: `
            <div style="text-align: center; padding: 40px;">
                <p>제품 목록 불러오는 중...</p>
                <div style="margin: 20px auto; width: 40px; height: 40px; 
                            border: 4px solid #f3f3f3; border-top: 4px solid #007bff; 
                            border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `,
        footerHTML: '<button onclick="closeModal()">취소</button>'
    });
    
    // 2. 잠시 후 데이터 로드
    setTimeout(async () => {
        try {
            const user = await window.API.getCurrentUser();
            let products = await window.API.products.list();
            
            // 입점사는 자기 제품만
            if (user.type === 'seller' && user.seller_id) {
                products = products.filter(p => p.seller_id === user.seller_id);
            }
            
            const modalHTML = `
                <div style="padding: 20px;">
                    <input type="text" id="modalProductSearch" 
                          placeholder="제품명 또는 코드 검색"
                          onkeyup="filterModalProducts()"
                          style="width: 100%; padding: 8px; margin-bottom: 15px; 
                                  border: 1px solid #ddd; border-radius: 4px;">
                    
                    <div id="modalProductList" style="max-height: 400px; overflow-y: auto;">
                      ${products.map(p => `
                        <label style="display: block; padding: 8px; border-bottom: 1px solid #eee;">
                          <input type="checkbox" value="${p.id}" 
                                data-name="${p.name}"
                                ${selectedProductIds.includes(p.id) ? 'checked' : ''}>
                          ${p.name} (${p.product_code})
                        </label>
                      `).join('')}
                    </div>
                </div>
            `;
            
            // 모달 내용 업데이트
            document.getElementById('modalBody').innerHTML = modalHTML;
            document.getElementById('modalFooter').innerHTML = `
                <button onclick="applyProductFilter()" style="background: #28a745; color: white;">적용</button>
                <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
            `;
            
        } catch (error) {
            console.error('제품 로드 실패:', error);
        }
    }, 10);
});

        // 필터 초기화
          resetFilterBtn.addEventListener('click', () => {
              selectedProductIds = [];
              selectedProductsContainer.innerHTML = '';
              
              // ⭐️ 현재 활성화된 모드로 다시 로드
              const activeBtn = document.querySelector('.filter-btn.active');
              if (activeBtn) {
                  const text = activeBtn.textContent;
                  if (text.includes('월별')) {
                      loadChartData('monthly');
                  } else if (text.includes('일별')) {
                      loadChartData('daily');
                  } else if (text.includes('특정기간')) {
                      applyRangeChart();
                  }
              }
          });

        // 전역 함수로 등록
        window.filterModalProducts = function() {
          const keyword = document.getElementById('modalProductSearch').value.toLowerCase();
          const labels = document.querySelectorAll('#modalProductList label');
          
          labels.forEach(label => {
            const text = label.textContent.toLowerCase();
            label.style.display = text.includes(keyword) ? 'block' : 'none';
          });
        };

        window.applyProductFilter = function() {
          selectedProductIds = [];
          selectedProductsContainer.innerHTML = '';
          
          document.querySelectorAll('#modalProductList input:checked').forEach(checkbox => {
            selectedProductIds.push(parseInt(checkbox.value));
            
            // 선택된 제품 태그 표시
            const tag = document.createElement('span');
            tag.style.cssText = 'display: inline-block; padding: 4px 8px; margin: 2px; ' +
                                'background: #e9ecef; border-radius: 4px; font-size: 12px;';
            tag.innerHTML = `
              ${checkbox.dataset.name}
              <button onclick="removeProductFilter(${checkbox.value})" 
                      style="margin-left: 5px; border: none; background: none; 
                            color: #dc3545; cursor: pointer;">×</button>
            `;
            selectedProductsContainer.appendChild(tag);
          });
          
          closeModal();
          
          // 필터된 데이터로 차트 다시 로드
          const activeBtn = document.querySelector('.filter-btn.active');
          if (activeBtn) {
              const text = activeBtn.textContent;
              if (text.includes('월별')) {
                  loadChartData('monthly', selectedProductIds.join(','));
              } else if (text.includes('일별')) {
                  loadChartData('daily', selectedProductIds.join(','));
              } else if (text.includes('특정기간')) {
                  // 특정기간이면 applyRangeChart 호출
                  applyRangeChart();
              }
          }
        };

        window.removeProductFilter = function(productId) {
          selectedProductIds = selectedProductIds.filter(id => id !== productId);
          
          // 태그 제거
          const tags = selectedProductsContainer.querySelectorAll('span');
          tags.forEach(tag => {
            if (tag.innerHTML.includes(`removeProductFilter(${productId})`)) {
              tag.remove();
            }
          });
          
          // 차트 다시 로드
          const activeBtn = document.querySelector('.filter-btn.active');
          if (activeBtn) {
              const text = activeBtn.textContent;
              if (text.includes('월별')) {
                  loadChartData('monthly', selectedProductIds.length > 0 ? selectedProductIds.join(',') : null);
              } else if (text.includes('일별')) {
                  loadChartData('daily', selectedProductIds.length > 0 ? selectedProductIds.join(',') : null);
              } else if (text.includes('특정기간')) {
                  applyRangeChart();
              }
          }
        };

  // 선택된 제품 표시
  function renderSelectedProducts() {
    selectedProductsContainer.innerHTML = '';
    selectedProducts.forEach(product => {
      const tag = document.createElement('div');
      tag.classList.add('product-tag');
      tag.innerHTML = `
        ${product.name}
        <span class="remove-tag" data-id="${product.id}">&times;</span>
      `;
      selectedProductsContainer.appendChild(tag);
    });

    // X 클릭 시 제거
    document.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id);
        selectedProducts = selectedProducts.filter(p => p.id !== id);
        renderSelectedProducts();
      });
    });
  }
});

// 전월 통계 로드
async function loadLastMonthStats() {
    try {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        
        // 제목 업데이트
        document.getElementById('lastMonthTitle').textContent = 
            `전월 실적 (${lastMonth.getFullYear()}년 ${lastMonth.getMonth() + 1}월)`;
        
        // API 호출
        const response = await fetch(`${window.API_BASE_URL}/api/last-month-stats`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        const userType = data.user_type;
        
        // 핵심 지표 업데이트
        if (userType === 'admin') {
            document.getElementById('lastMonthSupply').textContent = `$${data.total_supply.toLocaleString()}`;
            document.getElementById('lastMonthRevenue').textContent = `$${data.total_sale.toLocaleString()}`;
            document.getElementById('revenueLabel').textContent = '매출액';
        } else {
            // 입점사는 공급가를 매출액으로 표시
            document.getElementById('lastMonthRevenue').textContent = `$${data.total_revenue.toLocaleString()}`;
            document.getElementById('revenueLabel').textContent = '매출액';
            // admin-only 요소 숨기기
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        }
        
        document.getElementById('lastMonthQuantity').textContent = data.total_quantity.toLocaleString() + '개';
        document.getElementById('lastMonthOrders').textContent = data.order_count.toLocaleString() + '건';
        
        // 원형 차트 그리기
        drawLastMonthPieChart(data.top_products, userType);
        
    } catch (error) {
        console.error('전월 통계 로드 실패:', error);
    }
}

// 원형 차트 그리기
function drawLastMonthPieChart(products, userType) {
    // 기존 차트 제거
    if (lastMonthPieChartInstance) {
        lastMonthPieChartInstance.destroy();
        lastMonthPieChartInstance = null;
    }
    
    const canvas = document.getElementById('lastMonthPieChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!products || products.length === 0) {
        ctx.font = '14px Arial';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.fillText('데이터가 없습니다', 175, 175);
        return;
    }
    
    const labels = products.map(p => p.product_name);
    const data = products.map(p => userType === 'admin' ? p.sale_amount : p.supply_amount);
    
    lastMonthPieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#007bff',
                    '#28a745',
                    '#ffc107',
                    '#dc3545',
                    '#6c757d',
                    '#17a2b8',
                    '#e83e8c',
                    '#fd7e14',
                    '#20c997',
                    '#6f42c1'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: {
            duration: 500
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                // 툴팁 크기 설정
                padding: 16,  // 패딩 증가
                bodyFont: {
                    size: 16  // 폰트 크기 증가
                },
                titleFont: {
                    size: 18,  // 제목 폰트 크기
                    weight: 'bold'
                },
                cornerRadius: 8,
                displayColors: true,
                callbacks: {
                    label: function(context) {
            const label = context.label || '';
            const total = context.dataset.data.reduce((a,b) => a+b, 0);
            const percent = ((context.parsed / total) * 100).toFixed(1);
            
            // 관리자는 매출액과 매출원가 모두 표시
            if (window.currentUserType === 'admin') {
                const productIndex = context.dataIndex;
                const product = products[productIndex];
                if (product) {
                    return [
                        `${label}: ${percent}%`,
                        `매출액: $${product.sale_amount.toLocaleString()}`,
                        `매출원가: $${product.supply_amount.toLocaleString()}`
                    ];
                }
            }
            
            // 입점사는 공급가만 표시
            const value = '$' + context.parsed.toLocaleString();
            return `${label}: ${value} (${percent}%)`;
        }
    }
}
        }
    }
});
    
// 범례 생성 - 관리자/입점사 구분
const legendDiv = document.getElementById('lastMonthLegend');

// 먼저 컨테이너 스타일 설정 (3.5개 보이도록)
legendDiv.style.height = '320px';  // 약 3.5개 항목 높이
legendDiv.style.overflowY = 'auto';
legendDiv.style.overflowX = 'hidden';
legendDiv.style.paddingRight = '10px';

let legendHTML = '';
const colors = ['#007bff','#28a745','#ffc107','#dc3545','#6c757d','#17a2b8','#e83e8c','#fd7e14','#20c997','#6f42c1'];

products.forEach((p, i) => {
    const percent = p.percentage;
    const color = colors[i % colors.length];
    
    // 각 항목 높이를 약 85px로 설계 (3.5개 = 약 300px)
    legendHTML += `
        <div style="
            padding: 15px;
            margin-bottom: 10px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid ${color};
        ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: #333;">
                    ${i+1}. ${p.product_name}
                </span>
                <span style="font-size: 16px; font-weight: bold; color: ${color};">
                    ${percent}%
                </span>
            </div>
            <div style="margin-top: 8px; font-size: 13px; color: #666;">
                ${userType === 'admin' ? 
                    `<div>매출원가: $${p.supply_amount.toLocaleString()} | 매출액: $${p.sale_amount.toLocaleString()} | 수량: ${p.quantity.toLocaleString()}개</div>` :
                    `<div>공급가: $${p.supply_amount.toLocaleString()} | 수량: ${p.quantity.toLocaleString()}개</div>`
                }
            </div>
        </div>
    `;
});

legendDiv.innerHTML = legendHTML || '<div style="color: #999;">데이터가 없습니다</div>';
}

// 페이지 로드시 실행
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('summarySection')) {
        loadLastMonthStats();
    }
});


