// sellerList.js - 입점사별 판매현황 관리

// 전역 변수
let allSellers = [];  // 전체 입점사 목록
let filteredSellers = [];  // 필터링된 입점사 목록
let selectedSellerIds = new Set();  // 선택된 입점사 ID들
let editingSellerId = null;  // 수정 중인 입점사 ID
let currentSellerPage = 1;
const sellersPerPage = 20;
let isLoadingSellers = false; 
let modalChartInstances = {
    revenue: null,
    sales: null
};

// ===== 페이지 로드시 초기화 =====
document.addEventListener('DOMContentLoaded', function() {
    // 입점사별 판매현황 메뉴 클릭시 데이터 로드
    const menuSellers = document.getElementById('menu-sellers');
    if (menuSellers) {
        menuSellers.addEventListener('click', loadSellersData);
    }
    
    // 검색 버튼 이벤트
    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                searchSeller();
            }
        });
    }
});

// ===== 입점사 데이터 로드 =====
async function loadSellersData() {
    // 중복 로딩 방지
    if (isLoadingSellers) {
        console.log('[Sellers] 이미 로딩 중...');
        return;
    }
    
    isLoadingSellers = true;
    
    try {
        // API에서 입점사 목록 가져오기
        allSellers = await window.API.sellers.list();
        console.log('입점사 데이터:', allSellers);
        filteredSellers = [...allSellers];
        
        // 테이블 렌더링
        renderSellerTable(filteredSellers);
        
        console.log('입점사 데이터 로드 완료:', allSellers.length + '개');
    } catch (error) {
        console.error('입점사 데이터 로드 실패:', error);
        alert('입점사 목록을 불러오는데 실패했습니다.');
    } finally {
        isLoadingSellers = false;  // 로딩 완료
    }
}

