// accountManager.js - 계정 관리 기능 (테이블 및 모달 수정)

// 전역 변수 - 고유한 이름으로 변경
let accountList = [];  
let filteredAccountList = [];  
let sellersForAccount = [];  
let selectedAccountIdSet = new Set();  
let editingAccountId = null;  
let tempSelectedSellerForAccount = null;  
let isLoadingAccounts = false; 
// 페이지네이션 변수
let currentAccountPage = 1;
const accountsPerPage = 20;


// ===== 계정 데이터 로드 (전역 함수) =====
window.loadAccountsData = async function() {
    // 중복 로딩 방지
    if (isLoadingAccounts) {
        console.log('[AccountManager] 이미 로딩 중...');
        return;
    }
    
    isLoadingAccounts = true;
    console.log('[AccountManager] loadAccountsData 호출됨');
    
    try {
        const currentUser = await window.API.getCurrentUser();
        console.log('[AccountManager] 현재 사용자:', currentUser);
        
        if (currentUser.type !== 'admin') {
            console.warn('[AccountManager] 관리자 권한이 아님');
            alert('계정 관리는 관리자만 접근할 수 있습니다.');
            return;
        }
        
        console.log('[AccountManager] API 호출 시작...');
        
        const [accounts, sellers] = await Promise.all([
            window.API.accounts.list(),
            window.API.sellers.list()
        ]);
        
        console.log('[AccountManager] 계정 목록:', accounts);
        console.log('[AccountManager] 입점사 목록:', sellers);
        
        accountList = accounts || [];
        sellersForAccount = sellers || [];
        filteredAccountList = [...accountList];
        
        renderAccountTable(filteredAccountList);
        
        console.log('[AccountManager] 계정 데이터 로드 완료:', accountList.length + '개');
        
    } catch (error) {
        console.error('[AccountManager] 계정 데이터 로드 실패:', error);
        
        if (error.message.includes('401')) {
            alert('인증이 만료되었습니다. 다시 로그인해주세요.');
            window.location.href = 'login.html';
        } else if (error.message.includes('403')) {
            alert('계정 관리 권한이 없습니다.');
        } else {
            alert('계정 목록을 불러오는데 실패했습니다.\n' + error.message);
        }
        
        renderAccountTable([]);
    } finally {
        isLoadingAccounts = false;  // 로딩 완료
    }
}

