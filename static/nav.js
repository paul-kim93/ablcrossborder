// nav.js - URL 해시 기반 네비게이션
let isNavigating = false;
document.addEventListener("DOMContentLoaded", async function () {
  
  await loadAndDisplayUserInfo();
  
  // 사용자 권한 확인 후 버튼 표시
  try {
    const user = await window.API.getCurrentUser();
    if (user.type === 'admin') {
      const uploadBtn = document.getElementById('uploadExcelBtn');
      const uploadHint = document.getElementById('uploadHint');
      
      if (uploadBtn) {
        uploadBtn.style.display = 'block';
        uploadBtn.style.width = '100%';
        uploadBtn.style.marginBottom = '8px';
      }
      if (uploadHint) {
        uploadHint.style.display = 'block';
      }
    } else {
      // 입점사는 업로드 힌트도 숨김
      const uploadHint = document.getElementById('uploadHint');
      if (uploadHint) {
        uploadHint.style.display = 'none';
      }
    }
    const statsRefreshMenu = document.getElementById('menu-stats-refresh');
      if (user.type === 'admin' && statsRefreshMenu) {
        statsRefreshMenu.style.display = 'block';
      }
  } catch (error) {
    console.error('권한 확인 실패:', error);
  }

  const btnUploadOrders = document.getElementById("btnUploadOrders");
  const fileInputOrders = document.getElementById("fileInputOrders");
  
  // 업로드 버튼 클릭시 → 숨겨진 파일 input 클릭
  if (btnUploadOrders && fileInputOrders) {
    btnUploadOrders.addEventListener("click", function() {
      fileInputOrders.click();  // 이게 핵심! 파일 선택창을 엽니다
    });
  }
  
  // ===== 제품관리 하위 메뉴 토글 =====
  const productToggle  = document.getElementById("menu-product-toggle");
  const productSubmenu = document.getElementById("product-submenu");
  if (productToggle && productSubmenu) {
    productToggle.addEventListener("click", function () {
      productSubmenu.classList.toggle("show");
    });
  }

  // ===== 섹션 참조 (서브페이지) =====
  const productListSection       = document.getElementById("productListSection");       // 판매중인 제품
  const orderSummarySection      = document.getElementById("orderSummarySection");      // 주문서 요약
  const sellerListSection        = document.getElementById("sellerListSection");        // 입점사별 판매현황
  const accountManagementSection = document.getElementById("accountManagementSection"); // 계정관리

  // ===== 섹션 참조 (개요/판매현황 그룹) =====
  const dashboardSections = Array.from(document.querySelectorAll(".dashboard-section"));
  const subpageIdSet = new Set([
    "productListSection",
    "orderSummarySection",
    "sellerListSection",
    "accountManagementSection",
  ]);
  const overviewSections = dashboardSections.filter(
    (el) => !subpageIdSet.has(el.id || "")
  );

  // 상단 필터 탭
  const filterTabs = document.getElementById("filterTabs");

  // ===== 메뉴 참조 =====
  const menuOverview = document.getElementById("menu-overview");   // 판매현황
  const menuProducts = document.getElementById("menu-products");   // 제품관리 > 판매중인 제품
  const menuOrders   = document.getElementById("menu-orders");     // 제품관리 > 주문서 요약
  const menuSellers  = document.getElementById("menu-sellers");    // 입점사별 판매현황
  const menuAccount  = document.getElementById("menu-account");    // 계정관리
  const menuSettings = document.getElementById("menu-settings");   // 설정
  const menuStatsRefresh = document.getElementById("menu-stats-refresh");  // 통계 최신화 추가

  let isUploading = false;

    fileInputOrders.addEventListener("change", async (e) => {
      // 중복 업로드 방지
      if (isUploading) {
          console.log('이미 업로드 진행 중...');
          return;
      }
      
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      
      isUploading = true;  //
      
      // 오버레이 요소들
      const overlay = document.getElementById('uploadOverlay');
      const uploadStatus = document.getElementById('uploadStatus');
      const uploadDetails = document.getElementById('uploadDetails');
      
      // 각 단계 프로그레스 요소
      const uploadProgress = document.getElementById('uploadProgress');
      const parseProgress = document.getElementById('parseProgress');
      const statsProgress = document.getElementById('statsProgress');
      
      // 퍼센트 표시 요소
      const uploadPercent = document.getElementById('upload-percent');
      const parsePercent = document.getElementById('parse-percent');
      const statsPercent = document.getElementById('stats-percent');
      
      // 아이콘 요소
      const step1Icon = document.getElementById('step1Icon');
      const step2Icon = document.getElementById('step2Icon');
      const step3Icon = document.getElementById('step3Icon');
      
      // 초기화
      overlay.style.display = 'flex';
      uploadProgress.style.width = '0%';
      parseProgress.style.width = '0%';
      statsProgress.style.width = '0%';
      uploadPercent.textContent = '0%';
      parsePercent.textContent = '0%';
      statsPercent.textContent = '0%';
      uploadStatus.textContent = '파일 업로드 시작...';
      uploadDetails.classList.remove('show');
      
      // 아이콘 초기화
      step1Icon.textContent = '⏳';
      step2Icon.textContent = '⏳';
      step3Icon.textContent = '⏳';
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
          // === 단계 1: 파일 업로드 ===
          step1Icon.textContent = '🔄';
          uploadStatus.textContent = '📤 파일을 서버로 전송 중...';
          
          const xhr = new XMLHttpRequest();
          
          // 업로드 진행률 추적
          xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                  const percent = Math.round((e.loaded / e.total) * 100);
                  uploadProgress.style.width = percent + '%';
                  uploadPercent.textContent = percent + '%';
                  
                  if (percent === 100) {
                      step1Icon.textContent = '✅';
                      uploadStatus.textContent = '📊 서버에서 데이터 처리 중...';
                      
                      // === 단계 2: 데이터 파싱 (시뮬레이션) ===
                      step2Icon.textContent = '🔄';
                      let parsePercent = 0;
                      const parseInterval = setInterval(() => {
                          parsePercent += Math.random() * 15;
                          if (parsePercent > 100) parsePercent = 100;
                          
                          parseProgress.style.width = parsePercent + '%';
                          document.getElementById('parse-percent').textContent = Math.round(parsePercent) + '%';
                          
                          if (parsePercent >= 100) {
                              clearInterval(parseInterval);
                              step2Icon.textContent = '✅';
                              
                              // === 단계 3: 통계 계산 (시뮬레이션) ===
                              step3Icon.textContent = '🔄';
                              uploadStatus.textContent = '📈 통계 데이터 계산 중...';
                              let statsPercent = 0;
                              const statsInterval = setInterval(() => {
                                  statsPercent += Math.random() * 20;
                                  if (statsPercent > 100) statsPercent = 100;
                                  
                                  statsProgress.style.width = statsPercent + '%';
                                  document.getElementById('stats-percent').textContent = Math.round(statsPercent) + '%';
                                  
                                  if (statsPercent >= 100) {
                                      clearInterval(statsInterval);
                                      step3Icon.textContent = '✅';
                                      uploadStatus.textContent = '✨ 업로드 중 잠시만 기다려주세요!';
                                  }
                              }, 200);
                          }
                      }, 300);
                  }
              }
          });
          
          // Promise로 감싸기
          const uploadPromise = new Promise((resolve, reject) => {
              xhr.onload = function() {
                  if (xhr.status === 200) {
                      resolve(JSON.parse(xhr.responseText));
                  } else {
                      reject(new Error('Upload failed'));
                  }
              };
              
              xhr.onerror = function() {
                  reject(new Error('Network error'));
              };
          });
          
          // 요청 시작
          xhr.open('POST', `${window.API_BASE_URL}/upload/orders`);
          xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
          xhr.send(formData);
          
          // 응답 대기
          const result = await uploadPromise;
          
          // 모든 프로그레스 100%로 설정
          uploadProgress.style.width = '100%';
          parseProgress.style.width = '100%';
          statsProgress.style.width = '100%';
          uploadPercent.textContent = '100%';
          parsePercent.textContent = '100%';
          statsPercent.textContent = '100%';
          
          // 업로드 성공
          if (result.success) {
              document.querySelector('.upload-modal').classList.add('success');
              document.querySelector('.upload-icon').textContent = '✅';
              uploadStatus.textContent = '🎉 업로드 완료!';
              
              // 상세 결과 표시
              uploadDetails.innerHTML = `
                  <div><strong>처리 결과:</strong></div>
                  <div>• 전체 행: ${result.stats.total_rows}건</div>
                  <div>• 跨境 주문: ${result.stats.cross_border_rows}건</div>
                  <div>• 신규 주문: ${result.stats.new_orders}건</div>
                  <div>• 업데이트: ${result.stats.updated_orders}건</div>
                  <div>• 신규 아이템: ${result.stats.new_items}건</div>
              `;
              uploadDetails.classList.add('show');
              
              // 2초 후 닫기
              setTimeout(() => {
                  overlay.style.display = 'none';
                  location.reload();
              }, 2000);
              
          } else {
              throw new Error(result.detail || result.message);
          }
          
      } catch (error) {
          console.error('업로드 오류:', error);
          document.querySelector('.upload-modal').classList.add('error');
          document.querySelector('.upload-icon').textContent = '❌';
          uploadStatus.textContent = '업로드 실패: ' + error.message;
          
          // 에러시 프로그레스바 빨간색으로
          uploadProgress.style.background = 'linear-gradient(90deg, #f44336 0%, #da190b 100%)';
          parseProgress.style.background = 'linear-gradient(90deg, #f44336 0%, #da190b 100%)';
          statsProgress.style.background = 'linear-gradient(90deg, #f44336 0%, #da190b 100%)';
          
          setTimeout(() => {
              overlay.style.display = 'none';
              alert('업로드 중 오류가 발생했습니다: ' + error.message);
          }, 3000);
       } finally {
          fileInputOrders.value = '';
          isUploading = false;  // 업로드 완료
      }
  });
  

  // ===== 표시/숨김 유틸 =====
  function showEls(els)  { els.forEach((el) => { if (el) el.style.display = "block"; }); }
  function hideEls(els)  { els.forEach((el) => { if (el) el.style.display = "none";  }); }

  function hideAllSubpages() {
    hideEls([productListSection, orderSummarySection, sellerListSection, accountManagementSection].filter(Boolean));
  }
  function hideAllOverview() {
    hideEls(overviewSections);
    // TOP5 랭킹 숨김 추가
    const rankingsSection = document.getElementById('rankingsSection');
    if (rankingsSection) rankingsSection.style.display = "none";
}
  function showOverviewOnly() {
    hideAllSubpages();
    showEls(overviewSections);
    if (filterTabs) filterTabs.style.display = "flex";
    // TOP5 랭킹 표시 추가
    const rankingsSection = document.getElementById('rankingsSection');
    if (rankingsSection) rankingsSection.style.display = "block";
}
  function showSubpageOnly(el) {
    hideAllOverview();
    hideAllSubpages();
    if (el) el.style.display = "block";
    if (filterTabs) filterTabs.style.display = "none";
  }