// ===== 입점사 테이블 렌더링 =====
function renderSellerTable(sellers) {
    const tbody = document.getElementById('sellerListTableBody');
    if (!tbody) return;
    
    if (sellers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 20px;">
                    등록된 입점사가 없습니다.
                </td>
            </tr>
        `;
        return;
    }
    
    // 페이지네이션 계산
    const totalPages = Math.ceil(sellers.length / sellersPerPage);
    const startIndex = (currentSellerPage - 1) * sellersPerPage;
    const endIndex = startIndex + sellersPerPage;
    const pageSellers = sellers.slice(startIndex, endIndex);
    
    // 테이블 렌더링 (pageSellers 사용)
    tbody.innerHTML = pageSellers.map(seller => {
    const isSystem = seller.id === 0;  // 이 줄 추가
    
    return `
        <tr>
            <td>
                ${!isSystem ? `<input type="checkbox" value="${seller.id}" 
                               onchange="toggleSellerSelection(${seller.id})"
                               ${selectedSellerIds.has(seller.id) ? 'checked' : ''}>` : ''}
            </td>
            <td>${seller.name}</td>
            <td>${seller.total_product_count || 0}</td>   
            <td>${seller.active_product_count || 0}</td>  
            <td>${formatCurrency(seller.total_sales_amount || 0)}</td>
            <td>${seller.total_sales_quantity || 0}건</td>
            <td>
                <button onclick="viewSellerDashboard(${seller.id}, '${seller.name}')" style="font-size: 12px;">
                    보기
                </button>
            </td>
            <td>
                ${!isSystem ? `<button onclick="openEditSellerModal(${seller.id})" style="font-size: 12px;">
                    수정
                </button>` : ''}
            </td>
        </tr>
    `;
}).join('');
    
    // ===== 페이지네이션 렌더링 =====
function renderSellerPagination(totalPages) {
    // 페이지네이션 컨테이너 찾기 또는 생성
    let paginationDiv = document.getElementById('sellerPagination');
    
    if (!paginationDiv) {
        // 페이지네이션 div가 없으면 테이블 다음에 생성
        const tableContainer = document.querySelector('#sellerListSection .product-table').parentElement;
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'sellerPagination';
        paginationDiv.style.cssText = 'text-align: center; margin-top: 15px;';
        tableContainer.appendChild(paginationDiv);
    }
    
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `
            <button class="page-btn ${i === currentSellerPage ? 'active' : ''}" 
                    onclick="goToSellerPage(${i})"
                    style="padding: 6px 12px; margin: 0 4px; border: 1px solid #ccc;
                           background: ${i === currentSellerPage ? '#007bff' : '#f9f9f9'};
                           color: ${i === currentSellerPage ? 'white' : '#333'};
                           border-radius: 4px; cursor: pointer;">
                ${i}
            </button>
        `;
    }
    paginationDiv.innerHTML = html;
}


    // 페이지네이션 버튼 렌더링
    renderSellerPagination(totalPages);
}

// ===== 페이지 이동 함수 =====
function goToSellerPage(page) {
    currentSellerPage = page;
    renderSellerTable(filteredSellers);
}
 
// ===== 입점사 검색 =====
function searchSeller() {
    const searchBox = document.getElementById('searchBox');
    const keyword = searchBox.value.trim().toLowerCase();
    
    if (!keyword) {
        filteredSellers = [...allSellers];
    } else {
        filteredSellers = allSellers.filter(seller => 
            seller.name.toLowerCase().includes(keyword)
        );
    }
    
    renderSellerTable(filteredSellers);
    
    // 검색 결과 메시지
    if (keyword && filteredSellers.length === 0) {
        alert('검색 결과가 없습니다.');
    }
}

// ===== 입점사 선택 토글 =====
function toggleSellerSelection(sellerId) {
    if (selectedSellerIds.has(sellerId)) {
        selectedSellerIds.delete(sellerId);
    } else {
        selectedSellerIds.add(sellerId);
    }
    console.log('선택된 입점사:', Array.from(selectedSellerIds));
}

// ===== 전체 선택/해제 =====
function toggleAllSellers(checkbox) {
    const checkboxes = document.querySelectorAll('#sellerListTableBody input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        const sellerId = parseInt(cb.value);
        if (checkbox.checked) {
            selectedSellerIds.add(sellerId);
        } else {
            selectedSellerIds.delete(sellerId);
        }
    });
}

// ===== 입점사 생성 모달 열기 =====
function openAddSellerModal() {
    const modalHTML = `
        <div style="padding: 20px;">
            <h3 style="margin-bottom: 20px;">새 입점사 등록</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">입점사명 *</label>
                <input type="text" id="newSellerName" 
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                       placeholder="입점사명을 입력하세요">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">연락처</label>
                <input type="text" id="newSellerContact" 
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                       placeholder="010-0000-0000">
            </div>
            
            <p style="color: #666; font-size: 12px; margin-top: 10px;">
                * 표시는 필수 입력 항목입니다.
            </p>
        </div>
    `;
    
    const footerHTML = `
        <button onclick="createSeller()" style="background: #28a745; color: white;">생성</button>
        <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
    `;
    
    window.openModal({
        title: '입점사 생성',
        bodyHTML: modalHTML,
        footerHTML: footerHTML
    });
    
    // 입력 필드에 포커스
    setTimeout(() => {
        document.getElementById('newSellerName')?.focus();
    }, 100);
}

// ===== 입점사 생성 =====
async function createSeller() {
    const nameInput = document.getElementById('newSellerName');
    const contactInput = document.getElementById('newSellerContact');
    
    const name = nameInput.value.trim();
    const contact = contactInput.value.trim();
    
    if (!name) {
        alert('입점사명을 입력해주세요.');
        nameInput.focus();
        return;
    }
    
    try {
        // API 호출
        const newSeller = await window.API.sellers.create({
            name: name,
            contact: contact || null
        });
        
        console.log('입점사 생성 성공:', newSeller);
        alert(`입점사 "${newSeller.name}"이(가) 성공적으로 등록되었습니다.`);
        
        // 모달 닫기
        window.closeModal();
        
        // 목록 새로고침
        loadSellersData();
        
    } catch (error) {
        console.error('입점사 생성 실패:', error);
        alert('입점사 생성에 실패했습니다: ' + (error.message || '알 수 없는 오류'));
    }
}

// ===== 입점사 수정 모달 열기 =====
async function openEditSellerModal(sellerId) {
    editingSellerId = sellerId;
    
    try {
        // 현재 입점사 정보 가져오기
        const seller = await window.API.sellers.get(sellerId);
        
        const modalHTML = `
            <div style="padding: 20px;">
                <h3 style="margin-bottom: 20px;">입점사 정보 수정</h3>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">입점사명 *</label>
                    <input type="text" id="editSellerName" 
                           value="${seller.name}"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">연락처</label>
                    <input type="text" id="editSellerContact" 
                           value="${seller.contact || ''}"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                           placeholder="010-0000-0000">
                </div>
                
                <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                    <p style="margin: 0; color: #6c757d; font-size: 12px;">
                        입점사 ID: ${seller.id}<br>
                        등록일: ${new Date(seller.created_at).toLocaleDateString('ko-KR')}
                    </p>
                </div>
            </div>
        `;
        
        const footerHTML = `
            <button onclick="updateSeller()" style="background: #007bff; color: white;">수정</button>
            <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
        `;
        
        window.openModal({
            title: '입점사 수정',
            bodyHTML: modalHTML,
            footerHTML: footerHTML
        });
        
    } catch (error) {
        console.error('입점사 정보 조회 실패:', error);
        alert('입점사 정보를 불러오는데 실패했습니다.');
    }
}

// ===== 입점사 수정 =====
async function updateSeller() {
    const nameInput = document.getElementById('editSellerName');
    const contactInput = document.getElementById('editSellerContact');
    
    const name = nameInput.value.trim();
    const contact = contactInput.value.trim();
    
    if (!name) {
        alert('입점사명을 입력해주세요.');
        nameInput.focus();
        return;
    }
    
    try {
        // API 호출
        const updatedSeller = await window.API.sellers.update(editingSellerId, {
            name: name,
            contact: contact || null
        });
        
        console.log('입점사 수정 성공:', updatedSeller);
        alert('입점사 정보가 수정되었습니다.');
        
        // 모달 닫기
        window.closeModal();
        
        // 목록 새로고침
        loadSellersData();
        
    } catch (error) {
        console.error('입점사 수정 실패:', error);
        alert('입점사 수정에 실패했습니다: ' + (error.message || '알 수 없는 오류'));
    }
}

// ===== 선택된 입점사 삭제 =====
async function deleteSelectedSellers() {
    if (selectedSellerIds.size === 0) {
        alert('삭제할 입점사를 선택해주세요.');
        return;
    }
    
    const sellerNames = filteredSellers
        .filter(s => selectedSellerIds.has(s.id))
        .map(s => s.name);
    
    const confirmMsg = `다음 입점사를 삭제하시겠습니까?\n\n${sellerNames.join('\n')}\n\n` +
                      `⚠️ 삭제된 데이터는 복구할 수 없습니다.`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    let successCount = 0;
    let failCount = 0;
    const failedSellers = [];
    
    // 각 입점사 삭제 처리
    for (const sellerId of selectedSellerIds) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/sellers/${sellerId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (response.ok) {
                successCount++;
                console.log(`입점사 ID ${sellerId} 삭제 성공`);
            } else {
                failCount++;
                const seller = allSellers.find(s => s.id === sellerId);
                failedSellers.push(seller?.name || `ID: ${sellerId}`);
            }
        } catch (error) {
            failCount++;
            const seller = allSellers.find(s => s.id === sellerId);
            failedSellers.push(seller?.name || `ID: ${sellerId}`);
            console.error(`입점사 ID ${sellerId} 삭제 실패:`, error);
        }
    }
    
    // 결과 메시지
    let resultMsg = '';
    if (successCount > 0) {
        resultMsg += `${successCount}개 입점사가 삭제되었습니다.`;
    }
    if (failCount > 0) {
        resultMsg += `\n${failCount}개 입점사 삭제 실패:\n${failedSellers.join(', ')}`;
    }
    
    alert(resultMsg);
    
    // 선택 초기화 및 목록 새로고침
    selectedSellerIds.clear();
    loadSellersData();
}

function viewSellerDashboard(sellerId, sellerName) {
    const modalHTML = `
        <div style="padding: 20px; height: 85vh; overflow-y: auto;">
            <!-- 요약 섹션 -->
            <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h4>요약</h4>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px;">
                    <div style="padding: 10px; background: white; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666;">누적</div>
                        <div id="modal-total-supply" style="font-size: 14px; color: #17a2b8;">-</div>
                        <div id="modal-total-sale" style="font-size: 14px; color: #007bff;">-</div>
                    </div>
                    <div style="padding: 10px; background: white; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666;">이번달</div>
                        <div id="modal-month-supply" style="font-size: 14px; color: #17a2b8;">-</div>
                        <div id="modal-month-sale" style="font-size: 14px; color: #007bff;">-</div>
                    </div>
                    <div style="padding: 10px; background: white; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666;">이번주</div>
                        <div id="modal-week-supply" style="font-size: 14px; color: #17a2b8;">-</div>
                        <div id="modal-week-sale" style="font-size: 14px; color: #007bff;">-</div>
                    </div>
                    <div style="padding: 10px; background: white; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666;">전일</div>
                        <div id="modal-yesterday-supply" style="font-size: 14px; color: #17a2b8;">-</div>
                        <div id="modal-yesterday-sale" style="font-size: 14px; color: #007bff;">-</div>
                    </div>
                </div>
            </div>
            
            <!-- 전월 제품별 매출 비중 + 핵심지표 추가 -->
            <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px;">
                <h4>전월 제품별 매출 비중</h4>
                <div style="display: flex; gap: 30px;">
                    <!-- 왼쪽: 원형 차트 -->
                    <div style="flex: 0 0 300px;">
                        <canvas id="modal-pie-chart" width="300" height="300"></canvas>
                    </div>
                    
                    <!-- 중앙: 범례 -->
                    <div id="modal-pie-legend" style="flex: 1; max-height: 300px; overflow-y: auto;"></div>
                    
                    <!-- 오른쪽: 전월 핵심 지표 -->
                    <div style="flex: 0 0 200px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                        <h5 style="margin-bottom: 15px;">전월 실적</h5>
                        <div style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 6px;">
                            <div style="font-size: 11px; color: #666;">매출원가(공급가)</div>
                            <div id="modal-last-month-supply" style="font-size: 16px; font-weight: bold;">-</div>
                        </div>
                        <div style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 6px;">
                            <div style="font-size: 11px; color: #666;">매출액(판매가)</div>
                            <div id="modal-last-month-sale" style="font-size: 16px; font-weight: bold;">-</div>
                        </div>
                        <div style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 6px;">
                            <div style="font-size: 11px; color: #666;">판매수량</div>
                            <div id="modal-last-month-quantity" style="font-size: 16px; font-weight: bold;">-</div>
                        </div>
                        <div style="padding: 10px; background: white; border-radius: 6px;">
                            <div style="font-size: 11px; color: #666;">주문건수</div>
                            <div id="modal-last-month-orders" style="font-size: 16px; font-weight: bold;">-</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 필터 버튼 -->
            <div style="margin-bottom: 15px;">
                <button onclick="loadModalChart(${sellerId}, 'monthly')" 
                        class="modal-filter-btn active"
                        style="padding: 8px 16px; margin-right: 10px;">월별</button>
                <button onclick="loadModalChart(${sellerId}, 'daily')" 
                        class="modal-filter-btn"
                        style="padding: 8px 16px;">일별</button>
            </div>

            <!-- 차트 섹션 - 높이 증가 -->
            <div style="margin-bottom: 20px;">
                <div style="padding: 15px; background: white; border-radius: 8px; margin-bottom: 15px;">
                    <h5>매출 추이</h5>
                    <canvas id="modal-revenue-chart" width="1200" height="300"></canvas>
                </div>
                <div style="padding: 15px; background: white; border-radius: 8px;">
                    <h5>판매량 추이</h5>
                    <canvas id="modal-sales-chart" width="1200" height="300"></canvas>
                </div>
            </div>
            
            <!-- TOP5 랭킹 -->
            <div style="padding: 15px; background: white; border-radius: 8px;">
                <h5>TOP5 제품</h5>
                <div id="modal-rankings" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h6>매출 TOP5</h6>
                        <div id="modal-revenue-ranking"></div>
                    </div>
                    <div>
                        <h6>판매량 TOP5</h6>
                        <div id="modal-quantity-ranking"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    const footerHTML = `
        <button onclick="closeModal()" style="background: #6c757d; color: white;">닫기</button>
    `;
    
    window.openModal({
        title: `${sellerName} 판매현황`,
        bodyHTML: modalHTML,
        footerHTML: footerHTML
    });
    
    // 🔴 모달 크기 대폭 확대
   // 스타일 태그를 head에 추가하여 우선순위 높이기
   setTimeout(() => {
        const modal = document.querySelector('#modalRoot .modal');
        if (modal) {
            modal.classList.add('seller-dashboard-modal');
        }
    }, 50);
    
    loadSellerDashboardData(sellerId);
    window.currentModalSellerId = sellerId;
}

// 모달 닫을 때 스타일 제거
window.addEventListener('click', function(e) {
    if (e.target.classList.contains('close') || e.target.textContent === '닫기') {
        const style = document.getElementById('seller-modal-style');
        if (style) style.remove();
    }
});

// loadModalChart 함수 수정
async function loadModalChart(sellerId, viewType) {
    document.querySelectorAll('.modal-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    const response = await fetch(`${window.API_BASE_URL}/api/chart/${viewType}?seller_id=${sellerId}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    
    const data = await response.json();
    drawModalCharts(data, viewType);
}


window.loadModalChart = loadModalChart;

// 입점사 대시보드 데이터 로드
async function loadSellerDashboardData(sellerId) {
    try {
        // 1. 요약 데이터
        const summaryResponse = await fetch(`${window.API_BASE_URL}/api/dashboard-summary?seller_id=${sellerId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const summaryData = await summaryResponse.json();
        
        // 응답 형식 확인 후 매출원가와 매출액 분리 표시
        if (summaryData.cumulative) {
            // 누적 - ID를 변경해야 함
            document.getElementById('modal-total-supply').textContent = 
                `원가: $${(summaryData.cumulative.supply || 0).toLocaleString()}`;
            document.getElementById('modal-total-sale').textContent = 
                `매출: $${(summaryData.cumulative.sale || 0).toLocaleString()}`;
            
            // 이번달
            document.getElementById('modal-month-supply').textContent = 
                `원가: $${(summaryData.month.supply || 0).toLocaleString()}`;
            document.getElementById('modal-month-sale').textContent = 
                `매출: $${(summaryData.month.sale || 0).toLocaleString()}`;
            
            // 이번주
            document.getElementById('modal-week-supply').textContent = 
                `원가: $${(summaryData.week.supply || 0).toLocaleString()}`;
            document.getElementById('modal-week-sale').textContent = 
                `매출: $${(summaryData.week.sale || 0).toLocaleString()}`;
            
            // 전일
            document.getElementById('modal-yesterday-supply').textContent = 
                `원가: $${(summaryData.yesterday.supply || 0).toLocaleString()}`;
            document.getElementById('modal-yesterday-sale').textContent = 
                `매출: $${(summaryData.yesterday.sale || 0).toLocaleString()}`;
        }
        
        // 2. 차트 데이터
        const chartResponse = await fetch(`${window.API_BASE_URL}/api/chart/monthly?seller_id=${sellerId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const chartData = await chartResponse.json();
        
        // 차트 그리기
        drawModalCharts(chartData, 'monthly');
        
        // 3. 랭킹 데이터
        const rankingResponse = await fetch(`${window.API_BASE_URL}/api/rankings?seller_id=${sellerId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const rankingData = await rankingResponse.json();
        
        // 랭킹 표시
        displayModalRankings(rankingData);
        
   // 4. 전월 실적 데이터
        const lastMonthResponse = await fetch(`${window.API_BASE_URL}/api/last-month-stats?seller_id=${sellerId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const lastMonthData = await lastMonthResponse.json();
        
        // 전월 지표 표시
        document.getElementById('modal-last-month-supply').textContent = 
            `$${(lastMonthData.total_supply || 0).toLocaleString()}`;
        document.getElementById('modal-last-month-sale').textContent = 
            `$${(lastMonthData.total_sale || 0).toLocaleString()}`;
        document.getElementById('modal-last-month-quantity').textContent = 
            `${(lastMonthData.total_quantity || 0).toLocaleString()}개`;
        document.getElementById('modal-last-month-orders').textContent = 
            `${(lastMonthData.order_count || 0).toLocaleString()}건`;
        
        // 원형 차트 그리기
        drawModalPieChart(lastMonthData.top_products);
        
    } catch (error) {
        console.error('입점사 대시보드 로드 실패:', error);
    }
}


// 원형 차트 그리기 함수 추가
let modalPieChartInstance = null;

function drawModalPieChart(products) {
    if (!products || products.length === 0) {
        document.getElementById('modal-pie-legend').innerHTML = '<div>데이터가 없습니다</div>';
        return;
    }
    
    // 기존 차트 제거
    if (modalPieChartInstance) {
        modalPieChartInstance.destroy();
    }
    
    const ctx = document.getElementById('modal-pie-chart').getContext('2d');
    const labels = products.map(p => p.product_name);
    const data = products.map(p => p.sale_amount || p.supply_amount);
    
    modalPieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d',
                    '#17a2b8', '#e83e8c', '#fd7e14', '#20c997', '#6f42c1'
                ]
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const product = products[index];
                            return [
                                `${product.product_name}`,
                                `매출액(판매가): $${(product.sale_amount || 0).toLocaleString()}`,
                                `매출원가(공급가): $${(product.supply_amount || 0).toLocaleString()}`,
                                `판매수량: ${(product.quantity || 0).toLocaleString()}개`,
                                `비중: ${product.percentage}%`
                            ];
                        }
                    }
                }
            }
        }
    });
    
    // 범례 생성 - 판매수량 추가
    const legendDiv = document.getElementById('modal-pie-legend');
    let legendHTML = '';
    products.forEach((p, i) => {
        const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d'];
        legendHTML += `
            <div style="margin-bottom: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; 
                       background: ${colors[i % colors.length]}; margin-right: 8px;"></span>
                <strong>${i+1}. ${p.product_name}</strong>
                <div style="margin-left: 20px; font-size: 11px; color: #666;">
                    매출원가: $${(p.supply_amount || 0).toLocaleString()} | 
                    매출액: $${(p.sale_amount || 0).toLocaleString()} | 
                    판매수량: ${(p.quantity || 0).toLocaleString()}개 | 
                    ${p.percentage}%
                </div>
            </div>
        `;
    });
    legendDiv.innerHTML = legendHTML;
}
        
