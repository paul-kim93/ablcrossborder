// orderSummary.js - 주문서 요약 기능

// 전역 변수
let allOrders = [];
let filteredOrders = []; 
let expandedOrders = new Set();
let currentOrderPage = 1;
const ordersPerPage = 20;
let currentOrderUserType = null;
let isLoadingOrders = false;
let selectedProductCodes = new Set();  // 선택된 제품 코드들 추가
let allSellersForOrders = []; // 입점사 목록 추가
let totalOrderCount = 0;  // 전체 주문 개수 저장용 - 새로 추가!
let currentSearchKeyword = '';  // 현재 검색어 저장 - 새로 추가!
let currentStatusFilter = '';  // 현재 상태 필터 저장 - 새로 추가!
window.selectedProductIds = window.selectedProductIds || new Set();

// 전역 변수 초기화 (안전하게 처리)

if (typeof window.selectedProductIds === 'undefined') {
    window.selectedProductIds = new Set();
}
window.currentProductIdFilter = null;

window.selectedSellerName = null;
let showUnmatchedOnly = false;

// orderSummary.js 상단에 추가
document.addEventListener('DOMContentLoaded', function() {
    // 이벤트 위임으로 X 버튼 처리
    const selectedDiv = document.getElementById('selectedOrderProducts');
    if (selectedDiv) {
        selectedDiv.addEventListener('click', function(e) {
            if (e.target.tagName === 'BUTTON') {
                const span = e.target.closest('span[data-product-code]');
                if (span) {
                    const code = span.getAttribute('data-product-code');
                    selectedProductCodes.delete(code);
                    span.remove();
                    filterOrders();
                }
            }
        });
    }
});
// 상태 스타일
const STATUS_STYLES = {
    '발송대기': 'background: #ffc107; color: #000;',
    '배송중': 'background: #17a2b8; color: #fff;',
    '통관중': 'background: #6c757d; color: #fff;',
    '배송완료': 'background: #28a745; color: #fff;',
    '주문취소': 'background: #dc3545; color: #fff;',
    '환불/교환': 'background: #e83e8c; color: #fff;'
};

async function loadOrdersData() {
    // 중복 로딩 방지
    if (isLoadingOrders) {
        console.log('[OrderSummary] 이미 로딩 중...');
        return;
    }
    
    isLoadingOrders = true;
    console.log('[OrderSummary] 주문 데이터 로드 시작');
    
    try {
        // 사용자 타입 확인
        const user = await window.API.getCurrentUser();
        currentOrderUserType = user.type;
        
        // 관리자인 경우 입점사 목록 로드
      // loadOrdersData 함수 내부 (40-48줄)
if (currentOrderUserType === 'admin') {
    try {
        allSellersForOrders = await window.API.sellers.list();
        populateSellerFilter();
        
        // 안전하게 처리
        const sellerFilter = document.getElementById('orderSellerFilter');
        if (sellerFilter) {
            sellerFilter.style.display = 'inline-block';
        }
        
        const sellerBtn = document.getElementById('sellerFilterBtn');
        if (sellerBtn) {
            sellerBtn.style.display = 'inline-block';
        }

        const unmatchedBtn = document.getElementById('unmatchedFilterBtn');
        if (unmatchedBtn) {
            unmatchedBtn.style.display = 'inline-block';
        }
        
    } catch (err) {
        console.error('입점사 목록 로드 실패:', err);
    }
}

        // 전체 데이터를 한번에 받기 (검색 기능 때문에)
        let url = `${window.API_BASE_URL}/orders/with-items?skip=0&limit=1000`;
        if (window.currentProductIdFilter) {  // 새 변수 추가 필요
            url += `&product_id=${window.currentProductIdFilter}`;
        }
        
        if (currentOrderUserType === 'seller' && user.seller_id) {
            url += `&seller_id=${user.seller_id}`;
        }
        // 바로 이 위치에 추가
        if (showUnmatchedOnly) {
            url += '&unmatched_only=true';
        }
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        allOrders = data.orders || [];
        filteredOrders = [...allOrders];
        
        // 전체 개수 저장
        totalOrderCount = data.total || allOrders.length;
        
       // 테이블 렌더링
        renderFilteredOrders();
        
        // 페이지네이션 렌더링 - 이 부분이 빠져있었음!
        const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
        renderOrderPagination(totalPages);
        
        console.log('[OrderSummary] 주문 데이터 로드 완료:', allOrders.length + '개');
        
    } catch (error) {
        console.error('[OrderSummary] 주문 데이터 로드 실패:', error);
        allOrders = [];
        renderOrdersTable();
    } finally {
        isLoadingOrders = false;
    }
}