// ======================================================
  // 공용 모달 유틸 (모달 틀은 index.html의 #modalRoot 사용)
  // ======================================================
  const modalRoot   = document.getElementById("modalRoot");
  const modalTitle  = document.getElementById("modalTitle");
  const modalBody   = document.getElementById("modalBody");
  const modalFooter = document.getElementById("modalFooter");

  function _existsModal() {
    return modalRoot && modalTitle && modalBody && modalFooter;
  }

  // 외부(다른 js)에서도 쓰도록 window에 바인딩
  window.openModal = function ({ title = "", bodyHTML = "", footerHTML = "" } = {}) {
    if (!_existsModal()) {
      console.warn("modalRoot not found in DOM.");
      return;
    }
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    modalFooter.innerHTML = footerHTML;
    modalRoot.style.display = "block";
  };

  window.closeModal = function () {
    if (!_existsModal()) return;
    modalRoot.style.display = "none";
    // 내용 초기화(선택)
    modalTitle.textContent = "";
    modalBody.innerHTML = "";
    modalFooter.innerHTML = "";

     // 설정 모달 닫을 때 해시 정리
    if (window.location.hash === '#settings') {
        window.location.hash = 'overview';
    }
  };

  // ===== 비밀번호 변경 관련 함수들 =====
function openPasswordChangeModal() {
    const modalHTML = `
        <div style="padding: 20px;">
            <h3 style="margin-bottom: 20px;">비밀번호 변경</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">현재 비밀번호</label>
                <input type="password" id="currentPassword" 
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                       placeholder="현재 비밀번호를 입력하세요">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">새 비밀번호</label>
                <input type="password" id="newPassword" 
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                       placeholder="새 비밀번호를 입력하세요">
                <small style="color: #666;">최소 6자 이상 입력하세요</small>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">새 비밀번호 확인</label>
                <input type="password" id="confirmPassword" 
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                       placeholder="새 비밀번호를 다시 입력하세요">
            </div>
            
            <div id="passwordError" style="color: #dc3545; font-size: 14px; margin-top: 10px; display: none;"></div>
        </div>
    `;
    
    const footerHTML = `
        <button onclick="changePassword()" style="background: #007bff; color: white;">변경</button>
        <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
    `;
    
    window.openModal({
        title: '계정 설정',
        bodyHTML: modalHTML,
        footerHTML: footerHTML
    });
}