// ===== 계정 테이블 렌더링 (수정됨 - 계정유형 컬럼 추가) =====
function renderAccountTable(accounts) {
    console.log('[AccountManager] renderAccountTable 호출, 계정 수:', accounts.length);
    
    const tbody = document.getElementById('accountTableBody');
    if (!tbody) {
        console.error('[AccountManager] accountTableBody 요소를 찾을 수 없음');
        return;
    }
    
    // 페이지네이션 계산 추가
    const totalPages = Math.ceil(accounts.length / accountsPerPage);
    const startIndex = (currentAccountPage - 1) * accountsPerPage;
    const endIndex = startIndex + accountsPerPage;
    const pageAccounts = accounts.slice(startIndex, endIndex);
    
    if (!accounts || accounts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px;">
                    등록된 계정이 없습니다.
                </td>
            </tr>
        `;
        return;
    }
    
    try {
        tbody.innerHTML = pageAccounts.map(account => {
            const seller = sellersForAccount.find(s => s.id === account.seller_id);
            const sellerName = seller ? seller.name : '-';
            const accountTypeDisplay = account.type === 'admin' ? '관리자' : '입점사';
            const accountTypeBadgeColor = account.type === 'admin' ? '#dc3545' : '#28a745';
            
            return `
                <tr>
                    <td>
                        <input type="checkbox" 
                               value="${account.id}" 
                               onchange="toggleAccountSelection(${account.id})"
                               ${selectedAccountIdSet.has(account.id) ? 'checked' : ''}>
                    </td>
                    <td style="font-weight: 600;">${account.username}</td>
                    <td>${sellerName}</td>
                    <td>
                        <span style="display: inline-block; padding: 2px 8px; 
                                   background: ${accountTypeBadgeColor}; color: white; 
                                   border-radius: 4px; font-size: 12px;">
                            ${accountTypeDisplay}
                        </span>
                    </td>
                    <td>${formatDate(account.created_at)}</td>
                    <td>
                        <button onclick="openEditAccountModal(${account.id})" 
                                style="font-size: 12px; padding: 4px 8px; 
                                       background: #007bff; color: white; 
                                       border: none; border-radius: 3px; cursor: pointer;">
                            설정
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log('[AccountManager] 테이블 렌더링 완료');
        renderAccountPagination(totalPages);

    } catch (error) {
        console.error('[AccountManager] 테이블 렌더링 중 오류:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px; color: red;">
                    계정 목록 표시 중 오류가 발생했습니다.
                </td>
            </tr>
        `;
    }
}


// ===== 페이지네이션 렌더링 =====
function renderAccountPagination(totalPages) {
    let paginationDiv = document.getElementById('accountPagination');
    
    if (!paginationDiv) {
        const tableContainer = document.querySelector('#accountManagementSection .product-table').parentElement;
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'accountPagination';
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
            <button class="page-btn ${i === currentAccountPage ? 'active' : ''}" 
                    onclick="goToAccountPage(${i})"
                    style="padding: 6px 12px; margin: 0 4px; border: 1px solid #ccc;
                           background: ${i === currentAccountPage ? '#007bff' : '#f9f9f9'};
                           color: ${i === currentAccountPage ? 'white' : '#333'};
                           border-radius: 4px; cursor: pointer;">
                ${i}
            </button>
        `;
    }
    paginationDiv.innerHTML = html;
}

// ===== 페이지 이동 함수 =====
function goToAccountPage(page) {
    currentAccountPage = page;
    renderAccountTable(filteredAccountList);
}
// ===== index.html의 계정관리 테이블 헤더도 수정 필요 =====
// index.html에서 accountManagementSection 부분의 테이블 헤더를 다음과 같이 수정:
/*
<thead>
    <tr>
        <th><input type="checkbox" onclick="toggleAllCheckboxes(this)"></th>
        <th>아이디</th>
        <th>입점사명</th>
        <th>계정유형</th>
        <th>계정 생성일자</th>
        <th>설정</th>
    </tr>
</thead>
*/

// ===== 계정 검색 =====
function searchAccounts() {
    const searchInput = document.getElementById('accountSearchInput');
    const keyword = searchInput.value.trim().toLowerCase();
    
    if (!keyword) {
        filteredAccountList = [...accountList];
    } else {
        filteredAccountList = accountList.filter(account => {
            if (account.username.toLowerCase().includes(keyword)) {
                return true;
            }
            
            const seller = sellersForAccount.find(s => s.id === account.seller_id);
            if (seller && seller.name.toLowerCase().includes(keyword)) {
                return true;
            }
            
            if (account.type === 'admin' && '관리자'.includes(keyword)) {
                return true;
            }
            
            if (account.type === 'seller' && '입점사'.includes(keyword)) {
                return true;
            }
            
            return false;
        });
    }
    
    renderAccountTable(filteredAccountList);
    
    if (keyword && filteredAccountList.length === 0) {
        alert('검색 결과가 없습니다.');
    }
}

// ===== 계정 선택 토글 =====
function toggleAccountSelection(accountId) {
    if (selectedAccountIdSet.has(accountId)) {
        selectedAccountIdSet.delete(accountId);
    } else {
        selectedAccountIdSet.add(accountId);
    }
}

// ===== 전체 선택/해제 =====
function toggleAllCheckboxes(checkbox) {
    const checkboxes = document.querySelectorAll('#accountTableBody input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        const accountId = parseInt(cb.value);
        if (checkbox.checked) {
            selectedAccountIdSet.add(accountId);
        } else {
            selectedAccountIdSet.delete(accountId);
        }
    });
}