// 모달 차트 그리기
function drawModalCharts(data, viewType) {
    // 기존 차트 제거
    if (modalChartInstances.revenue) {
        modalChartInstances.revenue.destroy();
    }
    if (modalChartInstances.sales) {
        modalChartInstances.sales.destroy();
    }
    
    let labels = [];
    let revenueData = [];  // 매출액 (판매가)
    let supplyData = [];   // 매출원가 (공급가)
    let salesData = [];    // 판매수량
    
    if (viewType === 'monthly') {
        // 최근 12개월 라벨 생성
        const today = new Date();
        const dataMap = {};
        
        // 서버 데이터를 맵에 저장
        data.forEach(d => {
            dataMap[d.month] = d;
        });
        
        // 12개월 데이터 생성
        for (let i = 11; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = `${date.getMonth() + 1}월`;
            
            labels.push(monthLabel);
            
            if (dataMap[monthKey]) {
                revenueData.push(dataMap[monthKey].amount || 0);
                supplyData.push(dataMap[monthKey].supply_amount || 0);
                salesData.push(dataMap[monthKey].quantity || 0);
            } else {
                revenueData.push(0);
                supplyData.push(0);
                salesData.push(0);
            }
        }
    } else if (viewType === 'daily') {
        // 최근 30일 데이터
        const today = new Date();
        const dataMap = {};
        
        data.forEach(d => {
            dataMap[d.date] = d;
        });
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(today.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
            
            labels.push(dateLabel);
            
            if (dataMap[dateKey]) {
                revenueData.push(dataMap[dateKey].amount || 0);
                supplyData.push(dataMap[dateKey].supply_amount || 0);
                salesData.push(dataMap[dateKey].quantity || 0);
            } else {
                revenueData.push(0);
                supplyData.push(0);
                salesData.push(0);
            }
        }
    }
    
    // 최대값 계산 (20% 여유)
    const maxRevenue = Math.max(...revenueData) * 1.2;
    const maxSales = Math.max(...salesData) * 1.2;

    // 매출 차트 - 매출액만 표시, 툴팁에 두 값 모두
    const revenueCtx = document.getElementById('modal-revenue-chart').getContext('2d');
    modalChartInstances.revenue = new Chart(revenueCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '매출액',
                data: revenueData,
                backgroundColor: '#007bff'
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            return [
                                `매출액(판매가): $${revenueData[index].toLocaleString()}`,
                                `매출원가(공급가): $${supplyData[index].toLocaleString()}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: maxRevenue,
                    ticks: {
                        stepSize: Math.ceil(maxRevenue / 5),
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
    
    // 판매량 차트
    const salesCtx = document.getElementById('modal-sales-chart').getContext('2d');
    modalChartInstances.sales = new Chart(salesCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '판매량',
                data: salesData,
                backgroundColor: '#28a745'
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: maxSales,
                    ticks: {
                        stepSize: Math.ceil(maxSales / 5)
                    }
                }
            }
        }
    });
}
// 모달 랭킹 표시
function displayModalRankings(data) {
    // 매출 TOP5
    let revenueHTML = '<ol>';
    (data.month_revenue || []).forEach(item => {
        revenueHTML += `<li>${item.product_name} - $${item.amount.toLocaleString()}</li>`;
    });
    revenueHTML += '</ol>';
    document.getElementById('modal-revenue-ranking').innerHTML = revenueHTML;
    
    // 판매량 TOP5
    let quantityHTML = '<ol>';
    (data.month_quantity || []).forEach(item => {
        quantityHTML += `<li>${item.product_name} - ${item.quantity.toLocaleString()}개</li>`;
    });
    quantityHTML += '</ol>';
    document.getElementById('modal-quantity-ranking').innerHTML = quantityHTML;
}

// 전역 함수로 등록
window.viewSellerDashboard = viewSellerDashboard;

// ===== 유틸리티 함수 =====
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR');
}

function formatCurrency(amount) {
    if (!amount) return '$0';
    return '$' + amount.toLocaleString('ko-KR');
}

// 전역 함수로 노출 (HTML에서 호출 가능하도록)
window.searchSeller = searchSeller;
window.toggleAllSellers = toggleAllSellers;
window.toggleSellerSelection = toggleSellerSelection;
window.openAddSellerModal = openAddSellerModal;
window.createSeller = createSeller;
window.openEditSellerModal = openEditSellerModal;
window.updateSeller = updateSeller;
window.deleteSelectedSellers = deleteSelectedSellers;



// 파일 맨 아래에 추가
window.addEventListener('click', function(e) {
    if (e.target.onclick && e.target.onclick.toString().includes('closeModal')) {
        const modal = document.querySelector('#modalRoot .modal');
        if (modal) {
            modal.classList.remove('seller-dashboard-modal');
        }
    }
});

// sellerList.js 파일 끝에 추가
window.goToSellerPage = function(sellerId) {
    // 입점사 상세 페이지로 이동 (현재는 알림만)
    alert(`입점사 ID ${sellerId} 상세 페이지 기능은 준비 중입니다.`);
};