async function changePassword() {
    const currentPw = document.getElementById('currentPassword').value;
    const newPw = document.getElementById('newPassword').value;
    const confirmPw = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('passwordError');
    
    if (!currentPw || !newPw || !confirmPw) {
        errorDiv.textContent = '모든 필드를 입력해주세요.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPw.length < 6) {
        errorDiv.textContent = '새 비밀번호는 최소 6자 이상이어야 합니다.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPw !== confirmPw) {
        errorDiv.textContent = '새 비밀번호가 일치하지 않습니다.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (currentPw === newPw) {
        errorDiv.textContent = '현재 비밀번호와 새 비밀번호가 동일합니다.';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('current_password', currentPw);
        formData.append('new_password', newPw);
        
        const response = await fetch(`${window.API_BASE_URL}/change-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('비밀번호가 성공적으로 변경되었습니다.\n다시 로그인해주세요.');
            window.closeModal();
            localStorage.removeItem('token');
            window.location.href = '/';
        } else {
            errorDiv.textContent = result.detail || '비밀번호 변경에 실패했습니다.';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('비밀번호 변경 오류:', error);
        errorDiv.textContent = '서버 오류가 발생했습니다.';
        errorDiv.style.display = 'block';
    }
}

window.openPasswordChangeModal = openPasswordChangeModal;
window.changePassword = changePassword;



  // ===== 페이지 네비게이션 함수 (URL 해시 업데이트 포함) =====
  function navigateToPage(pageId) {
    // 중복 네비게이션 방지
    if (isNavigating) {
        console.log('이미 네비게이션 중...');
        return;
    }
    isNavigating = true;
    
    // 모든 메뉴에서 active 클래스 제거
    document.querySelectorAll('.nav-menu').forEach(menu => {
      menu.classList.remove('active');
    });

    switch(pageId) {
      case 'overview':
        showOverviewOnly();
        if (menuOverview) menuOverview.classList.add('active');
        window.location.hash = 'overview';
         // 판매현황 데이터 로드
    if (typeof loadDashboardSummary === 'function') {
        loadDashboardSummary();
    }
    if (typeof loadChartData === 'function') {
        loadChartData('monthly');
    }
    if (typeof loadRankings === 'function') {
        loadRankings();
    }
    if (typeof loadLastMonthStats === 'function') {
        loadLastMonthStats();  // 전월 통계 추가
    }
    break;
      
      case 'products':
        showSubpageOnly(productListSection);
        if (menuProducts) menuProducts.classList.add('active');
        window.location.hash = 'products';
        // 제품 서브메뉴 열기
        if (productSubmenu) productSubmenu.classList.add('show');
        break;
      
  case 'orders':
    showSubpageOnly(orderSummarySection);
    if (menuOrders) menuOrders.classList.add('active');
    window.location.hash = 'orders';
    if (productSubmenu) productSubmenu.classList.add('show');
    // 주문 데이터 자동 로드
    if (typeof loadOrdersData === 'function') {
        setTimeout(() => loadOrdersData(), 100);  // 약간의 딜레이 추가
    }
    break;
      
      case 'sellers':
        showSubpageOnly(sellerListSection);
        if (menuSellers) menuSellers.classList.add('active');
        window.location.hash = 'sellers';
        // 입점사 데이터 로드 (sellerList.js의 함수 호출)
        if (typeof loadSellersData === 'function') {
          loadSellersData();
        }
        break;
      
      case 'accounts':
        showSubpageOnly(accountManagementSection);
        if (menuAccount) menuAccount.classList.add('active');
        window.location.hash = 'accounts';
        // 계정 데이터 로드 (accountManager.js의 함수 호출)
        if (typeof loadAccountsData === 'function') {
          loadAccountsData();
        }
        break;
      
      case 'settings':
    openPasswordChangeModal();  // 함수 호출만!
    window.location.hash = 'overview';  // 설정 후 overview로 돌아가기
    break;
      
    case 'stats-refresh':
    if (typeof openStatsRefreshModal === 'function') {
      openStatsRefreshModal();
    }
    window.location.hash = 'overview';
    break;

     default:
        // 기본값: 판매현황
        showOverviewOnly();
        if (menuOverview) menuOverview.classList.add('active');
        window.location.hash = 'overview';
    }
    
    // 네비게이션 완료
    setTimeout(() => {
        isNavigating = false;
    }, 100);
}

  // ===== 메뉴 클릭 핸들러 =====
  if (menuOverview) {
    menuOverview.addEventListener("click", () => navigateToPage('overview'));
  }

  if (menuProducts) {
    menuProducts.addEventListener("click", () => navigateToPage('products'));
  }

  if (menuOrders) {
    menuOrders.addEventListener("click", () => navigateToPage('orders'));
  }

  if (menuSellers) {
    menuSellers.addEventListener("click", () => navigateToPage('sellers'));
  }

  if (menuAccount) {
    menuAccount.addEventListener("click", () => navigateToPage('accounts'));
  }

  if (menuSettings) {
    menuSettings.addEventListener("click", () => navigateToPage('settings'));
  }

  if (menuStatsRefresh) {
    menuStatsRefresh.addEventListener("click", () => navigateToPage('stats-refresh'));
  }
  // ===== URL 해시 변경 감지 =====
  function handleHashChange() {
    const hash = window.location.hash.slice(1); // # 제거
    
    if (hash) {
      navigateToPage(hash);
    } else {
      // 해시가 없으면 기본 페이지로
      navigateToPage('overview');
    }
  }

  // ===== 브라우저 뒤로가기/앞으로가기 처리 =====
  window.addEventListener('hashchange', handleHashChange);

  // ===== 초기 페이지 로드 =====
  // URL 해시가 있으면 해당 페이지로, 없으면 overview로
  const initialHash = window.location.hash.slice(1);
  if (initialHash) {
    navigateToPage(initialHash);
  } else {
    navigateToPage('overview');
  }

  

// ESC로 닫기 - 가장 위의 모달부터 닫기
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        // 1. 먼저 서브 모달들 확인
        const sellerModal = document.getElementById('sellerSelectModalBackdrop');
        const accountSellerModal = document.getElementById('accountSellerSelectModalBackdrop');
        const productFilterModal = document.getElementById('productModal');
        
        // 서브 모달이 있으면 그것만 닫기
        if (sellerModal) {
            sellerModal.remove();
            return;  // 여기서 중단!
        }
        if (accountSellerModal) {
            accountSellerModal.remove();
            return;  // 여기서 중단!
        }
        if (productFilterModal && productFilterModal.style.display === 'block') {
            productFilterModal.style.display = 'none';
            return;  // 여기서 중단!
        }
        
        // 2. 서브 모달이 없을 때만 메인 모달 닫기
        if (modalRoot && modalRoot.style.display === "block") {
            window.closeModal();
        }
    }
});
      // 🔴 사용자 정보 로드 함수 추가
async function loadAndDisplayUserInfo() {
    try {
        const user = await window.API.getCurrentUser();
        
        let displayName = '';
        
        if (user.type === 'admin') {
            displayName = '관리자 계정';
        } else if (user.type === 'seller' && user.seller_id) {
            try {
                const sellers = await window.API.sellers.list();
                const seller = sellers.find(s => s.id === user.seller_id);
                displayName = seller ? seller.name : '입점사 미지정';
            } catch (error) {
                displayName = '입점사 정보 로드 실패';
            }
        } else {
            displayName = '계정 타입 미지정';
        }
        
        const userDisplayElement = document.getElementById('userDisplayName');
        if (userDisplayElement) {
            userDisplayElement.innerHTML = `
                <span style="font-size: 13px;">👤</span> ${displayName}
            `;
        }
        
        window.currentUserInfo = {
            type: user.type,
            username: user.username,
            sellerId: user.seller_id,
            displayName: displayName
        };
        
    } catch (error) {
        console.error('사용자 정보 로드 실패:', error);
        const userDisplayElement = document.getElementById('userDisplayName');
        if (userDisplayElement) {
            userDisplayElement.innerHTML = `
                <span style="color: #ff6b6b;">정보 로드 실패</span>
            `;
        }
    }
}

window.loadAndDisplayUserInfo = loadAndDisplayUserInfo;
});

