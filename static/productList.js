// productList.js - 제품 관리 기능 (모달 수정 방식)

// 전역 변수
let allProducts = [];  // 전체 제품 목록
let filteredProducts = [];  // 필터링된 제품 목록
let allSellersForProduct = [];  // 입점사 목록 (제품 생성/수정용)
let tempSelectedSeller = null;  // 임시 선택된 입점사
let editingProductId = null;  // 수정 중인 제품 ID
let currentUserType = null;  // 현재 사용자 타입
let selectedSellerIdForFilter = null;
// 이미지 순서 관리 변수
let imageOrder = [];
let draggedIndex = null;

// chart.js와 공유하는 전역 변수 - 이미 chart.js에 선언되어 있으면 사용
if (typeof selectedProductIds === 'undefined') {
    window.selectedProductIds = [];  // 배열로 선언
}

// Set 대신 배열 사용을 위한 헬퍼 함수
const selectedProductSet = new Set();  // 내부적으로 Set 사용

// 페이지네이션 변수
let currentPage = 1;
const itemsPerPage = 20;

// ===== 페이지 로드시 초기화 =====
document.addEventListener('DOMContentLoaded', function() {
    // 제품관리 메뉴 클릭시 데이터 로드
    const menuProducts = document.getElementById('menu-products');
    if (menuProducts) {
        menuProducts.addEventListener('click', loadProductsData);
    }
    
    // 검색 이벤트
    const productSearchInput = document.getElementById('productSearchInput');
    const productSearchBtn = document.getElementById('productSearchBtn');
    
    if (productSearchInput) {
        productSearchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                searchProducts();
            }
        });
    }
    
    if (productSearchBtn) {
        productSearchBtn.addEventListener('click', searchProducts);
    }
});

// ===== 제품 데이터 로드 =====
async function loadProductsData() {
    try {
        // 사용자 정보 확인
        const user = await window.API.getCurrentUser();
        currentUserType = user.type;
        
        // 관리자인 경우 입점사 필터 버튼 표시
        if (currentUserType === 'admin') {
            const sellerBtn = document.getElementById('sellerFilterBtnForList');
            if (sellerBtn) {
                sellerBtn.style.display = 'inline-block';
            }
        }

        // 제품 목록과 입점사 목록 가져오기
        let [products, sellers] = await Promise.all([
            window.API.products.list(true),  // 비활성 제품도 포함
            window.API.sellers.list()
        ]);
        
         // 🔴 추가: 입점사는 자기 제품만 필터링
        if (currentUserType === 'seller' && user.seller_id) {
            products = products.filter(p => p.seller_id === user.seller_id);
        }
        
        // 🔴 추가: 버튼 표시/숨김 처리
        const createBtn = document.getElementById('createProductBtn');
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        
        if (currentUserType === 'seller') {
            if (createBtn) createBtn.style.display = 'none';
            if (deleteBtn) deleteBtn.style.display = 'none';
            const sellerBtn = document.getElementById('sellerFilterBtnForList');
            if (sellerBtn) sellerBtn.style.display = 'none';
        } else {
            if (createBtn) createBtn.style.display = 'inline-block';
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
        }

        allProducts = products;
        allSellersForProduct = sellers;
        filteredProducts = [...allProducts];
        
        // 테이블 렌더링
        renderProductTable();
        
        console.log('제품 데이터 로드 완료:', allProducts.length + '개');
    } catch (error) {
        console.error('제품 데이터 로드 실패:', error);
        alert('제품 목록을 불러오는데 실패했습니다.');
    }
}

// ===== 제품 테이블 렌더링 =====
function renderProductTable() {
    const tbody = document.getElementById('productListTableBody');
    if (!tbody) return;
    
    // 페이지네이션 계산
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageProducts = filteredProducts.slice(startIndex, endIndex);
    
    if (pageProducts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align: center; padding: 20px;">
                    등록된 제품이 없습니다.
                </td>
            </tr>
        `;
        renderPagination(0);
        return;
    }
    
    // 관리자 권한 체크
    const adminOnlyStyle = currentUserType === 'admin' ? '' : 'display: none;';
    const sellerOnlyStyle = currentUserType === 'seller' ? 'display: none;' : '';
    
    tbody.innerHTML = pageProducts.map(product => {
        const seller = allSellersForProduct.find(s => s.id === product.seller_id);
        const sellerName = seller ? seller.name : '-';
        
        // 썸네일 처리
        // renderProductTable 함수에서 썸네일 부분만 수정
const thumbnailHtml = product.thumbnail_url ? 
    (product.thumbnail_url.startsWith('http') ? 
        `<img src="${product.thumbnail_url}" 
              alt="${product.name}" 
              style="width: 50px; height: 50px; object-fit: cover; cursor: pointer;" 
              onclick="showImageLarge('${product.thumbnail_url}', '${product.name.replace(/'/g, "\\'")}')"
              title="클릭하면 확대">` :
        `<img src="/static/${product.thumbnail_url}" 
              alt="${product.name}" 
              style="width: 50px; height: 50px; object-fit: cover; cursor: pointer;" 
              onclick="showImageLarge('/static/${product.thumbnail_url}', '${product.name.replace(/'/g, "\\'")}')"
              title="클릭하면 확대">`)
    : '<div style="width: 50px; height: 50px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; color: #999; font-size: 10px;">No Image</div>';
        // 현재 수량 처리
        const currentStock = product.current_stock !== undefined && product.current_stock !== null 
            ? product.current_stock 
            : product.initial_stock;
        
        return `
            <tr data-product-id="${product.id}" ${product.is_active === 0 ? 'style="opacity: 0.6;"' : ''}>
                <td>
                    <input type="checkbox" 
                           value="${product.id}" 
                           onchange="toggleProductSelection(${product.id})"
                           ${selectedProductSet.has(product.id) ? 'checked' : ''}
                    >
                </td>
                <td>${thumbnailHtml}</td>
                <td>${product.name}</td>
                <td>${product.product_code}</td>
                <td>${sellerName}</td>
                <td style="${adminOnlyStyle}">${product.initial_stock}</td>
                <td>${currentStock}</td>
                <td>${formatCurrency(product.supply_price)}</td>
                <td style="${sellerOnlyStyle}">${formatCurrency(product.sale_price)}</td>
                <td>
                    <button onclick="showDetailImage(${product.id})" style="font-size: 12px;">
                        상세보기
                    </button>
                </td>
                <td>
                    <button onclick="showSalesHistory(${product.id})" style="font-size: 12px;">
                        판매기록
                    </button>
                </td>
                <td>
                    <button onclick="openEditProductModal(${product.id})" 
                            style="font-size: 12px; background: #007bff; color: white; padding: 4px 8px; 
                                   border: none; border-radius: 3px; cursor: pointer;
                                   ${currentUserType === 'seller' ? 'display: none;' : ''}">
                        수정
                    </button>
                    <button onclick="openStockManageModal(${product.id})" 
                            style="font-size: 12px; background: #17a2b8; color: white; padding: 4px 8px;
                                   border: none; border-radius: 3px; cursor: pointer; margin-left: 4px; ${adminOnlyStyle}">
                        재고관리
                    </button>
                    <button onclick="toggleProductStatus(${product.id}, ${product.is_active})" 
                            style="font-size: 12px; background: ${product.is_active ? '#dc3545' : '#28a745'}; 
                                   color: white; padding: 4px 8px; border: none; border-radius: 3px; 
                                   cursor: pointer; margin-left: 4px; ${adminOnlyStyle}">
                        ${product.is_active ? '비활성' : '활성'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // 페이지네이션 렌더링
    renderPagination(totalPages);
}