// ===== 계정 생성 모달 열기 =====
function openCreateAccountModal() {
    tempSelectedSellerForAccount = null;
    
    const modalHTML = `
        <div style="padding: 20px;">
            <h3 style="margin-bottom: 20px;">새 계정 생성</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">아이디 *</label>
                <input type="text" id="newAccountUsername" 
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                       placeholder="아이디를 입력하세요">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">비밀번호 *</label>
                <input type="password" id="newAccountPassword" 
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                       placeholder="비밀번호를 입력하세요">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">계정 유형 *</label>
                <select id="newAccountType" onchange="onAccountTypeChange()"
                        style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="">선택하세요</option>
                    <option value="admin">관리자</option>
                    <option value="seller">입점사</option>
                </select>
            </div>
            
            <div id="sellerSelectDiv" style="margin-bottom: 15px; display: none;">
                <label style="display: block; margin-bottom: 5px;">입점사 선택 *</label>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="selectedSellerName" 
                           style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                           placeholder="입점사를 선택하세요" readonly>
                    <button onclick="openSellerSelectModalForAccount()" 
                            style="padding: 8px 15px; background: #007bff; color: white; border: none; border-radius: 4px;">
                        선택
                    </button>
                </div>
            </div>
            
            <p style="color: #666; font-size: 12px; margin-top: 10px;">
                * 표시는 필수 입력 항목입니다.
            </p>
        </div>
    `;
    
    const footerHTML = `
        <button onclick="createAccount()" style="background: #28a745; color: white;">생성</button>
        <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
    `;
    
    window.openModal({
        title: '계정 생성',
        bodyHTML: modalHTML,
        footerHTML: footerHTML
    });
    
    setTimeout(() => {
        document.getElementById('newAccountUsername')?.focus();
    }, 100);
}

// ===== 계정 유형 변경시 처리 =====
function onAccountTypeChange() {
    const accountType = document.getElementById('newAccountType')?.value || 
                       document.getElementById('editAccountType')?.value;
    const sellerDiv = document.getElementById('sellerSelectDiv') || 
                     document.getElementById('editSellerSelectDiv');
    
    if (sellerDiv) {
        if (accountType === 'seller') {
            sellerDiv.style.display = 'block';
        } else {
            sellerDiv.style.display = 'none';
            tempSelectedSellerForAccount = null;
            const sellerNameInput = document.getElementById('selectedSellerName') || 
                                   document.getElementById('editSelectedSellerName');
            if (sellerNameInput) {
                sellerNameInput.value = '';
            }
        }
    }
}

// ===== 입점사 선택 모달 열기 (계정용) =====
function openSellerSelectModalForAccount(isEdit = false) {
    const sellersHTML = sellersForAccount.map(seller => `
        <div style="display: flex; justify-content: space-between; align-items: center; 
                    padding: 10px; border-bottom: 1px solid #eee;">
            <span>${seller.name}</span>
            <button onclick="selectSellerForAccount(${seller.id}, '${seller.name}', ${isEdit})" 
                    style="padding: 5px 10px; background: #007bff; color: white; 
                           border: none; border-radius: 4px; font-size: 12px;">
                선택
            </button>
        </div>
    `).join('');
    
    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'accountSellerSelectModalBackdrop';
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
                <h4 style="margin: 0;">입점사 선택</h4>
                <button onclick="closeSellerSelectModalForAccount()" 
                        style="background: none; border: none; font-size: 20px; cursor: pointer;">✕</button>
            </div>
            
            <div style="padding: 15px;">
                <input type="text" id="accountSellerSearchInput" 
                       placeholder="입점사명 검색" 
                       onkeyup="filterSellersForAccount()"
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; 
                              border-radius: 4px; margin-bottom: 10px;">
            </div>
            
            <div id="accountSellerListContainer" style="flex: 1; overflow-y: auto; padding: 0 15px;">
                ${sellersHTML}
            </div>
            
            <div style="padding: 15px; border-top: 1px solid #ddd; text-align: right;">
                <button onclick="closeSellerSelectModalForAccount()" 
                        style="padding: 8px 15px; background: #6c757d; color: white; 
                               border: none; border-radius: 4px;">
                    닫기
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalBackdrop);
}

// ===== 입점사 검색 필터 (계정용) =====
function filterSellersForAccount() {
    const searchInput = document.getElementById('accountSellerSearchInput');
    const keyword = searchInput.value.trim().toLowerCase();
    
    const filteredSellers = keyword 
        ? sellersForAccount.filter(s => s.name.toLowerCase().includes(keyword))
        : sellersForAccount;
    
    const isEdit = document.getElementById('editAccountUsername') !== null;
    
    const sellersHTML = filteredSellers.map(seller => `
        <div style="display: flex; justify-content: space-between; align-items: center; 
                    padding: 10px; border-bottom: 1px solid #eee;">
            <span>${seller.name}</span>
            <button onclick="selectSellerForAccount(${seller.id}, '${seller.name}', ${isEdit})" 
                    style="padding: 5px 10px; background: #007bff; color: white; 
                           border: none; border-radius: 4px; font-size: 12px;">
                선택
            </button>
        </div>
    `).join('');
    
    const container = document.getElementById('accountSellerListContainer');
    if (container) {
        container.innerHTML = filteredSellers.length > 0 ? sellersHTML : 
            '<div style="text-align: center; padding: 20px; color: #666;">검색 결과가 없습니다.</div>';
    }
}