// 테이블 렌더링
function renderOrdersTable() {
    const tbody = document.querySelector('#orderSummarySection tbody');
    if (!tbody) return;
    
    if (allOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${currentOrderUserType === 'admin' ? '9' : '8'}" 
                    style="text-align: center; padding: 20px;">
                    주문 데이터가 없습니다.
                </td>
            </tr>
        `;
        return;
    }
    
    
    let html = '';
    
    allOrders.forEach(order => {
        const isExpanded = expandedOrders.has(order.order_no);
        
        // 주문 요약 행
        html += `
            <tr style="${isExpanded ? 'background: #f0f8ff;' : ''}">
                <td style="width: 120px;">${order.order_no}</td>
                <td style="width: 100px;">${order.buyer_id}</td>
                <td style="width: 80px;">${order.item_count}종</td>
                <td style="width: 80px;">${order.total_quantity}개</td>
                <td style="width: 100px;">$${order.total_supply_amount.toFixed(2)}</td>
                ${currentOrderUserType === 'admin' ? 
                    `<td style="width: 100px;">$${order.total_sale_amount.toFixed(2)}</td>` : ''}
                <td style="width: 100px;">${new Date(order.order_time).toLocaleDateString('ko-KR')}</td>
                <td style="width: 80px;">
                    <span style="${STATUS_STYLES[order.status_display] || ''}; 
                               padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                        ${order.status_display}
                    </span>
                </td>
                <td style="width: 100px;">
                    <button onclick="toggleOrderDetail('${order.order_no}')" 
                            style="font-size: 12px; padding: 4px 8px;">
                        ${isExpanded ? '▲접기' : '▼펼치기'}
                    </button>
                </td>
            </tr>
        `;
        
       
// 제품 상세 행들 (펼쳤을 때만 표시)
if (isExpanded && order.items) {
    order.items.forEach(item => {
        // 가격이 0인지 체크
        const isUnmatched = item.supply_price === 0 && item.sale_price === 0;
        
        html += `
            <tr style="background: #f8f9fa;">
                <td style="padding-left: 30px; width: 120px;">└─</td>
                <td colspan="2" style="text-align: left;">
                    ${item.product_name} (${item.product_code})
                    ${isUnmatched ? '<span style="color: red; font-weight: bold;"> ⚠️ 미연결</span>' : ''}
                </td>
                <td style="width: 80px;">${item.quantity}개</td>
                <td style="width: 100px;">
                    ${isUnmatched ? 
                        `<div style="color: red; font-weight: bold;">
                            제품 등록 필요<br>
                            <small>가격 미설정</small>
                        </div>` :
                        `<div style="font-size: 13px; line-height: 1.4;">
                            공급가: $${item.supply_price.toFixed(2)}<br>
                            총액: $${item.supply_total.toFixed(2)}
                        </div>`
                    }
                </td>
                ${currentOrderUserType === 'admin' ? 
                    `<td style="width: 100px;">
                        ${isUnmatched ? 
                            `<div style="color: red; font-weight: bold;">
                                제품 등록 필요<br>
                                <small>가격 미설정</small>
                            </div>` :
                            `<div style="font-size: 13px; line-height: 1.4;">
                                판매가: $${item.sale_price.toFixed(2)}<br>
                                총액: $${item.sale_total.toFixed(2)}
                            </div>`
                        }
                    </td>` : ''}
                <td colspan="2"></td>
                <td style="width: 100px;">
                    ${currentOrderUserType === 'admin' ? 
                        `<button onclick="openPriceEditModal(${item.id}, ${item.supply_price}, ${item.sale_price})" 
                                style="font-size: 11px; padding: 3px 10px; 
                                       background: #007bff; color: white; 
                                       border: none; border-radius: 3px;">
                            ${isUnmatched ? '가격설정' : '가격수정'}
                        </button>` : ''}
                </td>
            </tr>
        `;
    });
}
    });
    
    tbody.innerHTML = html;
}

function toggleUnmatchedFilter() {
    showUnmatchedOnly = !showUnmatchedOnly;
    const btn = document.getElementById('unmatchedFilterBtn');
    
    if (showUnmatchedOnly) {
        btn.style.background = '#28a745';
        btn.textContent = '전체 보기';
    } else {
        btn.style.background = '#dc3545';
        btn.textContent = '미등록 제품 보기';
    }
    
    currentOrderPage = 1;
    loadOrdersData();  // loadOrderSummary가 아니라 loadOrdersData
}


// 개별 아이템 상세 토글
function toggleItemDetail(itemKey) {
    if (expandedOrders.has(itemKey)) {
        expandedOrders.delete(itemKey);
    } else {
        expandedOrders.add(itemKey);
    }
    renderFilteredOrders();
}

// 🔴 기존 함수를 아래로 교체
function openPriceEditModal(itemId, currentSupply, currentSale) {
    const modalHTML = `
        <div style="padding: 20px;">
            <h3 style="margin-bottom: 20px;">가격 수정</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">공급가 ($)</label>
                <input type="number" id="editSupplyPrice" 
                       value="${currentSupply.toFixed(2)}"
                       step="0.01"
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">판매가 ($)</label>
                <input type="number" id="editSalePrice" 
                       value="${currentSale.toFixed(2)}"
                       step="0.01"
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <!-- ✅ 변경 사유 필드 추가 -->
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">변경 사유</label>
                <input type="text" id="editNote" 
                       placeholder="예: 원가 인상, 프로모션 적용"
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <p style="color: #dc3545; font-size: 12px;">
                ⚠️ 가격 수정은 이 주문에만 적용됩니다.
            </p>
        </div>
    `;
    
    const footerHTML = `
        <button onclick="savePriceEdit(${itemId})" style="background: #007bff; color: white; padding: 8px 16px; border: none; border-radius: 4px;">저장</button>
        <button onclick="viewPriceHistory(${itemId})" style="background: #6c757d; color: white; padding: 8px 16px; border: none; border-radius: 4px;">변경이력</button>
        <button onclick="closeModal()" style="background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px;">취소</button>
    `;
    
    window.openModal({
        title: '주문 아이템 가격 수정',
        bodyHTML: modalHTML,
        footerHTML: footerHTML
    });
}

async function savePriceEdit(itemId) {
    const supplyPrice = document.getElementById('editSupplyPrice').value;
    const salePrice = document.getElementById('editSalePrice').value;
    const note = document.getElementById('editNote').value;
    
    if (!supplyPrice || !salePrice) {
        alert('가격을 입력해주세요.');
        return;
    }
    
    // 🔴 회전하는 로딩 인디케이터
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'priceUpdateLoading';
    loadingDiv.innerHTML = `
        <div id="loadingContent" style="background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.2); min-width: 300px;">
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
            <div id="spinner" style="
                width: 50px; 
                height: 50px; 
                border: 5px solid #f3f3f3; 
                border-top: 5px solid #007bff; 
                border-radius: 50%; 
                animation: spin 1s linear infinite; 
                margin: 0 auto 20px;
            "></div>
            <div id="loadingTitle" style="font-weight: bold; font-size: 18px; margin-bottom: 10px;">가격 수정 중...</div>
            <div id="loadingText" style="color: #666; font-size: 14px;">통계 데이터 계산중입니다</div>
            <div id="loadingSubtext" style="color: #999; font-size: 12px; margin-top: 10px;">잠시만 기다려주세요...</div>
        </div>
    `;
    loadingDiv.style.cssText = `
        position: fixed; 
        top: 0; 
        left: 0; 
        right: 0; 
        bottom: 0; 
        background: rgba(0,0,0,0.7); 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        z-index: 10000;
    `;
    document.body.appendChild(loadingDiv);
    
    try {
        const formData = new FormData();
        formData.append('supply_price', supplyPrice);
        formData.append('sale_price', salePrice);
        formData.append('note', note || '');
        
        const response = await fetch(`${window.API_BASE_URL}/order-items/${itemId}/price`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        if (response.ok) {
            // 🔴 모달 먼저 닫기
            window.closeModal();
            
           // 🔴 로딩창을 성공 메시지로 변경
            const spinner = document.getElementById('spinner');
            const title = document.getElementById('loadingTitle');
            const text = document.getElementById('loadingText');
            const subtext = document.getElementById('loadingSubtext');

            if (spinner) {
                // 애니메이션 제거하고 체크마크로 변경
                spinner.style.animation = 'none';  // 🔴 이 줄 추가!
                spinner.style.border = 'none';     // 🔴 이 줄도 추가!
                spinner.innerHTML = '<div style="font-size: 40px;">✅</div>';
            }
            if (title) {
                title.textContent = '수정이 완료되었습니다!';
                title.style.color = '#28a745';
            }
            if (text) text.textContent = '통계가 업데이트되었습니다';
            if (subtext) subtext.textContent = '잠시 후 자동으로 닫힙니다';
            
            // 🔴 1.5초 후 자동으로 닫기
            setTimeout(() => {
                document.getElementById('priceUpdateLoading')?.remove();
            }, 1500);
            
            // 데이터 새로고침
            loadOrdersData();
            
        } else {
            document.getElementById('priceUpdateLoading')?.remove();
            alert('가격 수정에 실패했습니다.');
        }
    } catch (error) {
        console.error('가격 수정 오류:', error);
        document.getElementById('priceUpdateLoading')?.remove();
        alert('가격 수정 중 오류가 발생했습니다.');
    }
}

// 🔴 새로운 함수 추가
// 가격 변경 이력 보기
async function viewPriceHistory(itemId) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/order-items/${itemId}/audit-history`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('이력 조회 실패');
        }
        
        const history = await response.json();
        
        let historyHTML = '';
        if (history.length === 0) {
            historyHTML = '<p style="text-align: center; padding: 20px;">변경 이력이 없습니다.</p>';
        } else {
            historyHTML = `
                <div style="padding: 20px; max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="padding: 8px; border: 1px solid #dee2e6; text-align: left;">변경일시</th>
                                <th style="padding: 8px; border: 1px solid #dee2e6; text-align: left;">변경자</th>
                                <th style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">공급가</th>
                                <th style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">판매가</th>
                                <th style="padding: 8px; border: 1px solid #dee2e6; text-align: left;">사유</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            history.forEach(h => {
                const changeDate = new Date(h.changed_at).toLocaleString('ko-KR');
                const supplyChange = h.from_supply_price !== null ? 
                    `$${h.from_supply_price} → $${h.to_supply_price}` : '-';
                const saleChange = h.from_sale_price !== null ? 
                    `$${h.from_sale_price} → $${h.to_sale_price}` : '-';
                
                historyHTML += `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #dee2e6;">${changeDate}</td>
                        <td style="padding: 8px; border: 1px solid #dee2e6;">${h.changed_by}</td>
                        <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">${supplyChange}</td>
                        <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">${saleChange}</td>
                        <td style="padding: 8px; border: 1px solid #dee2e6;">${h.note || '-'}</td>
                    </tr>
                `;
            });
            
            historyHTML += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        const footerHTML = `
            <button onclick="closeModal()" style="background: #6c757d; color: white; padding: 8px 16px; border: none; border-radius: 4px;">닫기</button>
        `;
        
        window.openModal({
            title: '가격 변경 이력',
            bodyHTML: historyHTML,
            footerHTML: footerHTML
        });
        
    } catch (error) {
        console.error('이력 조회 실패:', error);
        alert('이력을 불러올 수 없습니다.');
    }
}

// 페이지네이션 렌더링
function renderOrderPagination(totalPages) {
    let paginationDiv = document.getElementById('orderPagination');
    
    if (!paginationDiv) {
        const section = document.getElementById('orderSummarySection');
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'orderPagination';
        paginationDiv.style.cssText = 'text-align: center; margin-top: 15px;';
        section.appendChild(paginationDiv);
    }
    
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `
            <button onclick="goToOrderPage(${i})"
                    style="padding: 6px 12px; margin: 0 4px; border: 1px solid #ccc;
                           background: ${i === currentOrderPage ? '#007bff' : '#f9f9f9'};
                           color: ${i === currentOrderPage ? 'white' : '#333'};
                           border-radius: 4px; cursor: pointer;">
                ${i}
            </button>
        `;
    }
    paginationDiv.innerHTML = html;
}

// 검색 함수
function searchOrders() {
    const keyword = document.getElementById('orderSearchInput').value.toLowerCase();
    
    if (!keyword) {
        filteredOrders = [...allOrders];
    } else {
        filteredOrders = allOrders.filter(order => {
            // 안전 체크
            if (!order) return false;
            
            // 주문번호 검색
            if (order.order_no && order.order_no.toLowerCase().includes(keyword)) return true;
            
            // 구매자ID 검색
            if (order.buyer_id && order.buyer_id.toLowerCase().includes(keyword)) return true;
            
            // 제품명 검색 - items가 있을 때만
            if (order.items && Array.isArray(order.items)) {
                const hasProduct = order.items.some(item => 
                    item && item.product_name && item.product_name.toLowerCase().includes(keyword)
                );
                if (hasProduct) return true;
            }
            
            // 제품명이 order에 직접 있는 경우 (플랫 구조)
            if (order.product_name && order.product_name.toLowerCase().includes(keyword)) return true;
            
            return false;
        });
    }
    
    currentOrderPage = 1;
    renderFilteredOrders();
}

function filterOrders() {
    const status = document.getElementById('orderStatusFilter').value;
    const keyword = document.getElementById('orderSearchInput').value.toLowerCase();
    const startDate = document.getElementById('orderStartDate').value;
    const endDate = document.getElementById('orderEndDate').value;
    const sellerName = window.selectedSellerName;
    
    console.log('입점사 필터 적용:', sellerName);

    filteredOrders = allOrders.filter(item => {  // order가 아니라 item
        if (!item) return false;
        
        // 검색어 필터
        if (keyword) {
            const matchOrder = (item.order_no && item.order_no.toLowerCase().includes(keyword)) ||
                              (item.buyer_id && item.buyer_id.toLowerCase().includes(keyword)) ||
                              (item.product_name && item.product_name.toLowerCase().includes(keyword));
            
            if (!matchOrder) return false;
        }
        
        // 상태 필터
        if (status && item.status_display !== status) return false;
        
        // 날짜 필터
        if (startDate || endDate) {
            const orderDate = new Date(item.order_time).toISOString().split('T')[0];
            if (startDate && orderDate < startDate) return false;
            if (endDate && orderDate > endDate) return false;
        }
        
        // 제품 필터 - 단순화
        // 제품 필터 부분 디버깅 추가
// 540번 줄부터 555번 줄 사이를 이렇게 수정
// 제품 필터 - product_id로 비교
if (window.selectedProductIds && window.selectedProductIds.size > 0) {
    if (!item.product_id || !window.selectedProductIds.has(parseInt(item.product_id))) {
        return false;
    }
}
        
// 입점사 필터 - 완전히 새로 작성!
        if (sellerName && sellerName !== '' && currentOrderUserType === 'admin') {
            console.log(`비교: 아이템 입점사 [${item.seller_name}] vs 선택 [${sellerName}]`);
            
            // 이름으로 비교!
            if (item.seller_name !== sellerName) {
                return false;
            }
        }
        
        return true;
    });
    
    console.log('필터 결과:', filteredOrders.length + '개');
    currentOrderPage = 1;
    renderFilteredOrders();
}

// 필터 초기화
function resetOrderFilters() {
    document.getElementById('orderSearchInput').value = '';
    document.getElementById('orderStatusFilter').value = '';
    document.getElementById('orderStartDate').value = '';
    document.getElementById('orderEndDate').value = '';
    
    // 입점사 필터 초기화
    window.selectedSellerName = null;
    const nameSpan = document.getElementById('selectedSellerName');
    if (nameSpan) nameSpan.textContent = '';
    
    // 제품 필터 초기화
    selectedProductCodes.clear();
    const selectedDiv = document.getElementById('selectedOrderProducts');
    if (selectedDiv) selectedDiv.innerHTML = '';
    
    filteredOrders = [...allOrders];
    currentOrderPage = 1;
    renderFilteredOrders();
}

// 필터링된 주문 렌더링
function renderFilteredOrders() {
    const tbody = document.querySelector('#orderSummarySection tbody');
    if (!tbody) return;
    
    // 페이지네이션 적용
    const startIndex = (currentOrderPage - 1) * ordersPerPage;
    const endIndex = startIndex + ordersPerPage;
    const pageOrders = filteredOrders.slice(startIndex, endIndex);
    
    if (pageOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${currentOrderUserType === 'admin' ? '9' : '8'}" 
                    style="text-align: center; padding: 20px;">
                    ${filteredOrders.length === 0 ? '주문 데이터가 없습니다.' : '검색 결과가 없습니다.'}
                </td>
            </tr>
        `;
        renderOrderPagination(0);
        return;
    }
    
    let html = '';
    
    pageOrders.forEach((item, index) => {  // index 추가
        const isUnmatched = item.supply_price === 0 && item.sale_price === 0;
        const itemKey = `${item.order_no}_${item.item_id}`;
        const isExpanded = expandedOrders.has(itemKey);
        const rowNumber = startIndex + index + 1;  // 전체 순번 계
        
        html += `
           <tr style="${isExpanded ? 'background: #f0f8ff;' : ''}">
                <td style="width: 40px; text-align: center; font-weight: 500;">
                    ${rowNumber}
                </td>  <!-- 번호 추가 -->
                <td style="width: 100px; font-size: 13px; font-weight: 500;">${item.order_no}</td>
                <td style="width: 250px; padding: 8px;">
                    <div style="font-size: 13px; line-height: 1.5; word-break: break-word;">
                        ${item.product_name}
                        ${isUnmatched ? '<span style="color: red; font-weight: bold;"> ⚠️ 미등록</span>' : ''}
                    </div>
                    ${isExpanded ? 
                        `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ddd; 
                                    font-size: 11px; color: #666;">
                            <strong>제품코드:</strong> ${item.product_code} &nbsp;&nbsp;|&nbsp;&nbsp; 
                            <strong>입점사:</strong> ${item.seller_name || '미확인'}
                        </div>` : ''}
                </td>
                <td style="width: 60px; text-align: center;">${item.quantity}개</td>
                <td style="width: 80px; text-align: right;">
                    ${isUnmatched ? 
                        '<span style="color: red;">$0.00</span>' :
                        `$${item.supply_total.toFixed(2)}`}
                    ${isExpanded && !isUnmatched ? 
                        `<div style="font-size: 11px; color: #666; margin-top: 4px;">
                            개당: $${item.supply_price.toFixed(2)}
                        </div>` : ''}
                </td>
                ${currentOrderUserType === 'admin' ? 
                    `<td style="width: 80px; text-align: right;">
                        ${isUnmatched ? 
                            '<span style="color: red;">$0.00</span>' :
                            `$${item.sale_total.toFixed(2)}`}
                        ${isExpanded && !isUnmatched ? 
                            `<div style="font-size: 11px; color: #666; margin-top: 4px;">
                                개당: $${item.sale_price.toFixed(2)}
                            </div>` : ''}
                    </td>` : ''}
                <td style="width: 80px; text-align: center;">${item.buyer_id}</td>
                <td style="width: 100px; text-align: center;">
                    ${new Date(item.order_time).toLocaleDateString('ko-KR')}
                </td>
                <td style="width: 80px; text-align: center;">
                    <span style="${STATUS_STYLES[item.status_display] || ''}; 
                               padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                        ${item.status_display}
                    </span>
                </td>
                <td style="width: 60px; text-align: center;">
                        ${!isExpanded ? 
                            // 펼치기 전: 펼치기 버튼만
                            `<button onclick="toggleItemDetail('${itemKey}')" 
                                    style="font-size: 11px; padding: 4px 8px; 
                                        background: #f8f9fa; color: #333; 
                                        border: 1px solid #dee2e6; 
                                        border-radius: 3px; cursor: pointer;">
                                ▼펼치기
                            </button>` :
                            // 펼친 후: 접기 + 수정 버튼
                            `<div style="display: flex; flex-direction: column; gap: 2px;">
                                <button onclick="toggleItemDetail('${itemKey}')" 
                                        style="font-size: 11px; padding: 4px 8px; 
                                            background: #f8f9fa; color: #333;
                                            border: 1px solid #dee2e6; 
                                            border-radius: 3px; cursor: pointer;">
                                    ▲접기
                                </button>
                                ${currentOrderUserType === 'admin' ? 
                                    `<button onclick="openPriceEditModal(${item.item_id || 0}, ${item.supply_price || 0}, ${item.sale_price || 0})" 
                                            style="font-size: 11px; padding: 4px 8px;
                                                background: #007bff; color: white; 
                                                border: none; border-radius: 3px; cursor: pointer;">
                                        ${isUnmatched ? '가격설정' : '수정'}
                                    </button>` : ''}
                            </div>`
                        }
                    </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    
// 페이지네이션 업데이트
let totalPages;

// 필터가 적용되었는지 확인
const isFiltered = filteredOrders.length !== allOrders.length;

if (isFiltered) {
    // 필터 적용시: 필터된 데이터로 계산
    totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
} else {
    // 필터 없을 때: 전체 데이터로 계산
    // 만약 서버에서 1000개 다 받았으면 allOrders.length 사용
    totalPages = Math.ceil(allOrders.length / ordersPerPage);
}

console.log('[DEBUG] 페이지네이션:', {
    전체데이터: allOrders.length,
    필터데이터: filteredOrders.length,
    페이지당: ordersPerPage,
    총페이지: totalPages,
    현재페이지: currentOrderPage
});

renderOrderPagination(totalPages);
}

// 페이지 이동
function goToOrderPage(page) {
    currentOrderPage = page;
    renderFilteredOrders();  // 현재 필터된 데이터에서 페이지만 변경

}

// ========== 여기부터 새로 추가 ==========

// 날짜 범위 설정
function setDateRange(range) {
    const today = new Date();
    const startInput = document.getElementById('orderStartDate');
    const endInput = document.getElementById('orderEndDate');
    
    endInput.value = today.toISOString().split('T')[0];
    
    switch(range) {
        case 'today':
            startInput.value = today.toISOString().split('T')[0];
            break;
        case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(today.getDate() - 7);
            startInput.value = weekAgo.toISOString().split('T')[0];
            break;
        case 'month':
            const monthAgo = new Date(today);
            monthAgo.setMonth(today.getMonth() - 1);
            startInput.value = monthAgo.toISOString().split('T')[0];
            break;
    }
    
    filterOrders();
}

// 입점사 필터 채우기
function populateSellerFilter() {
    const sellerFilter = document.getElementById('orderSellerFilter');
    if (!sellerFilter) return;
    
    let html = '<option value="">전체 입점사</option>';
    allSellersForOrders.forEach(seller => {
        html += `<option value="${seller.id}">${seller.name}</option>`;
    });
    sellerFilter.innerHTML = html;
}

// 제품 선택 모달 열기
async function openOrderProductFilterModal() {
    // 👇 이 부분 추가!
    if (allOrders.length === 0) {
        console.log('주문 데이터가 없어서 먼저 로드합니다...');
        await loadOrdersData();
    }
    const modalHTML = `
        <div style="padding: 20px; max-height: 60vh; overflow-y: auto;">
            <h3 style="margin-bottom: 20px;">제품 선택</h3>
            
            <input type="text" id="modalProductSearch" 
                   placeholder="제품명 또는 코드 검색"
                   onkeyup="filterModalProducts()"
                   style="width: 100%; padding: 8px; margin-bottom: 15px; 
                          border: 1px solid #ddd; border-radius: 4px;">
            
            <div id="modalProductList" style="max-height: 400px; overflow-y: auto;">
                <p>로딩 중...</p>
            </div>
        </div>
    `;
    
    const footerHTML = `
        <button onclick="applyOrderProductFilter()" style="background: #28a745; color: white;">적용</button>
        <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
    `;
    
    window.openModal({
        title: '제품 필터',
        bodyHTML: modalHTML,
        footerHTML: footerHTML
    });
    
    // setTimeout으로 DOM 렌더링 완료 후 실행
    setTimeout(() => {
        loadProductsForFilter();
    }, 100);
}

// 제품 목록 로드
async function loadProductsForFilter() {
    try {
         // 사용자 정보 확인 추가
        const user = await window.API.getCurrentUser();
        let products = await window.API.products.list();
        
        // 입점사 계정: 자기 제품만 필터링
        if (user.type === 'seller' && user.seller_id) {
            products = products.filter(p => p.seller_id === user.seller_id);
        }
        const listDiv = document.getElementById('modalProductList');
        
        let html = '';
        products.forEach(product => {
            const checked = selectedProductCodes.has(product.product_code) ? 'checked' : '';
            html += `
                <label style="display: block; padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;">
                    <input type="checkbox" 
                        value="${product.product_code}" 
                        data-id="${product.id}"  // 추가
                        data-name="${product.name}" ${checked}>
                    ${product.name} (${product.product_code})
                </label>
            `;
        });
        
        listDiv.innerHTML = html || '<p>제품이 없습니다.</p>';
    } catch (error) {
        console.error('제품 로드 실패:', error);
    }
}

// 모달 내 제품 검색
function filterModalProducts() {
    const keyword = document.getElementById('modalProductSearch').value.toLowerCase();
    const labels = document.querySelectorAll('#modalProductList label');
    
    labels.forEach(label => {
        const text = label.textContent.toLowerCase();
        label.style.display = text.includes(keyword) ? 'block' : 'none';
    });
}

// 제품 필터 적용
        // 맞는 함수명
            function applyOrderProductFilter() {
    selectedProductCodes.clear();
    window.selectedProductIds = new Set();  // product_id도 저장
    const selectedDiv = document.getElementById('selectedOrderProducts');
    let tags = '';
    
    document.querySelectorAll('#modalProductList input:checked').forEach(checkbox => {
        const code = checkbox.value;
        const name = checkbox.dataset.name;
        const productId = checkbox.dataset.id;  // product_id 가져오기
        
        selectedProductCodes.add(code);
        if (productId) {
            window.selectedProductIds.add(parseInt(productId));  // ID 저장
        }
        
        tags += `
            <span data-product-code="${code}" 
                  data-product-id="${productId}"  // ID도 저장
                  style="display: inline-block; padding: 4px 8px; margin: 2px;
                         background: #e9ecef; border-radius: 4px; font-size: 12px;">
                ${name}
                <button onclick="removeProductFilter('${code}')" 
                        style="margin-left: 5px; border: none; background: none; 
                               color: #dc3545; cursor: pointer;">×</button>
            </span>
        `;
    });
    
    selectedDiv.innerHTML = tags;
    closeModal();
    filterOrders();
}

// 제품 필터 제거
// removeProductFilter 함수 완전 교체
function removeProductFilter(productCode) {
    console.log('제거할 제품 코드:', productCode);
    
    // Set에서 제거
    selectedProductCodes.delete(productCode);
    
    // DOM에서 해당 태그 찾아서 제거
    const selectedDiv = document.getElementById('selectedOrderProducts');
    if (selectedDiv) {
        // querySelectorAll로 data 속성으로 찾기
        const targetSpan = selectedDiv.querySelector(`[data-product-code="${productCode}"]`);
        if (targetSpan) {
            targetSpan.remove();
        }
    }
    
    // 필터 다시 적용
    filterOrders();
}



// 입점사 필터 모달 열기
// openSellerFilterModal 함수 수정
async function openSellerFilterModal() {
    // 👇 이 부분 추가!
    if (allOrders.length === 0) {
        console.log('주문 데이터가 없어서 먼저 로드합니다...');
        await loadOrdersData();
    }
    
    
    let html = '<div style="max-height: 400px; overflow-y: auto;">';
    
    // 전체 입점사 옵션
    html += `
        <label style="display: block; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;">
            <input type="radio" name="seller" value="" 
                   ${!window.selectedSellerName ? 'checked' : ''}>
            전체 입점사
        </label>
    `;
    
    // 각 입점사 옵션 - value를 name으로 변경!
    allSellersForOrders.forEach(seller => {
        html += `
            <label style="display: block; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;">
                <input type="radio" name="seller" value="${seller.name}" 
                       ${window.selectedSellerName == seller.name ? 'checked' : ''}>
                ${seller.name}
            </label>
        `;
    });
    
    html += '</div>';
    
    const footerHTML = `
        <button onclick="applySellerFilter()" style="background: #28a745; color: white;">적용</button>
        <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
    `;
    
    window.openModal({
        title: '입점사 선택',
        bodyHTML: html,
        footerHTML: footerHTML
    });
}

// 입점사 필터 적용
function applySellerFilter() {
    const selected = document.querySelector('input[name="seller"]:checked');
    if (selected) {
        window.selectedSellerName = selected.value || null;
        
        console.log('선택된 입점사명:', window.selectedSellerName);
        
        const nameSpan = document.getElementById('selectedSellerName');
        if (nameSpan) {
            nameSpan.textContent = window.selectedSellerName ? `(${window.selectedSellerName})` : '';
        }
    }
    
    closeModal();
    filterOrders();
}

// filterOrders 함수에서 수정 (380줄 근처)
// 기존: const sellerId = document.getElementById('orderSellerFilter')?.value;

// 전역 함수 등록
window.openSellerFilterModal = openSellerFilterModal;
window.applySellerFilter = applySellerFilter;
// ========== 여기까지 새로 추가 ==========

// 전역 함수 노출
window.loadOrdersData = loadOrdersData;
window.toggleItemDetail = toggleItemDetail;
window.openPriceEditModal = openPriceEditModal;
window.savePriceEdit = savePriceEdit;
window.goToOrderPage = goToOrderPage;
window.searchOrders = searchOrders;
window.filterOrders = filterOrders;
window.resetOrderFilters = resetOrderFilters;
// 새로 추가할 전역 함수들
window.setDateRange = setDateRange;
window.openOrderProductFilterModal = openOrderProductFilterModal;
window.applyOrderProductFilter = applyOrderProductFilter;
window.removeProductFilter = removeProductFilter;
window.filterModalProducts = filterModalProducts;
window.viewPriceHistory = viewPriceHistory; 
window.toggleUnmatchedFilter = toggleUnmatchedFilter;