// ===== 페이지네이션 렌더링 =====
function renderPagination(totalPages) {
    const paginationDiv = document.getElementById('pagination');
    if (!paginationDiv) return;
    
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `
            <button class="page-btn ${i === currentPage ? 'active' : ''}" 
                    onclick="goToPage(${i})">${i}</button>
        `;
    }
    paginationDiv.innerHTML = html;
}

// 이미지 파일 검증
async function validateImageFile(file) {
    // 파일 크기 체크 (25MB)
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
        return {
            valid: false,
            error: `파일 크기 초과: ${(file.size/1024/1024).toFixed(1)}MB (최대 25MB)`
        };
    }
    
    // 해상도 체크
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const megapixels = (img.width * img.height) / 1000000;
            
            if (megapixels > 25) {
                resolve({
                    valid: false,
                    error: `해상도 초과: ${megapixels.toFixed(1)}MP (최대 25MP)\n크기: ${img.width}×${img.height}px`
                });
            } else {
                resolve({valid: true});
            }
        };
        img.src = URL.createObjectURL(file);
    });
}

// 여러 파일 검증
async function validateMultipleFiles(files) {
    for (let i = 0; i < files.length; i++) {
        const result = await validateImageFile(files[i]);
        if (!result.valid) {
            return {
                valid: false,
                error: `${files[i].name}: ${result.error}`
            };
        }
    }
    return {valid: true};
}

// ===== 페이지 이동 =====
function goToPage(page) {
    currentPage = page;
    renderProductTable();
}

// ===== 제품 검색 =====
function searchProducts() {
    const searchInput = document.getElementById('productSearchInput');
    const keyword = searchInput.value.trim().toLowerCase();
    
    if (!keyword) {
        filteredProducts = [...allProducts];
    } else {
        filteredProducts = allProducts.filter(product => 
            product.name.toLowerCase().includes(keyword) ||
            product.product_code.toLowerCase().includes(keyword)
        );
    }
    
    currentPage = 1;  // 검색시 첫 페이지로
    renderProductTable();
    
    if (keyword && filteredProducts.length === 0) {
        alert('검색 결과가 없습니다.');
    }
}

// ===== 입점사 필터 모달 =====
function openSellerFilterModalForList() {
    let html = '<div style="max-height: 400px; overflow-y: auto;">';
    
    // 전체 옵션
    html += `
        <label style="display: block; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;">
            <input type="radio" name="sellerFilter" value="" 
                   ${!selectedSellerIdForFilter ? 'checked' : ''}>
            전체 입점사
        </label>
    `;
    
    // 각 입점사 옵션
    allSellersForProduct.forEach(seller => {
        html += `
            <label style="display: block; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;">
                <input type="radio" name="sellerFilter" value="${seller.id}" 
                       ${selectedSellerIdForFilter == seller.id ? 'checked' : ''}>
                ${seller.name}
            </label>
        `;
    });
    
    html += '</div>';
    
    const footerHTML = `
        <button onclick="applySellerFilterForList()" style="background: #28a745; color: white;">적용</button>
        <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
    `;
    
    window.openModal({
        title: '입점사 필터',
        bodyHTML: html,
        footerHTML: footerHTML
    });
}

// 입점사 필터 적용
function applySellerFilterForList() {
    const selected = document.querySelector('input[name="sellerFilter"]:checked');
    if (selected) {
        selectedSellerIdForFilter = selected.value || null;
        
        // 필터 적용
        if (selectedSellerIdForFilter) {
            filteredProducts = allProducts.filter(product => 
                product.seller_id == selectedSellerIdForFilter
            );
        } else {
            filteredProducts = [...allProducts];
        }
        
        // 버튼 텍스트 업데이트
        const sellerBtn = document.getElementById('sellerFilterBtnForList');
        if (sellerBtn) {
            const sellerName = selected.parentElement.textContent.trim();
            sellerBtn.textContent = selectedSellerIdForFilter ? `입점사: ${sellerName}` : '입점사 필터';
        }
        
        currentPage = 1;
        renderProductTable();
    }
    
    closeModal();
}

// 필터 초기화
function resetProductFilters() {
    selectedSellerIdForFilter = null;
    document.getElementById('productSearchInput').value = '';
    const sellerBtn = document.getElementById('sellerFilterBtnForList');
    if (sellerBtn) {
        sellerBtn.textContent = '입점사 필터';
    }
    filteredProducts = [...allProducts];
    currentPage = 1;
    renderProductTable();
}