// ===== 입점사 선택 (계정용) =====
function selectSellerForAccount(sellerId, sellerName, isEdit = false) {
    tempSelectedSellerForAccount = { id: sellerId, name: sellerName };
    
    const sellerNameInput = isEdit 
        ? document.getElementById('editSelectedSellerName')
        : document.getElementById('selectedSellerName');
    
    if (sellerNameInput) {
        sellerNameInput.value = sellerName;
    }
    
    closeSellerSelectModalForAccount();
}

// ===== 입점사 선택 모달 닫기 (계정용) =====
function closeSellerSelectModalForAccount() {
    const modal = document.getElementById('accountSellerSelectModalBackdrop');
    if (modal) {
        modal.remove();
    }
}

// ===== 계정 생성 =====
async function createAccount() {
    const username = document.getElementById('newAccountUsername').value.trim();
    const password = document.getElementById('newAccountPassword').value.trim();
    const accountType = document.getElementById('newAccountType').value;
    
    if (!username) {
        alert('아이디를 입력해주세요.');
        document.getElementById('newAccountUsername').focus();
        return;
    }
    
    if (!password) {
        alert('비밀번호를 입력해주세요.');
        document.getElementById('newAccountPassword').focus();
        return;
    }
    
    if (!accountType) {
        alert('계정 유형을 선택해주세요.');
        return;
    }
    
    if (accountType === 'seller' && !tempSelectedSellerForAccount) {
        alert('입점사를 선택해주세요.');
        return;
    }
    
    try {
        const accountData = {
            username: username,
            password: password,
            type: accountType,
            seller_id: accountType === 'seller' ? tempSelectedSellerForAccount.id : null
        };
        
        const newAccount = await window.API.accounts.create(accountData);
        
        alert(`계정 "${newAccount.username}"이(가) 성공적으로 생성되었습니다.`);
        
        window.closeModal();
        await loadAccountsData();
        
    } catch (error) {
        console.error('[AccountManager] 계정 생성 실패:', error);
        alert('계정 생성에 실패했습니다: ' + (error.message || '알 수 없는 오류'));
    }
}

// ===== 계정 수정 모달 열기 (개선됨) =====
async function openEditAccountModal(accountId) {
    editingAccountId = accountId;
    
    try {
        const account = accountList.find(a => a.id === accountId);
        if (!account) {
            alert('계정 정보를 찾을 수 없습니다.');
            return;
        }
        
        const seller = sellersForAccount.find(s => s.id === account.seller_id);
        tempSelectedSellerForAccount = seller ? { id: seller.id, name: seller.name } : null;
        
        const modalHTML = `
            <div style="padding: 20px;">
                <h3 style="margin-bottom: 20px;">계정 설정</h3>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">아이디</label>
                    <input type="text" id="editAccountUsername" 
                           value="${account.username}"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; 
                                  border-radius: 4px; background: #f5f5f5;"
                           readonly disabled>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">새 비밀번호 (변경시에만 입력)</label>
                    <input type="password" id="editAccountPassword" 
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                           placeholder="변경하려면 새 비밀번호를 입력하세요">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">계정 유형</label>
                    <select id="editAccountType" onchange="onAccountTypeChange()"
                            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <option value="admin" ${account.type === 'admin' ? 'selected' : ''}>관리자</option>
                        <option value="seller" ${account.type === 'seller' ? 'selected' : ''}>입점사</option>
                    </select>
                </div>
                
                <div id="editSellerSelectDiv" style="margin-bottom: 15px; ${account.type === 'seller' ? '' : 'display: none;'}">
                    <label style="display: block; margin-bottom: 5px;">입점사</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="editSelectedSellerName" 
                               value="${seller ? seller.name : ''}"
                               style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                               placeholder="입점사를 선택하세요" readonly>
                        <button onclick="openSellerSelectModalForAccount(true)" 
                                style="padding: 8px 15px; background: #007bff; color: white; 
                                       border: none; border-radius: 4px;">
                            선택
                        </button>
                    </div>
                </div>
                
                <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                    <p style="margin: 0; color: #6c757d; font-size: 12px;">
                        계정 ID: ${account.id}<br>
                        현재 유형: ${account.type === 'admin' ? '관리자' : '입점사'}<br>
                        생성일: ${formatDate(account.created_at)}
                    </p>
                </div>
            </div>
        `;
        
        const footerHTML = `
            <button onclick="updateAccount()" style="background: #007bff; color: white;">수정</button>
            <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
        `;
        
        window.openModal({
            title: '계정 설정',
            bodyHTML: modalHTML,
            footerHTML: footerHTML
        });
        
    } catch (error) {
        console.error('[AccountManager] 계정 정보 조회 실패:', error);
        alert('계정 정보를 불러오는데 실패했습니다.');
    }
}