function openCreateProductModal() {
    tempSelectedSeller = null;
    editingProductId = null;
    imageOrder = [];  // 초기화
    
    const modalHTML = `
        <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
            <h3 style="margin-bottom: 20px;">새 제품 등록</h3>
            
            <div style="margin-bottom: 15px;">
                <label>제품명 *</label>
                <input type="text" id="productModalName" 
                       style="width: 100%; padding: 8px;"
                       placeholder="제품명을 입력하세요">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>제품코드 *</label>
                <input type="text" id="productModalCode" 
                       style="width: 100%; padding: 8px;"
                       placeholder="제품코드를 입력하세요">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>공급사 *</label>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="productModalSellerName" 
                           style="flex: 1; padding: 8px;" readonly
                           placeholder="공급사를 선택하세요">
                    <button onclick="openSellerSelectModalForProduct()">선택</button>
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>재고수량 *</label>
                <input type="number" id="productModalStock" 
                       style="width: 100%; padding: 8px;"
                       min="0" value="0">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>공급가 *</label>
                <input type="number" id="productModalSupplyPrice" 
                       style="width: 100%; padding: 8px;"
                       placeholder="공급가 ($)" min="0">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>판매가 *</label>
                <input type="number" id="productModalSalePrice" 
                       style="width: 100%; padding: 8px;"
                       placeholder="판매가 ($)" min="0">
            </div>
            
            <!-- 메인 썸네일만 -->
            <div style="margin-bottom: 15px;">
                <label>메인 썸네일 (리스트 표시용)</label>
                <input type="file" id="productModalThumbnail" accept="image/*">
            </div>
            
            <!-- 상세 이미지 통합 -->
            <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                <label style="font-weight: bold;">상세 이미지 (최대 10개, 드래그로 순서 변경)</label>
                <input type="file" id="detailImages" accept="image/*" multiple style="margin: 10px 0;">
                <div id="imagePreviewList" style="margin-top: 10px;"></div>
            </div>

            <!-- 제품코드 매핑 섹션 -->
            <div style="margin-bottom: 15px; padding: 15px; background: #f0f8ff; border-radius: 5px;">
                <label style="font-weight: bold;">추가 제품코드 매핑</label>
                <button type="button" onclick="addCodeMappingRow()" 
                        style="margin-left: 10px; padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px;">
                    + 매핑 추가
                </button>
                <div id="codeMappingContainer" style="margin-top: 10px;">
                    <!-- 동적으로 추가될 매핑 행들 -->
                </div>
            </div>

        </div>
    `;
    
    window.openModal({
        title: '제품 등록',
        bodyHTML: modalHTML,
        footerHTML: '<button onclick="saveProduct()">등록</button><button onclick="closeModal()">취소</button>'
    });
    
    // 이벤트 리스너 추가
    setTimeout(() => {
        const input = document.getElementById('detailImages');
        if (input) {
            input.addEventListener('change', handleDetailImagesEvent);
        }
    }, 100);
}

// ===== 제품 수정 모달 열기 =====
async function openEditProductModal(productId) {
    editingProductId = productId;
    tempSelectedSeller = null;
    imageOrder = [];
    
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    // 기존 상세 이미지들 로드
    try {
        const response = await fetch(`/api/products/${productId}/images`, {
            headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
        });
        if (response.ok) {
            const existingImages = await response.json();
            imageOrder = existingImages.map(img => ({
                url: img.url,
                order: img.order,
                preview: img.url,
                isNew: false
            }));
        }
    } catch (error) {
        console.log('상세 이미지 로드 실패');
    }
    
    const seller = allSellersForProduct.find(s => s.id === product.seller_id);
    if (seller) {
        tempSelectedSeller = { id: seller.id, name: seller.name };
    }
    
    const modalHTML = `
        <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
            <h3 style="margin-bottom: 20px;">제품 수정</h3>
            
            <!-- 기본 정보 필드들 -->
            <div style="margin-bottom: 15px;">
                <label>제품명 *</label>
                <input type="text" id="productModalName" value="${product.name}"
                       style="width: 100%; padding: 8px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>제품코드 *</label>
                <input type="text" id="productModalCode" value="${product.product_code}"
                       style="width: 100%; padding: 8px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>공급사 *</label>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="productModalSellerName" value="${seller ? seller.name : ''}"
                           style="flex: 1; padding: 8px;" readonly>
                    <button onclick="openSellerSelectModalForProduct()">선택</button>
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>재고수량 *</label>
                <input type="number" id="productModalStock" value="${product.initial_stock}"
                       style="width: 100%; padding: 8px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>공급가 *</label>
                <input type="number" id="productModalSupplyPrice" value="${product.supply_price}"
                       style="width: 100%; padding: 8px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>판매가 *</label>
                <input type="number" id="productModalSalePrice" value="${product.sale_price}"
                       style="width: 100%; padding: 8px;">
            </div>
            
            <!-- 메인 썸네일만 -->
            <div style="margin-bottom: 15px;">
                <label>메인 썸네일 (리스트 표시용)</label>
                <input type="file" id="productModalThumbnail" accept="image/*">
                ${product.thumbnail_url ? '<br><small>현재: 등록됨</small>' : ''}
            </div>
            
            <!-- 상세 이미지 통합 -->
            <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                <label style="font-weight: bold;">상세 이미지 (최대 10개, 드래그로 순서 변경)</label>
                <input type="file" id="detailImages" accept="image/*" multiple style="margin: 10px 0;">
                <div id="imagePreviewList" style="margin-top: 10px;"></div>
            </div>

            <!-- 제품코드 매핑 섹션 -->
            <div style="margin-bottom: 15px; padding: 15px; background: #f0f8ff; border-radius: 5px;">
                <label style="font-weight: bold;">추가 제품코드 매핑</label>
                <button type="button" onclick="addCodeMappingRow()" 
                        style="margin-left: 10px; padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px;">
                    + 매핑 추가
                </button>
                <div id="codeMappingContainer" style="margin-top: 10px;">
                    <!-- 동적으로 추가될 매핑 행들 -->
                </div>
            </div>

        </div>
    `;
    
    window.openModal({
        title: '제품 수정',
        bodyHTML: modalHTML,
        footerHTML: '<button onclick="saveProduct()">수정</button><button onclick="closeModal()">취소</button>'
    });
    
    // 이벤트 리스너 추가
    setTimeout(() => {
        const input = document.getElementById('detailImages');
        if (input) {
            input.addEventListener('change', handleDetailImagesEvent);
        }
        // 기존 이미지 표시
        if (imageOrder.length > 0) {
            renderImagePreviews();
        }
        
        // 매핑 데이터 로드 (추가)
        loadProductMappings(productId);
    }, 100);
}
async function handleAdditionalImages(input) {
    const files = Array.from(input.files);
    
    // 검증
    const validation = await validateMultipleFiles(files);
    if (!validation.valid) {
        alert(validation.error);
        input.value = '';
        return;
    }
    
    // 10개 제한
    if (imageOrder.length + files.length > 10) {
        alert(`최대 10개까지만 가능합니다. (현재 ${imageOrder.length}개)`);
        return;
    }
    
    // 순서 배열에 추가
    files.forEach((file, index) => {
        imageOrder.push({
            file: file,
            order: imageOrder.length,
            preview: URL.createObjectURL(file),
            isNew: true
        });
    });
    
    renderImagePreviews();
}

async function handleDetailImagesEvent(event) {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
        const result = await validateImageFile(file);
        if (!result.valid) {
            alert(result.error);
            event.target.value = '';
            return;
        }
    }
    
    if (imageOrder.length + files.length > 10) {
        alert(`최대 10개까지만 가능합니다. (현재 ${imageOrder.length}개)`);
        return;
    }
    
    files.forEach(file => {
        imageOrder.push({
            file: file,
            order: imageOrder.length,
            preview: URL.createObjectURL(file),
            isNew: true
        });
    });
    
    renderImagePreviews();
}


function renderImagePreviews() {
    const container = document.getElementById('imagePreviewList');
    if (!container) return;
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;">
            ${imageOrder.map((item, index) => `
                <div draggable="true" 
                     ondragstart="dragStart(event, ${index})"
                     ondragover="dragOver(event)"
                     ondrop="drop(event, ${index})"
                     style="position: relative; border: 2px solid #ddd; padding: 5px; cursor: move;">
                    <img src="${item.preview || item.url}" 
                         style="width: 100%; height: 80px; object-fit: cover;">
                    <div style="position: absolute; top: 2px; left: 2px; 
                                background: rgba(0,0,0,0.7); color: white; 
                                padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                        ${index + 1}
                    </div>
                    <button onclick="removeImageOrder(${index})" 
                            style="position: absolute; top: 2px; right: 2px; 
                                   background: red; color: white; border: none; 
                                   width: 20px; height: 20px; cursor: pointer;">
                        ✕
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

function dragStart(e, index) {
    draggedIndex = index;
}

function dragOver(e) {
    e.preventDefault();
}

function drop(e, dropIndex) {
    e.preventDefault();
    if (draggedIndex === null) return;
    
    const draggedItem = imageOrder[draggedIndex];
    imageOrder.splice(draggedIndex, 1);
    imageOrder.splice(dropIndex, 0, draggedItem);
    
    renderImagePreviews();
    draggedIndex = null;
}

async function removeImageOrder(index) {
    const item = imageOrder[index];
    
    // 기존 이미지인 경우 ImageKit에서도 삭제
    if (!item.isNew && item.url) {
        if (confirm('이미지를 완전히 삭제하시겠습니까?')) {
            try {
                const formData = new FormData();
                formData.append('url', item.url);
                
                const response = await fetch('/api/imagekit/delete', {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: formData
                });
                
                if (response.ok) {
                    console.log('ImageKit에서 삭제 완료');
                }
            } catch (error) {
                console.error('ImageKit 삭제 실패:', error);
            }
        } else {
            return; // 취소하면 삭제하지 않음
        }
    }
    
    // 배열에서 제거
    imageOrder.splice(index, 1);
    renderImagePreviews();
}

// ===== 제품 저장 (생성/수정 통합) =====
async function saveProduct() {
    // DOM 요소 확인
    const nameEl = document.getElementById('productModalName');
    const codeEl = document.getElementById('productModalCode');
    const stockEl = document.getElementById('productModalStock');
    const supplyPriceEl = document.getElementById('productModalSupplyPrice');
    const salePriceEl = document.getElementById('productModalSalePrice');
    const thumbnailEl = document.getElementById('productModalThumbnail');
    const detailEl = document.getElementById('productModalDetailImage');
    
    if (!nameEl || !codeEl) {
        console.error('필수 입력 요소를 찾을 수 없습니다');
        return;
    }
    
    const name = nameEl.value.trim();
    const productCode = codeEl.value.trim();
    const initialStock = stockEl?.value || 0;
    const supplyPrice = supplyPriceEl?.value;
    const salePrice = salePriceEl?.value;
    const thumbnailFile = thumbnailEl?.files?.[0];
    const detailImageFile = detailEl?.files?.[0];
    // 유효성 검사
    if (!name || !productCode || !supplyPrice || !salePrice) {
        alert('필수 항목을 모두 입력해주세요.');
        return;
    }
    
    if (!tempSelectedSeller && !editingProductId) {
        alert('공급사를 선택해주세요.');
        return;
    }
    
    // 로딩 오버레이 생성
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'uploadLoadingOverlay';
    loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    loadingOverlay.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; text-align: center; min-width: 300px;">
            <h3 style="margin-bottom: 20px;">처리 중...</h3>
            <div id="uploadStatus" style="margin-bottom: 15px; color: #666;">제품 정보 저장 중...</div>
            <div style="width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden;">
                <div id="uploadProgressBar" style="width: 0%; height: 100%; background: #007bff; transition: width 0.3s;"></div>
            </div>
            <div id="uploadPercent" style="margin-top: 10px; font-size: 14px; color: #007bff;">0%</div>
        </div>
    `;
    
    document.body.appendChild(loadingOverlay);
    
    // 진행률 업데이트 함수
    const updateProgress = (percent, status) => {
        document.getElementById('uploadProgressBar').style.width = percent + '%';
        document.getElementById('uploadPercent').textContent = percent + '%';
        document.getElementById('uploadStatus').textContent = status;
    };
    
    try {
        let productData = {
            name: name,
            product_code: productCode,
            initial_stock: parseInt(initialStock) || 0,
            supply_price: parseFloat(supplyPrice),
            sale_price: parseFloat(salePrice)
        };
        
        let savedProductId;  // 제품 ID 저장용
        
        if (editingProductId) {
            // === 수정 모드 ===
            const product = allProducts.find(p => p.id === editingProductId);
            productData.seller_id = tempSelectedSeller ? tempSelectedSeller.id : product.seller_id;
            productData.is_active = product.is_active;
            
            updateProgress(20, '제품 정보 수정 중...');
            await window.API.products.update(editingProductId, productData);
            savedProductId = editingProductId;  // 한 번만 선언
            // 기존 매핑 삭제
            updateProgress(25, '기존 매핑 정리 중...');
            try {
                const mappingsResponse = await fetch(`/products/${savedProductId}/mappings`, {
                    headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
                });
                
                if (mappingsResponse.ok) {
                    const existingMappings = await mappingsResponse.json();
                    for (const mapping of existingMappings) {
                        await fetch(`/products/mappings/${mapping.id}`, {
                            method: 'DELETE',
                            headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
                        });
                    }
                }
            } catch (error) {
                console.error('기존 매핑 삭제 실패:', error);
            }

        } else {
            // === 생성 모드 ===
            if (!tempSelectedSeller) {
                alert('공급사를 선택해주세요.');
                document.body.removeChild(loadingOverlay);
                return;
            }
            
            productData.seller_id = tempSelectedSeller.id;
            productData.is_active = 1;
            
            updateProgress(20, '제품 등록 중...');
            const savedProduct = await window.API.products.create(productData);
            savedProductId = savedProduct.id;
        }
        
        // === 공통: 메인 썸네일 업로드 ===
        if (thumbnailFile) {
            updateProgress(40, '메인 썸네일 업로드 중...');
            const thumbUrl = await window.uploadToImageKit(thumbnailFile, savedProductId, 'main_thumb');
            productData.thumbnail_url = thumbUrl;
            await window.API.products.update(savedProductId, productData);
        }
        
        // === 공통: 상세 이미지 업로드 ===
        if (imageOrder && imageOrder.length > 0) {
            const uploadedImages = [];
            
            for (let i = 0; i < imageOrder.length; i++) {
                const item = imageOrder[i];
                
                if (item.isNew && item.file) {
                    const progress = 50 + (i * 4);
                    updateProgress(progress, `상세 이미지 ${i+1}/${imageOrder.length} 업로드 중...`);
                    
                    try {
                        const url = await window.uploadToImageKit(
                            item.file, 
                            savedProductId, 
                            `detail_${String(i).padStart(2, '0')}`
                        );
                        uploadedImages.push({url: url, order: i});
                    } catch (error) {
                        console.error(`이미지 ${i+1} 업로드 실패:`, error);
                    }
                } else if (item.url) {
                    uploadedImages.push({url: item.url, order: i});
                }
            }
            
            // === 제품코드 매핑 저장 ===
        const mappingRows = document.querySelectorAll('#codeMappingContainer .mapping-row');
        if (mappingRows.length > 0) {
            updateProgress(95, '제품코드 매핑 저장 중...');
            
            for (const row of mappingRows) {
                const inputs = row.querySelectorAll('input');
                const select = row.querySelector('select');
                
                const mappedCode = inputs[0]?.value?.trim();
                const multiplier = parseInt(inputs[1]?.value) || 1;
                const mappingType = select?.value || 'alias';
                const note = inputs[2]?.value?.trim() || '';
                
                if (mappedCode) {
                    const mappingFormData = new FormData();
                    mappingFormData.append('mapped_code', mappedCode);
                    mappingFormData.append('quantity_multiplier', multiplier);
                    mappingFormData.append('mapping_type', mappingType);
                    mappingFormData.append('note', note);
                    
                    try {
                        const response = await fetch(`/products/${savedProductId}/mappings`, {
                            method: 'POST',
                            headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`},
                            body: mappingFormData
                        });
                        
                        if (!response.ok) {
                            console.error('매핑 저장 실패:', mappedCode);
                        }
                    } catch (error) {
                        console.error('매핑 저장 오류:', error);
                    }
                }
            }
        }
        
        updateProgress(100, '완료!');


            // DB에 저장
            if (uploadedImages.length > 0) {
                updateProgress(90, '상세 이미지 정보 저장 중...');
                const formData = new FormData();
                formData.append('images', JSON.stringify(uploadedImages));
                
                const response = await fetch(`/api/products/${savedProductId}/images`, {
                    method: 'POST',
                    headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`},
                    body: formData
                });
                
                if (!response.ok) {
                    console.error('상세 이미지 DB 저장 실패');
                }
            }
        }
        
        updateProgress(100, '완료!');
        await new Promise(resolve => setTimeout(resolve, 500));
        alert(editingProductId ? '제품이 수정되었습니다.' : '제품이 등록되었습니다.');
        
        document.body.removeChild(loadingOverlay);
        window.closeModal();
        loadProductsData();
        
    } catch (error) {
        console.error('제품 저장 실패:', error);
        alert('제품 저장에 실패했습니다: ' + error.message);
        document.body.removeChild(loadingOverlay);
    }
}
// ===== 공급사 선택 모달 =====
function openSellerSelectModalForProduct() {
    const sellersHTML = allSellersForProduct.map(seller => `
        <div style="display: flex; justify-content: space-between; align-items: center; 
                    padding: 10px; border-bottom: 1px solid #eee;">
            <span>${seller.name}</span>
            <button onclick="selectSellerForProduct(${seller.id}, '${seller.name}')" 
                    style="padding: 5px 10px; background: #007bff; color: white; 
                           border: none; border-radius: 4px; font-size: 12px;">
                선택
            </button>
        </div>
    `).join('');
    
    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'sellerSelectModalBackdrop';
    modalBackdrop.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    modalBackdrop.innerHTML = `
        <div style="background: white; border-radius: 8px; width: 500px; max-height: 70vh; 
                    display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
            <div style="padding: 15px; border-bottom: 1px solid #ddd; 
                        display: flex; justify-content: space-between; align-items: center;">
                <h4 style="margin: 0;">공급사 선택</h4>
                <button onclick="closeSellerSelectModalForProduct()" 
                        style="background: none; border: none; font-size: 20px; cursor: pointer;">✕</button>
            </div>
            
            <div style="padding: 15px;">
                <input type="text" id="sellerSearchInputForProduct" 
                       placeholder="공급사명 검색" 
                       onkeyup="filterSellersForProduct()"
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; 
                              border-radius: 4px; margin-bottom: 10px;">
            </div>
            
            <div id="sellerListContainerForProduct" style="flex: 1; overflow-y: auto; padding: 0 15px;">
                ${sellersHTML}
            </div>
            
            <div style="padding: 15px; border-top: 1px solid #ddd; text-align: right;">
                <button onclick="closeSellerSelectModalForProduct()" 
                        style="padding: 8px 15px; background: #6c757d; color: white; 
                               border: none; border-radius: 4px;">
                    닫기
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalBackdrop);
}

// ===== 공급사 검색 필터 =====
function filterSellersForProduct() {
    const searchInput = document.getElementById('sellerSearchInputForProduct');
    const keyword = searchInput.value.trim().toLowerCase();
    
    const filteredSellers = keyword 
        ? allSellersForProduct.filter(s => s.name.toLowerCase().includes(keyword))
        : allSellersForProduct;
    
    const sellersHTML = filteredSellers.map(seller => `
        <div style="display: flex; justify-content: space-between; align-items: center; 
                    padding: 10px; border-bottom: 1px solid #eee;">
            <span>${seller.name}</span>
            <button onclick="selectSellerForProduct(${seller.id}, '${seller.name}')" 
                    style="padding: 5px 10px; background: #007bff; color: white; 
                           border: none; border-radius: 4px; font-size: 12px;">
                선택
            </button>
        </div>
    `).join('');
    
    const container = document.getElementById('sellerListContainerForProduct');
    if (container) {
        container.innerHTML = filteredSellers.length > 0 ? sellersHTML : 
            '<div style="text-align: center; padding: 20px; color: #666;">검색 결과가 없습니다.</div>';
    }
}

// ===== 공급사 선택 =====
function selectSellerForProduct(sellerId, sellerName) {
    tempSelectedSeller = { id: sellerId, name: sellerName };
    
    const sellerNameInput = document.getElementById('productModalSellerName');
    if (sellerNameInput) {
        sellerNameInput.value = sellerName;
    }
    
    closeSellerSelectModalForProduct();
}

// ===== 공급사 선택 모달 닫기 =====
function closeSellerSelectModalForProduct() {
    const modal = document.getElementById('sellerSelectModalBackdrop');
    if (modal) {
        modal.remove();
    }
}

// ===== 제품 활성/비활성 토글 =====
async function toggleProductStatus(productId, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const statusText = newStatus ? '활성화' : '비활성화';
    
    if (!confirm(`이 제품을 ${statusText}하시겠습니까?`)) {
        return;
    }
    
    try {
        const product = allProducts.find(p => p.id === productId);
        if (!product) return;
        
        const updateData = {
            name: product.name,
            product_code: product.product_code,
            seller_id: product.seller_id,
            initial_stock: product.initial_stock,
            supply_price: product.supply_price,
            sale_price: product.sale_price,
            is_active: newStatus
        };
        
        await window.API.products.update(productId, updateData);
        
        alert(`제품이 ${statusText}되었습니다.`);
        loadProductsData();
        
    } catch (error) {
        console.error('제품 상태 변경 실패:', error);
        alert('제품 상태 변경에 실패했습니다.');
    }
}

// ===== 재고 관리 모달 =====
function openStockManageModal(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const currentStock = product.current_stock !== undefined ? product.current_stock : product.initial_stock;

    const modalHTML = `
        <div style="padding: 20px;">
            <h3>${product.name} - 재고 관리</h3>
            <div style="margin-bottom: 10px;">
                <span style="color: #666;">초기 재고: ${product.initial_stock}개</span><br>
                <span style="color: #007bff; font-weight: bold;">현재 재고: ${currentStock}개</span>
            </div>
            
            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="margin-bottom: 15px;">
                    <label style="display: inline-block; width: 100px;">
                        <input type="radio" name="stockType" value="add" checked> 입고 (+)
                    </label>
                    <label style="display: inline-block; width: 100px;">
                        <input type="radio" name="stockType" value="subtract"> 출고 (-)
                    </label>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">수량</label>
                    <input type="number" id="stockQuantity" min="1" value="1"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">사유/메모</label>
                    <textarea id="stockMemo" rows="3"
                              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                              placeholder="입고/출고 사유를 입력하세요"></textarea>
                </div>
            </div>
            
            <p style="color: #dc3545; font-size: 12px;">
                ⚠️ 재고 조정은 취소할 수 없습니다. 신중하게 입력해주세요.
            </p>
        </div>
    `;
    
    const footerHTML = `
        <button onclick="saveStockAdjustment(${productId})" style="background: #007bff; color: white;">저장</button>
        <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
    `;
    
    window.openModal({
        title: '재고 관리',
        bodyHTML: modalHTML,
        footerHTML: footerHTML
    });
}

// ===== 재고 조정 저장 =====
async function saveStockAdjustment(productId) {
    const stockType = document.querySelector('input[name="stockType"]:checked').value;
    const quantity = parseInt(document.getElementById('stockQuantity').value);
    const memo = document.getElementById('stockMemo').value.trim();
    
    if (!quantity || quantity <= 0) {
        alert('수량을 올바르게 입력해주세요.');
        return;
    }
    
    if (!memo) {
        alert('사유를 입력해주세요.');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('adjustment_type', stockType);
        formData.append('quantity', quantity);
        formData.append('note', memo);
        
        const response = await fetch(`${window.API_BASE_URL}/products/${productId}/stock-adjust`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('재고 조정 실패');
        }
        
        const result = await response.json();
        alert(`재고 조정 완료!\n${stockType === 'add' ? '입고' : '출고'}: ${quantity}개`);
        
        window.closeModal();
        loadProductsData();
        
    } catch (error) {
        console.error('재고 조정 실패:', error);
        alert('재고 조정에 실패했습니다: ' + error.message);
    }
}

// ===== 상세 이미지 보기 =====
async function showDetailImage(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    // 상세 이미지들 가져오기
    let detailImages = [];
    try {
        const response = await fetch(`/api/products/${productId}/images`, {
            headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
        });
        if (response.ok) {
            detailImages = await response.json();
        }
    } catch (error) {
        console.log('상세 이미지 조회 실패');
    }
    
    const modalHTML = `
        <div style="padding: 20px; max-height: 80vh; overflow-y: auto;">
            <h3>${product.name}</h3>
            
            <!-- 메인 썸네일 먼저 표시 -->
            ${product.thumbnail_url ? 
                `<div style="margin-bottom: 20px;">
                    <img src="${product.thumbnail_url}" style="max-width: 100%; cursor: pointer;"
                         onclick="window.open('${product.thumbnail_url}', '_blank')">
                </div>` : ''}
            
            <!-- 상세 이미지들 순서대로 표시 -->
            ${detailImages.length > 0 ? 
                detailImages.map(img => 
                    `<div style="margin-bottom: 20px;">
                        <img src="${img.url}" style="max-width: 100%; cursor: pointer;"
                             onclick="window.open('${img.url}', '_blank')">
                    </div>`
                ).join('') : ''}
            
            ${!product.thumbnail_url && detailImages.length === 0 ? 
                '<p style="text-align: center; color: #999;">등록된 이미지가 없습니다.</p>' : ''}
        </div>
    `;
    
    window.openModal({
        title: '상품 상세 이미지',
        bodyHTML: modalHTML,
        footerHTML: '<button onclick="closeModal()">닫기</button>'
    });
}

// ===== 큰 이미지 보기 =====
// 썸네일 이미지 확대 보기 함수 추가
function showImageLarge(imageUrl, productName) {
    if (!imageUrl) {
        alert('이미지가 없습니다.');
        return;
    }
    
    // URL 유효성 검사
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        if (!imageUrl.startsWith('/')) {
            imageUrl = `/static/${imageUrl}`;
        }
    }
    
    const modalHTML = `
        <div style="text-align: center; padding: 20px;">
            <img src="${imageUrl}" 
                 style="max-width: 100%; max-height: 80vh; object-fit: contain; cursor: zoom-in;" 
                 alt="${productName}"
                 onclick="window.open('${imageUrl}', '_blank')">
            <div style="margin-top: 10px; color: #666; font-size: 12px;">
                ${productName} - 클릭하면 원본 크기로 볼 수 있습니다
            </div>
        </div>
    `;
    
    window.openModal({
        title: '이미지 확대',
        bodyHTML: modalHTML,
        footerHTML: '<button onclick="closeModal()" style="background: #6c757d; color: white;">닫기</button>'
    });
}
// ===== 판매 기록 보기 =====
async function showSalesHistory(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    try {
        // 사용자 타입 확인
        const user = await window.API.getCurrentUser();
        const isAdmin = user.type === 'admin';
        
        // 로딩 표시
        const modalHTML = `
            <div style="padding: 20px; text-align: center;">
                <p>로딩 중...</p>
            </div>
        `;
        
        window.openModal({
            title: `${product.name} - 판매기록`,
            bodyHTML: modalHTML,
            footerHTML: '<button onclick="closeModal()" style="background: #6c757d; color: white;">닫기</button>'
        });
        
        // 전체 주문 데이터 가져오기
        const response = await fetch(`${window.API_BASE_URL}/orders/with-items?skip=0&limit=1000`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('데이터를 불러올 수 없습니다');
        }
        
        const data = await response.json();
        const allOrderItems = data.orders || [];
        
        // 해당 제품코드로 필터링
        const filteredOrders = allOrderItems.filter(item => 
            item.product_code === product.product_code
        );
        
        // 날짜 역순 정렬 (최신 먼저)
        filteredOrders.sort((a, b) => new Date(b.order_time) - new Date(a.order_time));
        
        // showSalesHistory 함수에서 합계 계산 부분
        let totalQuantity = 0;
        let totalSupply = 0;
        let totalSale = 0;
        let excludedCount = 0;
        let excludedQuantity = 0;
        let validOrderCount = 0;  // 추가

        filteredOrders.forEach(order => {
            if (order.status_display === '환불/교환' || order.status_display === '주문취소') {
                excludedCount++;
                excludedQuantity += order.quantity;
                return;
            }
            
            validOrderCount++;  // 유효 주문 카운트
            totalQuantity += order.quantity;
            totalSupply += order.quantity * order.supply_price;
            totalSale += order.quantity * order.sale_price;
        });
        
        // 모달 내용 업데이트
        let contentHTML = `
            <div style="padding: 20px; height: 70vh; display: flex; flex-direction: column;">
                <!-- 고정 헤더 -->
                <div style="background: white; position: sticky; top: 0; z-index: 10; padding-bottom: 15px; border-bottom: 2px solid #dee2e6;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                        <div style="margin-bottom: 8px;">
                            <strong>제품명:</strong> ${product.name}
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>제품코드:</strong> ${product.product_code}
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>총 주문건수:</strong> ${filteredOrders.length}건
                            <small style="color: #666;">(모든 주문)</small>
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>총 판매건수:</strong> ${validOrderCount}건
                            <small style="color: #007bff;">(환불/취소 제외)</small>
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>총 판매수량:</strong> ${totalQuantity}개
                            <small style="color: #007bff;">(환불/취소 제외)</small>
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>환불 및 취소:</strong> ${excludedCount}건
                            ${excludedQuantity > 0 ? `<small style="color: #dc3545;">(${excludedQuantity}개)</small>` : ''}
                        </div>
                    </div>
                        <div style="text-align: right; background: #f8f9fa; padding: 15px; border-radius: 8px; min-width: 200px;">
                            <div style="margin-bottom: 8px; font-size: 14px;">
                                <strong>총 금액(공급가):</strong>
                                <div style="color: #007bff; font-size: 18px; font-weight: bold;">
                                    $${totalSupply.toFixed(2)}
                                </div>
                                <small style="color: #999; font-size: 11px;">취소/환불 제외</small>
                            </div>
                            ${isAdmin ? `
                                <div style="font-size: 14px;">
                                    <strong>총 금액(판매가):</strong>
                                    <div style="color: #28a745; font-size: 18px; font-weight: bold;">
                                        $${totalSale.toFixed(2)}
                                    </div>
                                    <small style="color: #999; font-size: 11px;">취소/환불 제외</small>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div style="margin-top: 10px; color: #666; font-size: 11px; text-align: center;">
                        ※ 주문 날짜는 중국시간 기준입니다.
                    </div>
                </div>
                
                <!-- 스크롤 가능한 테이블 영역 -->
                <div style="flex: 1; overflow-y: auto; margin-top: 15px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead style="position: sticky; top: 0; background: #e9ecef; z-index: 5;">
                            <tr>
                                <th style="padding: 10px; border: 1px solid #dee2e6; width: 100px;">주문번호</th>
                                <th style="padding: 10px; border: 1px solid #dee2e6; width: 80px;">구매자</th>
                                <th style="padding: 10px; border: 1px solid #dee2e6; width: 50px;">수량</th>
                                <th style="padding: 10px; border: 1px solid #dee2e6; width: 90px;">공급가</th>
                                ${isAdmin ? '<th style="padding: 10px; border: 1px solid #dee2e6; width: 90px;">판매가</th>' : ''}
                                <th style="padding: 10px; border: 1px solid #dee2e6; width: 100px;">날짜</th>
                                <th style="padding: 10px; border: 1px solid #dee2e6; width: 80px;">상태</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        if (filteredOrders.length === 0) {
            contentHTML += `
                <tr>
                    <td colspan="${isAdmin ? 7 : 6}" style="text-align: center; padding: 30px; color: #999;">
                        이 제품의 판매 기록이 없습니다.
                    </td>
                </tr>
            `;
        } else {
            filteredOrders.forEach(order => {
                const supplyTotal = order.quantity * order.supply_price;
                const saleTotal = order.quantity * order.sale_price;
                const statusColor = getStatusColor(order.status_display);
                const isExcluded = order.status_display === '환불/교환' || order.status_display === '주문취소';
                
                contentHTML += `
                    <tr ${isExcluded ? 'style="opacity: 0.5; background: #f8f8f8;"' : ''}>
                        <td style="padding: 8px; border: 1px solid #dee2e6; font-size: 12px;">
                            ${order.order_no}
                        </td>
                        <td style="padding: 8px; border: 1px solid #dee2e6;">
                            ${order.buyer_id}
                        </td>
                        <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">
                            ${order.quantity}
                        </td>
                        <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right; ${isExcluded ? 'text-decoration: line-through;' : ''}">
                            $${supplyTotal.toFixed(2)}<br>
                            <small style="color: #666;">(@$${order.supply_price.toFixed(2)})</small>
                        </td>
                        ${isAdmin ? `
                            <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right; ${isExcluded ? 'text-decoration: line-through;' : ''}">
                                $${saleTotal.toFixed(2)}<br>
                                <small style="color: #666;">(@$${order.sale_price.toFixed(2)})</small>
                            </td>
                        ` : ''}
                        <td style="padding: 8px; border: 1px solid #dee2e6; font-size: 12px;">
                            ${new Date(order.order_time).toLocaleDateString('ko-KR')}<br>
                            <small style="color: #666;">${new Date(order.order_time).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})}</small>
                        </td>
                        <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">
                            <span style="padding: 3px 6px; border-radius: 3px; font-size: 11px;
                                       background: ${statusColor}; color: white;">
                                ${order.status_display}
                            </span>
                        </td>
                    </tr>
                `;
            });
        }
        
        contentHTML += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        // 모달 업데이트
        document.getElementById('modalBody').innerHTML = contentHTML;
        
        // 모달 크기 조정
        const modal = document.querySelector('#modalRoot .modal');
        if (modal) {
            modal.style.maxWidth = '900px';
            modal.style.width = '90%';
        }
        
    } catch (error) {
        console.error('판매기록 조회 실패:', error);
        document.getElementById('modalBody').innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <p style="color: #dc3545; font-size: 16px;">
                    ⚠️ 판매기록을 불러올 수 없습니다.
                </p>
                <p style="color: #666; font-size: 14px; margin-top: 10px;">
                    ${error.message}
                </p>
            </div>
        `;
    }
}
// 상태별 색상 헬퍼 함수 (showSalesHistory 바로 아래 추가)
function getStatusColor(status) {
    const colors = {
        '발송대기': '#ffc107',
        '배송중': '#17a2b8',
        '통관중': '#6c757d',
        '배송완료': '#28a745',
        '주문취소': '#dc3545',
        '환불/교환': '#e83e8c'
    };
    return colors[status] || '#6c757d';
}

// ===== 유틸리티 함수 =====
function formatCurrency(amount) {
    if (!amount) return '₩0';
    return '$' + parseFloat(amount).toLocaleString('ko-KR');
}
// ===== 체크박스 관련 함수 =====
function toggleProductSelection(productId) {
    if (selectedProductSet.has(productId)) {
        selectedProductSet.delete(productId);
    } else {
        selectedProductSet.add(productId);
    }
    
    // 전역 배열 업데이트 (chart.js와 공유)
    window.selectedProductIds = Array.from(selectedProductSet);
    console.log('선택된 제품:', window.selectedProductIds);
}

function toggleAllProducts(checkbox) {
    const checkboxes = document.querySelectorAll('#productListTableBody input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        const productId = parseInt(cb.value);
        if (checkbox.checked) {
            selectedProductSet.add(productId);
        } else {
            selectedProductSet.delete(productId);
        }
    });
    
    // 전역 배열 업데이트
    window.selectedProductIds = Array.from(selectedProductSet);
}

// ===== 선택 삭제 함수 =====
async function deleteSelectedProducts() {
    if (selectedProductSet.size === 0) {
        alert('삭제할 제품을 선택해주세요.');
        return;
    }
    
    const productNames = filteredProducts
        .filter(p => selectedProductSet.has(p.id))
        .map(p => p.name);
    
    const confirmMsg = `다음 제품을 삭제하시겠습니까?\n\n${productNames.join('\n')}\n\n` +
                      `⚠️ 삭제된 제품은 판매중인 제품 목록에서 사라집니다.`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const productId of selectedProductIds) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/products/${productId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
            console.error(`제품 ID ${productId} 삭제 실패:`, error);
        }
    }
    
    let resultMsg = '';
    if (successCount > 0) {
        resultMsg += `${successCount}개 제품이 삭제 되었습니다.`;
    }
    if (failCount > 0) {
        resultMsg += `\n${failCount}개 제품 삭제 실패`;
    }
    
    alert(resultMsg);
    
    // 선택 초기화 및 목록 새로고침