// ===== 계정 수정 =====
async function updateAccount() {
    const newPassword = document.getElementById('editAccountPassword').value.trim();
    const accountType = document.getElementById('editAccountType').value;
    
    if (accountType === 'seller' && !tempSelectedSellerForAccount) {
        alert('입점사를 선택해주세요.');
        return;
    }
    
    try {
        const updateData = {
            type: accountType,
            seller_id: accountType === 'seller' ? tempSelectedSellerForAccount.id : null
        };
        
        if (newPassword) {
            updateData.password = newPassword;
        }
        
        const updatedAccount = await window.API.accounts.update(editingAccountId, updateData);
        
        alert('계정 정보가 수정되었습니다.');
        
        window.closeModal();
        await loadAccountsData();
        
    } catch (error) {
        console.error('[AccountManager] 계정 수정 실패:', error);
        alert('계정 수정에 실패했습니다: ' + (error.message || '알 수 없는 오류'));
    }
}

// ===== 선택된 계정 삭제 =====
async function deleteSelectedAccounts() {
    if (selectedAccountIdSet.size === 0) {
        alert('삭제할 계정을 선택해주세요.');
        return;
    }
    
    const currentUser = await window.API.getCurrentUser();
    const currentUsername = currentUser?.username;
    
    const accountsToDelete = filteredAccountList.filter(a => selectedAccountIdSet.has(a.id));
    
    const deletingSelf = accountsToDelete.some(a => a.username === currentUsername);
    if (deletingSelf) {
        alert('현재 로그인한 계정은 삭제할 수 없습니다.');
        return;
    }
    
    const accountNames = accountsToDelete.map(a => a.username);
    
    const confirmMsg = `다음 계정을 삭제하시겠습니까?\n\n${accountNames.join('\n')}\n\n` +
                      `⚠️ 삭제된 계정은 복구할 수 없습니다.`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const accountId of selectedAccountIdSet) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/accounts/${accountId}`, {
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
        }
    }
    
    let resultMsg = '';
    if (successCount > 0) {
        resultMsg += `${successCount}개 계정이 삭제되었습니다.`;
    }
    if (failCount > 0) {
        resultMsg += `\n${failCount}개 계정 삭제 실패`;
    }
    
    if (resultMsg) {
        alert(resultMsg);
    }
    
    selectedAccountIdSet.clear();
    await loadAccountsData();
}

// ===== 유틸리티 함수 =====
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// 전역 함수로 노출
window.searchAccounts = searchAccounts;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.toggleAccountSelection = toggleAccountSelection;
window.openCreateAccountModal = openCreateAccountModal;
window.onAccountTypeChange = onAccountTypeChange;
window.openSellerSelectModalForAccount = openSellerSelectModalForAccount;
window.filterSellersForAccount = filterSellersForAccount;
window.selectSellerForAccount = selectSellerForAccount;
window.closeSellerSelectModalForAccount = closeSellerSelectModalForAccount;
window.createAccount = createAccount;
window.openEditAccountModal = openEditAccountModal;
window.updateAccount = updateAccount;
window.deleteSelectedAccounts = deleteSelectedAccounts;
window.goToAccountPage = goToAccountPage;