selectedProductSet.clear();
window.selectedProductIds = [];
loadProductsData();
}

// 전역 변수로 매핑 데이터 관리
let productMappings = [];

// 매핑 행 추가
function addCodeMappingRow(existingData = null) {
    const container = document.getElementById('codeMappingContainer');
    const rowId = Date.now();
    
    const rowHTML = `
        <div class="mapping-row" data-row-id="${rowId}" style="display: flex; gap: 10px; margin-bottom: 10px; padding: 10px; background: white; border: 1px solid #ddd; border-radius: 3px;">
            <input type="text" placeholder="추가 제품코드" 
                   value="${existingData ? existingData.mapped_code : ''}"
                   style="flex: 2; padding: 5px;">
            <input type="number" placeholder="수량" min="1" 
                   value="${existingData ? existingData.quantity_multiplier : 1}"
                   style="flex: 1; padding: 5px;">
            <select style="flex: 1; padding: 5px;">
                <option value="bundle" ${existingData?.mapping_type === 'bundle' ? 'selected' : ''}>묶음상품</option>
                <option value="legacy" ${existingData?.mapping_type === 'legacy' ? 'selected' : ''}>구 제품코드</option>
                <option value="alias" ${existingData?.mapping_type === 'alias' ? 'selected' : ''}>별칭</option>
            </select>
            <input type="text" placeholder="메모" 
                   value="${existingData ? existingData.note || '' : ''}"
                   style="flex: 2; padding: 5px;">
            <button onclick="removeMappingRow(${rowId})" 
                    style="padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 3px;">
                삭제
            </button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', rowHTML);
}

// 매핑 행 삭제
function removeMappingRow(rowId) {
    const row = document.querySelector(`[data-row-id="${rowId}"]`);
    if (row) row.remove();
}

// 기존 매핑 로드 (수정 모달용)
async function loadProductMappings(productId) {
    try {
        const response = await fetch(`/products/${productId}/mappings`, {
            headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
        });
        
        if (response.ok) {
            const mappings = await response.json();
            mappings.forEach(mapping => {
                addCodeMappingRow(mapping);
            });
        }
    } catch (error) {
        console.error('매핑 로드 실패:', error);
    }
}

// 매핑 데이터 수집
function collectMappingData() {
    const mappingRows = document.querySelectorAll('#codeMappingContainer .mapping-row');
    const mappings = [];
    
    mappingRows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const select = row.querySelector('select');
        
        const mappedCode = inputs[0].value.trim();
        const multiplier = parseInt(inputs[1].value) || 1;
        const mappingType = select.value;
        const note = inputs[2].value.trim();
        
        if (mappedCode) {
            mappings.push({
                mapped_code: mappedCode,
                quantity_multiplier: multiplier,
                mapping_type: mappingType,
                note: note
            });
        }
    });
    
    return mappings;
}


// 전역 함수로 노출
window.searchProducts = searchProducts;
window.goToPage = goToPage;
window.openCreateProductModal = openCreateProductModal;
window.openEditProductModal = openEditProductModal;
window.saveProduct = saveProduct;
window.openSellerSelectModalForProduct = openSellerSelectModalForProduct;
window.filterSellersForProduct = filterSellersForProduct;
window.selectSellerForProduct = selectSellerForProduct;
window.closeSellerSelectModalForProduct = closeSellerSelectModalForProduct;
window.toggleProductStatus = toggleProductStatus;
window.openStockManageModal = openStockManageModal;
window.saveStockAdjustment = saveStockAdjustment;
window.showDetailImage = showDetailImage;
window.showImageLarge = showImageLarge;
window.toggleProductSelection = toggleProductSelection;
window.toggleAllProducts = toggleAllProducts;
window.deleteSelectedProducts = deleteSelectedProducts;
// 기존 전역 함수들 아래에 추가
window.showSalesHistory = showSalesHistory;
window.openSellerFilterModalForList = openSellerFilterModalForList;
window.applySellerFilterForList = applySellerFilterForList;
window.resetProductFilters = resetProductFilters;